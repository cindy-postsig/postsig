'use server';

import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { getUserMetadata } from '@/data/users';
import type { UserMetadata } from '@/constants/types';
import {
  DatabaseError,
  AuthenticationError,
  AuthorizationError,
} from '@/lib/errors';
import { defineAbilitiesFor } from '@postsig/toolkit';
import { isValidClientRole } from '@/lib/auth/roles';
import { getCacheService } from '@/app/lib/redis/cache-service';
import type {
  SaveEditsParams,
  SaveEditsResult,
  UnifiedFieldChange,
} from '@/lib/v2/contracts/edit/types';
import type { Json } from '@/database.types';
import {
  isFieldEditable,
  getEditableField,
  isJsonEditableTable,
  JSON_COLUMN_BY_TABLE,
  type EditableTable,
  type JsonEditableTable,
} from '@/lib/v2/contracts/edit/field-registry';
import {
  applyJsonPathChange,
  getValueAtJsonPath,
  type JsonRecord,
} from '@/lib/v2/contracts/edit/json-path';
import { getFieldDefinition } from '@/app/ui/contracts/contractFieldConfigs';
import { revalidatePath } from 'next/cache';

interface ValidatedEditContext {
  userMetadata: UserMetadata;
  supabase: ReturnType<typeof createServiceClient>;
  currentContract: Record<string, unknown>;
}

async function validateEditPermissions(
  contractId: number,
): Promise<ValidatedEditContext> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }

  if (!isValidClientRole(userMetadata.userRole)) {
    logger.warn(
      {
        userId: userMetadata.userId,
        userRole: userMetadata.userRole,
        contractId,
      },
      'Invalid user role for contract edit',
    );
    throw new AuthorizationError('Invalid user role');
  }

  const ability = defineAbilitiesFor({
    id: userMetadata.userId,
    roleId: userMetadata.userRole,
    organizationId: userMetadata.organizationId,
  });

  if (!ability.can('update', 'Contract')) {
    logger.warn(
      {
        userId: userMetadata.userId,
        userRole: userMetadata.userRole,
        contractId,
      },
      'User lacks update permission for contracts',
    );
    throw new AuthorizationError('Unauthorized: Cannot update contract');
  }

  const supabase = createServiceClient();

  const { data: currentContract, error: fetchError } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (fetchError || !currentContract) {
    logger.error(
      { contractId, error: fetchError },
      'Failed to fetch contract for edit',
    );
    throw new DatabaseError('Contract not found');
  }

  if (currentContract.organization_id !== userMetadata.organizationId) {
    throw new AuthorizationError(
      'Contract does not belong to your organization',
    );
  }

  return {
    userMetadata,
    supabase,
    currentContract: currentContract as Record<string, unknown>,
  };
}

async function createContractVersionRecord(
  context: ValidatedEditContext,
  contractId: number,
  changeCount: number,
  actor: 'user' | 'system',
): Promise<{ contractVersionId: number; versionId: number }> {
  const { userMetadata, supabase, currentContract } = context;

  const { data: maxVersionData, error: maxVersionError } = await supabase
    .from('contract_versions')
    .select('version_id')
    .eq('contract_id', contractId)
    .order('version_id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxVersionError) {
    logger.error(
      { contractId, error: maxVersionError },
      'Failed to get max version_id',
    );
    throw new DatabaseError('Failed to get version history');
  }

  const previousVersionId = maxVersionData?.version_id ?? null;
  const newVersionId = (previousVersionId ?? 0) + 1;

  if (previousVersionId !== null) {
    const { error: updatePrevError } = await supabase
      .from('contract_versions')
      .update({ valid_to: new Date().toISOString() })
      .eq('contract_id', contractId)
      .eq('version_id', previousVersionId);

    if (updatePrevError) {
      logger.error(
        { contractId, previousVersionId, error: updatePrevError },
        'Failed to update previous version valid_to',
      );
      throw new DatabaseError('Failed to close previous version');
    }
  }

  const {
    id: _id,
    created_at: _createdAt,
    ...contractFields
  } = currentContract;

  const versionSnapshot: Record<string, unknown> = {
    ...contractFields,
    contract_id: contractId,
    version_id: newVersionId,
    valid_from: new Date().toISOString(),
    valid_to: null,
    changed_data: { changeCount } as unknown as Json,
    created_by: userMetadata.userId,
    actor,
    comment: `Edited ${changeCount} field(s)`,
  };

  const insertedVersion = await insertContractVersionSnapshot(
    supabase,
    contractId,
    versionSnapshot,
  );

  return { contractVersionId: insertedVersion.id, versionId: newVersionId };
}

