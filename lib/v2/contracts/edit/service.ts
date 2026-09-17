import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { getUserMetadata } from '@/data/users';
import { AuthenticationError, AuthorizationError } from '@/lib/errors';
import { EDITABLE_TEXT_FIELDS } from './utils';

// ============================================================================
// Read Operations (v2 services)
// ============================================================================

/**
 * Check if a contract has any version history (has been edited).
 */
export async function hasContractVersions(
  contractId: number,
): Promise<boolean> {
  const supabase = createServiceClient();

  const { count, error } = await supabase
    .from('contract_versions')
    .select('*', { count: 'exact', head: true })
    .eq('contract_id', contractId);

  if (error) {
    logger.error({ contractId, error }, 'Failed to check contract versions');
    return false;
  }

  return (count ?? 0) > 0;
}

/**
 * Fetch the original version (version 1) of a contract.
 * Returns the editable text fields from the first version snapshot, plus the
 * `metadata` column so JSON-backed fields (Contract No./Invoice No.) show their
 * pre-edit value too.
 */
export async function getOriginalContractVersion(
  contractId: number,
): Promise<Record<string, unknown> | null> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }

  const supabase = createServiceClient();

  // Fetch version 1 (the first snapshot, which contains the original state)
  const { data: version, error } = await supabase
    .from('contract_versions')
    .select('*')
    .eq('contract_id', contractId)
    .eq('version_id', 1)
    .single();

  if (error || !version) {
    logger.warn({ contractId, error }, 'No original version found');
    return null;
  }

  // Verify the contract belongs to the user's organization
  if (version.organization_id !== userMetadata.organizationId) {
    throw new AuthorizationError(
      'Contract does not belong to your organization',
    );
  }

  // Extract the editable text fields from the version
  const originalFields: Record<string, unknown> = {};
  const versionRecord = version as Record<string, unknown>;
  for (const fieldKey of EDITABLE_TEXT_FIELDS) {
    if (fieldKey in versionRecord) {
      originalFields[fieldKey] = versionRecord[fieldKey] as string | null;
    }
  }

  if ('metadata' in versionRecord) {
    originalFields.metadata = versionRecord.metadata;
  }

  return originalFields;
}

/**
 * Original product state for a single vendor_products_details row.
 * `fees` is the value from before the first edit (version 1 snapshot).
 */
export interface OriginalProductDetail {
  id: number;
  fees: number | null;
}

/**
 * Original product users state for a single vendor_products_users row.
 */
export interface OriginalProductUser {
  id: number;
  number_of_users: number | null;
}

/**
 * Original vendor_products state for a single row (delivery_method_id).
 */
export interface OriginalVendorProduct {
  id: number;
  delivery_method_id: number | null;
}

export interface OriginalProductVersions {
  vendorProductsDetails: OriginalProductDetail[];
  vendorProductsUsers: OriginalProductUser[];
  vendorProducts: OriginalVendorProduct[];
  // undefined = no contract_versions v1 exists, do not overlay
  // null      = v1 exists but original had no sales_tax_details, overlay with empty
  // Array     = v1 exists with original data, overlay with this value
  salesTaxDetails:
    | Array<{ year: number; sales_tax: string | number }>
    | null
    | undefined;
}

/**
 * Reconstruct the original (pre-edit) state of all product fields for a contract
 * by reading the version 1 snapshot from each product version table.
 *
 * For each edited row the version table stores the *pre-edit* values in its
 * snapshot columns, so version_id=1 for a given record is the oldest snapshot
 * (i.e. the state before any edits were made to that record).
 *
 * If a record has no version rows it was never edited — the live row is already
 * the original.
 */
