import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { userRoles } from '@/constants/data';
import { logKpiEvent } from './events';
import { customKpiDeleteBlockReason } from './transforms';
import {
  CUSTOM_KPI_VALUE_TYPES,
  type CreateCustomKpiResult,
  type CustomKpiUsage,
  type CustomKpiValueType,
  type KpiValueType,
} from './types';

export interface CustomKpiCaller {
  userId: string;
  organizationId: string;
  userRole: number;
}

// Creating and deactivating org custom KPIs is a customer-admin action, gated on
// the client "Admin" role (clientSupervisor; clientAdmin is "Manager"). Internal
// PostSig roles are deliberately excluded — this is customer-facing
// authorization. Enforced only here: the writes below run through the service
// role, so inv_kpi RLS carries no role logic (20260720140000).
export const ADMIN_ROLES: ReadonlySet<number> = new Set([
  userRoles.clientSupervisor,
]);

// Editing a KPI's value is a Manager-and-above action. It was open to every
// investor user until a penetration test showed a read-only account writing
// through it (PSK-1986); definitions stay narrower, on ADMIN_ROLES above.
export const VALUE_EDIT_ROLES: ReadonlySet<number> = new Set([
  userRoles.clientAdmin,
  userRoles.clientSupervisor,
]);

const createSchema = z.object({
  label: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  valueType: z.enum(CUSTOM_KPI_VALUE_TYPES),
  isFlow: z.boolean().optional(),
});

const valueSchema = z
  .object({
    companyId: z.number().int(),
    publicId: z.uuid(),
    periodYear: z.number().int().min(2000).max(2100),
    periodQuarter: z.number().int().min(1).max(4).nullable(),
    periodMonth: z.number().int().min(1).max(12).nullable().optional(),
    value: z.string(),
  })
  .refine((v) => v.periodMonth == null || v.periodQuarter == null, {
    message: 'a KPI value is quarterly or monthly, never both',
    path: ['periodMonth'],
  });

export type CreateCustomKpiInput = z.infer<typeof createSchema>;
export type SetKpiValueInput = z.infer<typeof valueSchema>;

export async function createCustomKpi(
  input: CreateCustomKpiInput,
  caller: CustomKpiCaller,
): Promise<CreateCustomKpiResult> {
  if (!ADMIN_ROLES.has(caller.userRole)) {
    return { error: 'You do not have permission to add custom KPIs.' };
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { error: 'Please complete all required fields.' };
  const v = parsed.data;

  const { userId, organizationId } = caller;
  // Service role: authorization (role) and tenancy (organization_id) are
  // enforced above from the server-derived caller, so inv_kpi RLS stays free of
  // role logic. organization_id is never taken from client input.
  const supabase = createServiceClient();

  // Custom KPIs are org-wide now: organization_id set, code left NULL.
  const { data, error } = await supabase
    .from('inv_kpi')
    .insert({
      organization_id: organizationId,
      label: v.label,
      category: v.category,
      value_type: v.valueType,
      is_flow: v.isFlow ?? false,
      created_by: userId,
    })
    .select('public_id')
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      return { error: 'A custom KPI with that name already exists.' };
    }
    logger.error({ error, organizationId }, 'Failed to create custom KPI');
    return { error: 'Failed to create the custom KPI.' };
  }

  return { publicId: data.public_id };
}

function parseValue(
  valueType: KpiValueType,
  raw: string,
):
  | { clear: true }
  | { error: string }
  | { numeric: number | null; text: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { clear: true };
  if (valueType === 'text' || valueType === 'textarea') {
    return { numeric: null, text: trimmed };
  }
  const cleaned = trimmed.replace(/[^0-9.-]/g, '');
  const numeric = Number(cleaned);
  if (cleaned === '' || !Number.isFinite(numeric))
    return { error: 'Enter a number.' };
  return { numeric, text: null };
}