/**
 * Insert a contract_versions row, auto-healing around the contracts vs.
 * contract_versions column mirror drifting (e.g. a new contracts column that
 * has not yet been mirrored). On Postgres "undefined_column" (42703) we drop
 * the offending key and retry, then warn so the gap is observable.
 */
async function insertContractVersionSnapshot(
  supabase: ReturnType<typeof createServiceClient>,
  contractId: number,
  snapshot: Record<string, unknown>,
): Promise<{ id: number }> {
  const droppedColumns: string[] = [];
  let payload = snapshot;

  for (let attempt = 0; attempt < 50; attempt++) {
    const { data, error } = await supabase
      .from('contract_versions')
      .insert(payload as never)
      .select('id')
      .single();

    if (!error && data) {
      if (droppedColumns.length > 0) {
        logger.warn(
          { contractId, droppedColumns },
          'contract_versions is missing columns present on contracts; snapshot omitted them',
        );
      }
      return data;
    }

    const missingCol =
      error?.code === '42703'
        ? error.message.match(
            /column "([^"]+)" of relation "contract_versions" does not exist/i,
          )?.[1]
        : undefined;

    if (!missingCol || !(missingCol in payload)) {
      logger.error(
        { contractId, droppedColumns, error },
        'Failed to create version snapshot',
      );
      throw new DatabaseError('Failed to create version snapshot');
    }

    droppedColumns.push(missingCol);
    const { [missingCol]: _omitted, ...rest } = payload;
    payload = rest;
  }

  logger.error(
    { contractId, droppedColumns },
    'Gave up creating version snapshot after too many missing-column retries',
  );
  throw new DatabaseError('Failed to create version snapshot');
}

async function processContractChanges(
  context: ValidatedEditContext,
  contractId: number,
  changes: UnifiedFieldChange[],
): Promise<void> {
  const { supabase } = context;

  const updates: Record<string, unknown> = {};
  for (const change of changes) {
    if (!isFieldEditable('contracts', change.field)) {
      throw new AuthorizationError(`Field "${change.field}" is not editable`);
    }
    updates[change.field] = change.newValue;
  }

  const { error } = await supabase
    .from('contracts')
    .update(updates)
    .eq('id', contractId);

  if (error) {
    logger.error({ contractId, error }, 'Failed to update contract');
    throw new DatabaseError('Failed to update contract');
  }
}