export async function getOriginalProductVersions(
  contractId: number,
): Promise<OriginalProductVersions | null> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }

  const supabase = createServiceClient();

  // Verify the contract belongs to the user's organization
  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select(
      'organization_id, vendor_products_details(id, fees), vendor_products_users(id, number_of_users), other_attributes',
    )
    .eq('id', contractId)
    .single();

  if (contractError || !contract) {
    logger.warn(
      { contractId, error: contractError },
      'Contract not found when fetching original product versions',
    );
    return null;
  }

  if (contract.organization_id !== userMetadata.organizationId) {
    throw new AuthorizationError(
      'Contract does not belong to your organization',
    );
  }

  // ── vendor_products_details ──────────────────────────────────────────────
  // Fetch the earliest version (version_id=1) for every detail row on this contract.
  // The snapshot stores the state *before* the edit, so this is the original fee.
  const { data: detailVersions } = await supabase
    .from('vendor_products_details_versions')
    .select('vendor_products_details_id, fees, version_id')
    .eq('contract_id', contractId)
    .eq('version_id', 1);

  // Build a map: detail_id → original fees (from version snapshot)
  const detailOriginalFees = new Map<number, number | null>();
  for (const v of detailVersions ?? []) {
    detailOriginalFees.set(v.vendor_products_details_id, v.fees);
  }

  // For each live detail row, use the original snapshot fee if one exists,
  // otherwise the live fee is already the original.
  const vendorProductsDetails: OriginalProductDetail[] = (
    (contract.vendor_products_details as Array<{
      id: number;
      fees: number | null;
    }>) ?? []
  ).map((d) => ({
    id: d.id,
    fees: detailOriginalFees.has(d.id) ? detailOriginalFees.get(d.id)! : d.fees,
  }));

  // ── vendor_products_users ────────────────────────────────────────────────
  const { data: usersVersions } = await supabase
    .from('vendor_products_users_versions')
    .select('vendor_products_users_id, number_of_users, version_id')
    .eq('contract_id', contractId)
    .eq('version_id', 1);

  const usersOriginalCount = new Map<number, number | null>();
  for (const v of usersVersions ?? []) {
    usersOriginalCount.set(
      v.vendor_products_users_id,
      v.number_of_users ?? null,
    );
  }

  const vendorProductsUsers: OriginalProductUser[] = (
    (contract.vendor_products_users as Array<{
      id: number;
      number_of_users: number | null;
    }>) ?? []
  ).map((u) => ({
    id: u.id,
    number_of_users: usersOriginalCount.has(u.id)
      ? usersOriginalCount.get(u.id)!
      : u.number_of_users,
  }));

  // ── vendor_products (delivery_method_id) ────────────────────────────────
  // vendor_products rows are shared across contracts, so we look up version rows
  // via contract_id to scope to this contract's products only.
  const { data: productVersions } = await supabase
    .from('vendor_products_versions')
    .select('vendor_product_id, delivery_method_id, version_id')
    .eq('contract_id', contractId)
    .eq('version_id', 1);

  const productOriginalDelivery = new Map<number, number | null>();
  for (const v of productVersions ?? []) {
    productOriginalDelivery.set(
      v.vendor_product_id,
      v.delivery_method_id ?? null,
    );
  }

  // ── vendor_products (delivery method) ───────────────────────────────────
  const liveDetails =
    (contract.vendor_products_details as Array<{
      id: number;
      fees: number | null;
    }> | null) ?? [];
  const productIds = new Set<number>();
  const vendorProducts: OriginalVendorProduct[] = [];

  if (liveDetails.length > 0) {
    const { data: detailsWithProduct } = await supabase
      .from('vendor_products_details')
      .select('product_id, vendor_products(id, delivery_method_id)')
      .eq('contract_id', contractId);

    for (const d of detailsWithProduct ?? []) {
      const vp = d.vendor_products as {
        id: number;
        delivery_method_id: number | null;
      } | null;
      if (!vp || productIds.has(vp.id)) continue;
      productIds.add(vp.id);
      vendorProducts.push({
        id: vp.id,
        delivery_method_id: productOriginalDelivery.has(vp.id)
          ? productOriginalDelivery.get(vp.id)!
          : vp.delivery_method_id,
      });
    }
  }

  // ── sales_tax_details ────────────────────────────────────────────────────
  // Two save-path formats exist in contract_versions:
  //
  //  OLD format  changed_data = { fields: { "contracts_other_attributes:Y:sales_tax": { old, new, ... } }, changeCount }
  //    → The version snapshot may have been written AFTER the edit, so other_attributes on the
  //      version row already contains the new value. Use changed_data.fields[...].old directly.
  //
  //  NEW format  changed_data = { changeCount: N }  (no "fields" key)
  //    → Snapshot was written BEFORE the edit; other_attributes from version 1 is the true original.

  const { data: allVersionRows } = await supabase
    .from('contract_versions')
    .select('version_id, other_attributes, changed_data, organization_id')
    .eq('contract_id', contractId)
    .order('version_id', { ascending: true });

  const orgVersions = (allVersionRows ?? []).filter(
    (v) => v.organization_id === userMetadata.organizationId,
  );

  // Scan all versions for old-format sales_tax entries; keep the earliest per year
  type SalesTaxField = { old: string | number | null };
  const yearOriginals = new Map<number, string | number | null>();

  for (const v of orgVersions) {
    const fields = (v.changed_data as Record<string, unknown> | null)
      ?.fields as Record<string, unknown> | undefined;
    if (!fields) continue;
    for (const [key, raw] of Object.entries(fields)) {
      if (!/^contracts_other_attributes:\d+:sales_tax$/.test(key)) continue;
      const year = parseInt(key.split(':')[1], 10);
      if (!yearOriginals.has(year)) {
        yearOriginals.set(year, (raw as SalesTaxField).old ?? null);
      }
    }
  }

  let salesTaxDetails:
    | Array<{ year: number; sales_tax: string | number }>
    | null
    | undefined;

  if (yearOriginals.size > 0) {
    // Old format: reconstruct original from the earliest "old" value per year
    const entries = Array.from(yearOriginals.entries()).filter(
      ([, v]) => v !== null,
    );
    salesTaxDetails =
      entries.length > 0
        ? entries.map(([year, sales_tax]) => ({ year, sales_tax: sales_tax! }))
        : null;
  } else {
    // New format: read from version 1's other_attributes snapshot
    const version1 = orgVersions.find((v) => v.version_id === 1);
    if (version1) {
      const otherAttrs = version1.other_attributes as Record<
        string,
        unknown
      > | null;
      salesTaxDetails =
        ((otherAttrs?.invoice_fields as Record<string, unknown>)
          ?.sales_tax_details as Array<{
          year: number;
          sales_tax: string | number;
        }> | null) ?? null;
    } else {
      salesTaxDetails = undefined; // Contract has never been edited
    }
  }

  return {
    vendorProductsDetails,
    vendorProductsUsers,
    vendorProducts,
    salesTaxDetails,
  };
}

// ============================================================================
// Mutations are now Server Actions
// ============================================================================
// See: app/lib/contracts/edit-actions.ts
// - saveContractEdits()
// - revertContractField()