// Investor-authored value for a KPI cell (standard or custom) at any
// granularity. Upserts an 'investor'-origin inv_kpi_value; a blank value clears
// it. The value wins over any portco-submitted value for the same cell on
// display. Monthly cells are the same rows document extraction writes, so an
// edit here replaces the extracted figure — and a later run of that extraction
// would replace it back.
export async function setKpiValue(
  input: SetKpiValueInput,
  caller: CustomKpiCaller,
): Promise<{ ok: true } | { error: string }> {
  if (!VALUE_EDIT_ROLES.has(caller.userRole)) {
    return { error: 'You do not have permission to edit KPI values.' };
  }

  const parsed = valueSchema.safeParse(input);
  if (!parsed.success) return { error: 'Invalid value.' };
  const v = parsed.data;

  const { userId, organizationId } = caller;
  const supabase = await createClient();

  // RLS exposes global (organization_id NULL) and this org's KPIs; resolve the id
  // + value type. A DB trigger pins the value's KPI to global-or-same-org.
  const { data: kpi } = await supabase
    .from('inv_kpi')
    .select('id, value_type, is_active, label')
    .eq('public_id', v.publicId)
    .maybeSingle();
  if (!kpi || !kpi.is_active) return { error: 'KPI not found.' };

  const parsedValue = parseValue(kpi.value_type as KpiValueType, v.value);
  if ('error' in parsedValue) return { error: parsedValue.error };

  const periodMonth = v.periodMonth ?? null;

  // Capture the cell's prior state (both origins) before the destructive
  // upsert/delete so the audit event records what was DISPLAYED before/after —
  // investor precedence with portco fallback, matching the table. Without the
  // portco fallback, the first correction of a submitted value logs a null
  // "before".
  let readQuery = supabase
    .from('inv_kpi_value')
    .select('origin, value_numeric, value_text')
    .eq('kpi_id', kpi.id)
    .eq('company_id', v.companyId)
    .eq('period_year', v.periodYear);
  readQuery =
    v.periodQuarter == null
      ? readQuery.is('period_quarter', null)
      : readQuery.eq('period_quarter', v.periodQuarter);
  readQuery =
    periodMonth == null
      ? readQuery.is('period_month', null)
      : readQuery.eq('period_month', periodMonth);
  const { data: priorRows, error: priorError } = await readQuery;
  const scalarOf = (
    row:
      | { value_numeric: number | null; value_text: string | null }
      | undefined,
  ): number | string | null =>
    row ? (row.value_numeric ?? row.value_text ?? null) : null;
  const priorInvestor = priorRows?.find((r) => r.origin === 'investor');
  const priorPortco = priorRows?.find((r) => r.origin === 'portco');

  if ('clear' in parsedValue) {
    let deleteQuery = supabase
      .from('inv_kpi_value')
      .delete()
      .eq('kpi_id', kpi.id)
      .eq('company_id', v.companyId)
      .eq('period_year', v.periodYear)
      .eq('origin', 'investor');
    deleteQuery =
      v.periodQuarter == null
        ? deleteQuery.is('period_quarter', null)
        : deleteQuery.eq('period_quarter', v.periodQuarter);
    deleteQuery =
      periodMonth == null
        ? deleteQuery.is('period_month', null)
        : deleteQuery.eq('period_month', periodMonth);
    const { error } = await deleteQuery;
    if (error) {
      logger.error(
        { error, publicId: v.publicId },
        'Failed to clear KPI value',
      );
      return { error: 'Failed to clear the value.' };
    }
  } else {
    const { error } = await supabase.from('inv_kpi_value').upsert(
      {
        organization_id: organizationId,
        company_id: v.companyId,
        kpi_id: kpi.id,
        period_year: v.periodYear,
        period_quarter: v.periodQuarter,
        period_month: periodMonth,
        origin: 'investor',
        value_numeric: parsedValue.numeric,
        value_text: parsedValue.text,
        created_by: userId,
      },
      {
        onConflict:
          'kpi_id,company_id,period_year,period_quarter,period_month,origin',
      },
    );
    if (error) {
      logger.error({ error, publicId: v.publicId }, 'Failed to save KPI value');
      return { error: 'Failed to save the value.' };
    }
  }

  // Clearing removes only the investor row, so the displayed "after" falls
  // back to any portco-submitted value rather than empty.
  const previousValue: number | string | null =
    scalarOf(priorInvestor) ?? scalarOf(priorPortco);
  const newValue: number | string | null =
    'clear' in parsedValue
      ? scalarOf(priorPortco)
      : (parsedValue.numeric ?? parsedValue.text ?? null);

  // Skip the audit event when the prior read failed: we can't trust
  // previousValue, and recording a wrong before/after is worse than no event.
  if (priorError) {
    logger.error(
      { error: priorError, publicId: v.publicId },
      'Failed to read prior KPI value; skipping audit event',
    );
  } else if (previousValue !== newValue) {
    await logKpiEvent({
      companyId: v.companyId,
      organizationId,
      actorUserId: userId,
      eventType: 'kpi_value_edited',
      payload: {
        kpiId: kpi.id,
        label: kpi.label,
        periodYear: v.periodYear,
        periodQuarter: v.periodQuarter,
        periodMonth,
        previousValue,
        newValue,
      },
    });
  }

  return { ok: true };
}