async function processProductChanges(
  context: ValidatedEditContext,
  contractId: number,
  contractVersionId: number,
  table: EditableTable,
  changes: UnifiedFieldChange[],
): Promise<void> {
  const { supabase, userMetadata } = context;

  for (const change of changes) {
    if (!isFieldEditable(table, change.field)) {
      throw new AuthorizationError(
        `Field "${table}:${change.field}" is not editable`,
      );
    }

    const fieldDef = getEditableField(table, change.field);

    // Dynamic table access requires type assertion
    const { data: currentRecord, error: fetchError } = await (supabase as any)
      .from(table)
      .select('*')
      .eq('id', change.recordId)
      .single();

    if (fetchError || !currentRecord) {
      logger.error(
        { table, recordId: change.recordId, error: fetchError },
        'Failed to fetch record for edit',
      );
      throw new DatabaseError(`Record ${table}:${change.recordId} not found`);
    }

    // Create version snapshot if version table exists
    if (fieldDef?.versionTable) {
      // Get the max version_id for this record
      const idColumn = getVersionIdColumn(table);
      const { data: maxVersionData } = await (supabase as any)
        .from(fieldDef.versionTable)
        .select('version_id')
        .eq(idColumn, change.recordId)
        .order('version_id', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersionId = (maxVersionData?.version_id ?? 0) + 1;

      const versionData = buildVersionSnapshot(
        table,
        currentRecord,
        change,
        contractId,
        contractVersionId,
        userMetadata,
        nextVersionId,
      );

      const { error: snapshotError } = await (supabase as any)
        .from(fieldDef.versionTable)
        .insert(versionData);

      if (snapshotError) {
        logger.error(
          { table, recordId: change.recordId, error: snapshotError },
          'Failed to create version snapshot',
        );
      }
    }

    // Build update payload - only include updated_at for tables that have it
    const updatePayload: Record<string, unknown> = {
      [change.field]: change.newValue,
    };
    if (table !== 'vendor_products_details') {
      updatePayload.updated_at = new Date().toISOString();
    }

    const { error: updateError } = await (supabase as any)
      .from(table)
      .update(updatePayload)
      .eq('id', change.recordId);

    if (updateError) {
      logger.error(
        { table, recordId: change.recordId, error: updateError },
        'Failed to update record',
      );
      throw new DatabaseError(`Failed to update ${table}:${change.recordId}`);
    }
  }
}

/**
 * Apply changes that live inside one of the contracts JSON columns
 * (`other_attributes` or `metadata`) and write the column back once.
 */
async function processJsonColumnChanges(
  context: ValidatedEditContext,
  contractId: number,
  table: JsonEditableTable,
  changes: UnifiedFieldChange[],
): Promise<void> {
  const { supabase, currentContract } = context;
  const column = JSON_COLUMN_BY_TABLE[table];

  let json = (currentContract[column] as JsonRecord) || {};

  for (const change of changes) {
    json = applyJsonColumnChange(table, json, change);
  }

  const { error } = await supabase
    .from('contracts')
    .update({ [column]: json as unknown as Json })
    .eq('id', contractId);

  if (error) {
    logger.error({ contractId, column, error }, 'Failed to update JSON column');
    throw new DatabaseError(`Failed to update ${column}`);
  }
}

/**
 * Normalize a raw JSON value to the type the field is edited as, so the
 * "already has this value" check compares like with like.
 */
function resolveJsonCurrentValue(
  rawValue: unknown,
  valueType: string,
): string | number | null {
  if (rawValue === null || rawValue === undefined) return null;

  if (valueType === 'number') {
    return parseFloat(String(rawValue)) || null;
  }

  return String(rawValue).trim() || null;
}

/** Validate the field is editable, then write its value into the JSON column. */
function applyJsonColumnChange(
  table: JsonEditableTable,
  json: JsonRecord,
  change: UnifiedFieldChange,
): JsonRecord {
  const fieldDef = getEditableField(table, change.field);
  if (!fieldDef?.jsonPath) {
    throw new AuthorizationError(
      `Field "${table}:${change.field}" is not editable`,
    );
  }

  return applyJsonPathChange(
    json,
    fieldDef.jsonPath,
    fieldDef.valueType,
    change.recordId,
    change.newValue,
  );
}

function getVersionIdColumn(table: string): string {
  switch (table) {
    case 'vendor_products':
      return 'vendor_product_id';
    case 'vendor_products_details':
      return 'vendor_products_details_id';
    case 'vendor_products_users':
      return 'vendor_products_users_id';
    default:
      return 'id';
  }
}

function buildVersionSnapshot(
  table: string,
  currentRecord: Record<string, unknown>,
  change: UnifiedFieldChange,
  contractId: number,
  contractVersionId: number,
  userMetadata: UserMetadata,
  versionId: number,
): Record<string, unknown> {
  const base = {
    contract_id: contractId,
    contract_version_id: contractVersionId,
    version_id: versionId,
    valid_from: new Date().toISOString(),
    changed_data: {
      [change.field]: {
        old: change.oldValue,
        new: change.newValue,
      },
    } as unknown as Json,
    created_by: userMetadata.userId,
    organization_id: userMetadata.organizationId,
  };

  switch (table) {
    case 'vendor_products':
      return {
        ...base,
        vendor_product_id: change.recordId,
        vendor_id: currentRecord.vendor_id,
        name: currentRecord.name,
        product_code: currentRecord.product_code,
        delivery_method_id: currentRecord.delivery_method_id,
        updated_at: currentRecord.updated_at,
      };

    case 'vendor_products_details':
      return {
        ...base,
        vendor_products_details_id: change.recordId,
        product_id: currentRecord.product_id,
        fees: currentRecord.fees,
        n_users: currentRecord.n_users,
        year: currentRecord.year,
        user_id: currentRecord.user_id,
      };

    case 'vendor_products_users':
      return {
        ...base,
        vendor_products_users_id: change.recordId,
        product_id: currentRecord.product_id,
        number_of_users: currentRecord.number_of_users,
      };

    default:
      return base;
  }
}

async function logEditActivity(
  context: ValidatedEditContext,
  contractId: number,
  contractVersionId: number,
  versionId: number,
  changes: UnifiedFieldChange[],
): Promise<void> {
  const { supabase, userMetadata } = context;

  if (changes.length === 0) return;

  const changedFields = changes.map((change) => {
    const isContractField = change.table === 'contracts';
    const fieldDef = isContractField
      ? getFieldDefinition(change.field)
      : getEditableField(change.table, change.field);

    const normalizeValue = (
      val: string | number | boolean | null,
    ): string | number | null => {
      if (typeof val === 'boolean') return val ? 1 : 0;
      return val;
    };

    const field: {
      table: string;
      recordId: number;
      fieldKey: string;
      fieldTitle: string;
      oldValue: string | number | null;
      newValue: string | number | null;
      metadata?: { productName?: string; year?: number };
    } = {
      table: change.table,
      recordId: isContractField ? contractId : change.recordId,
      fieldKey: change.field,
      fieldTitle: fieldDef?.title || change.field,
      oldValue: normalizeValue(change.oldValue),
      newValue: normalizeValue(change.newValue),
    };

    if (!isContractField && change.context) {
      const metadata: { productName?: string; year?: number } = {};
      if (change.context.productName)
        metadata.productName = change.context.productName;
      if (change.context.year) metadata.year = change.context.year;
      if (Object.keys(metadata).length > 0) {
        field.metadata = metadata;
      }
    }

    return field;
  });

  const { error } = await supabase.from('activities').insert({
    contract_id: contractId,
    user_id: userMetadata.userId,
    activity_type: 'contract_edited',
    activity_data: {
      versionId,
      changeCount: changedFields.length,
      changedFields,
    },
  });

  if (error) {
    logger.warn({ contractId, error }, 'Failed to log edit activity');
  }
}

// =============================================================================
// Exported Server Actions
// =============================================================================

export async function saveEdits(
  params: SaveEditsParams,
): Promise<SaveEditsResult> {
  const { contractId, changes, actor = 'user' } = params;

  if (changes.length === 0) {
    return { success: true };
  }

  // Filter to only actual changes
  const actualChanges = changes.filter((c) => c.oldValue !== c.newValue);
  if (actualChanges.length === 0) {
    return { success: true };
  }

  try {
    const context = await validateEditPermissions(contractId);

    const { contractVersionId, versionId } = await createContractVersionRecord(
      context,
      contractId,
      actualChanges.length,
      actor,
    );

    // Group changes by table
    const changesByTable = new Map<EditableTable, UnifiedFieldChange[]>();
    for (const change of actualChanges) {
      const existing = changesByTable.get(change.table) ?? [];
      existing.push(change);
      changesByTable.set(change.table, existing);
    }

    // Process each table's changes
    for (const [table, tableChanges] of changesByTable) {
      if (table === 'contracts') {
        await processContractChanges(context, contractId, tableChanges);
      } else if (isJsonEditableTable(table)) {
        await processJsonColumnChanges(
          context,
          contractId,
          table,
          tableChanges,
        );
      } else {
        await processProductChanges(
          context,
          contractId,
          contractVersionId,
          table,
          tableChanges,
        );
      }
    }

    await logEditActivity(
      context,
      contractId,
      contractVersionId,
      versionId,
      actualChanges,
    );

    const cacheService = await getCacheService();
    await cacheService.invalidateOrganizationData(context.userMetadata);
    revalidatePath(`/contracts/${contractId}`);

    logger.info(
      { contractId, contractVersionId, changeCount: actualChanges.length },
      'Saved unified edits',
    );

    return { success: true, contractVersionId };
  } catch (error) {
    logger.error({ contractId, error }, 'Failed to save edits');

    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError ||
      error instanceof DatabaseError
    ) {
      return { success: false, error: error.message };
    }

    throw error;
  }
}

/**
 * Revert a single contract field to a previous value.
 */
export async function revertContractField(
  contractId: number,
  fieldKey: string,
  targetValue: string | null,
): Promise<SaveEditsResult> {
  try {
    // Validate field is editable
    if (!isFieldEditable('contracts', fieldKey)) {
      throw new AuthorizationError(`Field "${fieldKey}" is not editable`);
    }

    const context = await validateEditPermissions(contractId);
    const { userMetadata, supabase, currentContract } = context;

    const currentValue = currentContract[fieldKey] as string | null;

    if (currentValue === targetValue) {
      throw new DatabaseError('Field already has this value');
    }

    const fieldTitle = getFieldDefinition(fieldKey)?.title || fieldKey;

    // Update contract
    const { error: updateError } = await supabase
      .from('contracts')
      .update({
        [fieldKey]: targetValue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contractId);

    if (updateError) {
      logger.error(
        { contractId, fieldKey, error: updateError },
        'Failed to revert contract field',
      );
      throw new DatabaseError('Failed to revert field');
    }

    // Log activity
    const { error: activityError } = await supabase.from('activities').insert({
      contract_id: contractId,
      user_id: userMetadata.userId,
      activity_type: 'contract_field_reverted',
      activity_data: {
        fieldKey,
        fieldTitle,
        revertedFrom: currentValue,
        revertedTo: targetValue,
      },
    });

    if (activityError) {
      logger.warn(
        { contractId, error: activityError },
        'Failed to log contract revert activity',
      );
    }

    const cacheService = await getCacheService();
    await cacheService.invalidateOrganizationData(userMetadata);
    revalidatePath(`/contracts/${contractId}`);

    logger.info(
      { contractId, fieldKey, userId: userMetadata.userId },
      'Contract field reverted',
    );

    return { success: true };
  } catch (error) {
    logger.error(
      { contractId, fieldKey, error },
      'Failed to revert contract field',
    );

    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError ||
      error instanceof DatabaseError
    ) {
      return { success: false, error: error.message };
    }

    throw error;
  }
}