async function resolveCustomKpiId(
  publicId: string,
  organizationId: string,
): Promise<number | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('inv_kpi')
    .select('id')
    .eq('public_id', publicId)
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    logger.error({ error, publicId }, 'Failed to resolve custom KPI');
    return null;
  }
  return data?.id ?? null;
}

export async function getCustomKpiUsage(
  publicId: string,
  caller: CustomKpiCaller,
): Promise<CustomKpiUsage | { error: string }> {
  if (!ADMIN_ROLES.has(caller.userRole)) {
    return { error: 'You do not have permission to remove custom KPIs.' };
  }

  const { organizationId } = caller;
  const kpiId = await resolveCustomKpiId(publicId, organizationId);
  if (kpiId == null) return { error: 'Custom KPI not found.' };

  const supabase = createServiceClient();
  const [values, portcoValues, pendingRequests] = await Promise.all([
    supabase
      .from('inv_kpi_value')
      .select('id', { count: 'exact', head: true })
      .eq('kpi_id', kpiId)
      .eq('organization_id', organizationId),
    supabase
      .from('inv_kpi_value')
      .select('id', { count: 'exact', head: true })
      .eq('kpi_id', kpiId)
      .eq('organization_id', organizationId)
      .eq('origin', 'portco'),
    supabase
      .from('inv_reporting_request_kpi')
      .select('id, inv_reporting_request!inner(status)', {
        count: 'exact',
        head: true,
      })
      .eq('kpi_id', kpiId)
      .eq('organization_id', organizationId)
      .eq('inv_reporting_request.status', 'sent'),
  ]);

  const failed = [values, portcoValues, pendingRequests].find((r) => r.error);
  if (failed) {
    logger.error(
      { error: failed.error, publicId },
      'Failed to read custom KPI usage',
    );
    return { error: 'Could not check where this KPI is used.' };
  }

  return {
    valueCount: values.count ?? 0,
    portcoValueCount: portcoValues.count ?? 0,
    pendingRequestCount: pendingRequests.count ?? 0,
  };
}

export async function deactivateCustomKpi(
  publicId: string,
  caller: CustomKpiCaller,
): Promise<{ ok: true } | { error: string }> {
  if (!ADMIN_ROLES.has(caller.userRole)) {
    return { error: 'You do not have permission to remove custom KPIs.' };
  }

  const usage = await getCustomKpiUsage(publicId, caller);
  if ('error' in usage) return usage;
  const blocked = customKpiDeleteBlockReason(usage);
  if (blocked) return { error: blocked };

  const { organizationId } = caller;

  const supabase = createServiceClient();

  const { data: deactivated, error } = await supabase
    .from('inv_kpi')
    .update({ is_active: false })
    .eq('public_id', publicId)
    .eq('organization_id', organizationId)
    .select('id');

  if (error) {
    logger.error({ error, publicId }, 'Failed to remove custom KPI');
    return { error: 'Failed to remove the custom KPI.' };
  }
  if (!deactivated?.length) return { error: 'Custom KPI not found.' };

  return { ok: true };
}