async function revertJsonColumnField(
  context: ValidatedEditContext,
  contractId: number,
  table: JsonEditableTable,
  recordId: number,
  fieldKey: string,
  targetValue: string | number | null,
): Promise<SaveEditsResult> {
  const { supabase, userMetadata, currentContract } = context;
  const column = JSON_COLUMN_BY_TABLE[table];

  const fieldDef = getEditableField(table, fieldKey);
  if (!fieldDef?.jsonPath) {
    throw new AuthorizationError(
      `Field "${table}:${fieldKey}" has no jsonPath config`,
    );
  }

  let json = (currentContract[column] as JsonRecord) || {};

  const rawValue = getValueAtJsonPath(json, fieldDef.jsonPath, recordId);
  const currentValue = resolveJsonCurrentValue(rawValue, fieldDef.valueType);

  if (currentValue === targetValue) {
    throw new DatabaseError('Field already has this value');
  }

  const change: UnifiedFieldChange = {
    table,
    recordId,
    field: fieldKey,
    oldValue: currentValue,
    newValue: targetValue,
  };

  json = applyJsonColumnChange(table, json, change);

  const { error } = await supabase
    .from('contracts')
    .update({ [column]: json as unknown as Json })
    .eq('id', contractId);

  if (error) {
    logger.error({ contractId, column, error }, 'Failed to revert JSON column');
    throw new DatabaseError('Failed to revert field');
  }

  await supabase.from('activities').insert({
    contract_id: contractId,
    user_id: userMetadata.userId,
    activity_type: 'product_field_reverted',
    activity_data: {
      table,
      recordId,
      fieldKey,
      fieldTitle: fieldDef.title,
      revertedFrom: currentValue,
      revertedTo: targetValue,
    },
  });

  const cacheService = await getCacheService();
  await cacheService.invalidateOrganizationData(userMetadata);
  revalidatePath(`/contracts/${contractId}`);

  return { success: true };
}

export async function revertProductField(
  contractId: number,
  table:
    | 'vendor_products_details'
    | 'vendor_products_users'
    | 'vendor_products'
    | JsonEditableTable,
  recordId: number,
  fieldKey: string,
  targetValue: string | number | null,
): Promise<SaveEditsResult> {
  try {
    if (!isFieldEditable(table, fieldKey)) {
      throw new AuthorizationError(
        `Field "${table}:${fieldKey}" is not editable`,
      );
    }

    const context = await validateEditPermissions(contractId);
    const { userMetadata, supabase } = context;

    if (isJsonEditableTable(table)) {
      return revertJsonColumnField(
        context,
        contractId,
        table,
        recordId,
        fieldKey,
        targetValue,
      );
    }

    let currentValue: number | null = null;
    let productName = 'Unknown Product';

    if (table === 'vendor_products_details') {
      const { data: record, error } = await supabase
        .from('vendor_products_details')
        .select('*, vendor_products(name)')
        .eq('id', recordId)
        .eq('contract_id', contractId)
        .single();

      if (error || !record) {
        throw new DatabaseError(
          'Record not found or does not belong to contract',
        );
      }
      currentValue = record[fieldKey as keyof typeof record] as number | null;
      productName =
        (record.vendor_products as { name?: string })?.name || productName;
    } else if (table === 'vendor_products_users') {
      const { data: record, error } = await supabase
        .from('vendor_products_users')
        .select('*, vendor_products(name)')
        .eq('id', recordId)
        .eq('contract_id', contractId)
        .single();

      if (error || !record) {
        throw new DatabaseError(
          'Record not found or does not belong to contract',
        );
      }
      currentValue = record[fieldKey as keyof typeof record] as number | null;
      productName =
        (record.vendor_products as { name?: string })?.name || productName;
    } else if (table === 'vendor_products') {
      const { data: record, error } = await supabase
        .from('vendor_products')
        .select('*, vendor_products_details!inner(contract_id)')
        .eq('id', recordId)
        .single();

      if (error || !record) {
        throw new DatabaseError('Record not found');
      }

      const belongsToContract = (
        record.vendor_products_details as { contract_id: number }[]
      )?.some((d) => d.contract_id === contractId);
      if (!belongsToContract) {
        throw new DatabaseError('Record does not belong to contract');
      }

      currentValue = record[fieldKey as keyof typeof record] as number | null;
      productName = record.name || productName;
    }

    if (currentValue === targetValue) {
      throw new DatabaseError('Field already has this value');
    }

    const fieldDef = getEditableField(table, fieldKey);
    const fieldTitle = fieldDef?.title || fieldKey;

    // Update record
    const updatePayload: Record<string, unknown> = { [fieldKey]: targetValue };
    if (table !== 'vendor_products_details') {
      updatePayload.updated_at = new Date().toISOString();
    }

    const { error: updateError } = await (
      supabase as ReturnType<typeof createServiceClient>
    )
      .from(table as 'vendor_products')
      .update(updatePayload)
      .eq('id', recordId);

    if (updateError) {
      logger.error(
        { table, recordId, error: updateError },
        'Failed to revert product field',
      );
      throw new DatabaseError('Failed to revert field');
    }

    // Log activity
    const { error: activityError } = await supabase.from('activities').insert({
      contract_id: contractId,
      user_id: userMetadata.userId,
      activity_type: 'product_field_reverted',
      activity_data: {
        table,
        recordId,
        productName,
        fieldKey,
        fieldTitle,
        revertedFrom: currentValue,
        revertedTo: targetValue,
      },
    });

    if (activityError) {
      logger.warn(
        { contractId, error: activityError },
        'Failed to log product revert activity',
      );
    }

    const cacheService = await getCacheService();
    await cacheService.invalidateOrganizationData(userMetadata);
    revalidatePath(`/contracts/${contractId}`);

    logger.info(
      { contractId, table, recordId, fieldKey, userId: userMetadata.userId },
      'Product field reverted',
    );

    return { success: true };
  } catch (error) {
    logger.error(
      { contractId, table, recordId, fieldKey, error },
      'Failed to revert product field',
    );

    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError ||
      error instanceof DatabaseError
    ) {
      return { success: false, error: error.message };
    }

    throw error;
  }
}
