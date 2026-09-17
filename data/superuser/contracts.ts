'use server';
import { cache } from 'react';
import { createClient } from '@/utils/supabase/service_server';
import _ from 'lodash';
import logger from '@/utils/pino';
import { PostgrestError } from '@supabase/supabase-js';
import {
  DatabaseError,
  AuthenticationError,
  AuthorizationError,
  ContractLineageInvariantError,
} from '@/lib/errors';
import { isArchivedStatus } from '@/lib/contracts/lineageNodes';
import { CONTRACT_OWNERS_EMBED } from '@/lib/v2/owners/embed';
import { CONTRACT_PRODUCT_CREDITS_EMBED } from '@/lib/v2/credits/embed';
import { getAllOrgUsers, getUserMetadata, getUserProfile } from '@/data/users';
import { normalizeEmail } from './_email';
import { getCacheService } from '@/app/lib/redis/cache-service';
import { unstable_noStore as noStore } from 'next/cache';
import { ITEMS_PER_PAGE } from '@/constants/data';
import {
  FetchContractsByUserRolesParams,
  FetchContractsByIdByUserRolesParams,
  FetchContractDocumentsByIdByUserRolesParams,
  FetchContractsPagesByUserRolesParams,
  FetchContractsByDateRangeByUserRolesParams,
  FetchRenewingContractsByUserRolesParams,
  BusinessGroup,
  ContractUser,
  OrgEmployee,
  UserMetadata,
} from '@/constants/types';
import { getBusinessGroupsByLeaf } from '@/lib/v2/org-units';
import { ContractRelationship } from '@/app/lib/definitions';
import {
  INVOICE_TYPE_IDS,
  UNEXECUTED_EXCLUDED_TYPE_IDS,
  typeIdInList,
} from '@/app/lib/constants';
import { extendSupabaseQueryByUserRole } from '@/data/utils';
import { fetchContractsById } from '@/app/lib/contracts/actions';
import {
  type ContractHierarchy,
  findContractInHierarchy,
  generateShortLabel,
  collectAllIdsFromHierarchy,
  findParentInHierarchy,
  extractAllChildContractIds,
  filterHierarchyByAccessibleContracts,
} from '@/lib/amendments/hierarchyUtils';
import {
  buildOrgHierarchyMap,
  findTopmostParent,
} from '@/lib/inventory/hierarchyUtils';
import {
  startOfMonth,
  startOfYear,
  endOfMonth,
  endOfYear,
  format,
  addMonths,
  subMonths,
  parse,
  parseISO,
} from 'date-fns';
import { Citation } from '@/constants/types';
import { Json, Database } from '@/database.types';
import { getCurrentVendorsByOriginalVendorIds } from '@/data/superuser/vendors';
import { logAlert } from '@/utils/logging/alert';
import { contractStatuses } from '@postsig/toolkit';

// Define a general type for contract items used in adaptation logic
// This helps in bypassing Supabase's ParserError type for complex queries
type ContractItemForAdaptation = {
  vendors?: any;
  vendor_id?: number | null;
  [key: string]: any; // Allows any other properties to ensure original contract structure is maintained
};

type PermissionLevel = Database['public']['Enums']['permission_level'];

/**
 * The only question the contract set asks of the version trail is whether a
 * product fee was ever hand-edited (`hasFeeOverrides`), so the embed carries a
 * key column instead of the full `changed_data` JSONB and the query filters the
 * embed down to fee edits. Pair the embed with FEE_OVERRIDE_VERSIONS_FILTER:
 * without the filter, an unfiltered narrow row would read as an override.
 */
const FEE_OVERRIDE_VERSIONS_EMBED =
  'vendor_products_details_versions (version_id)';

/**
 * Embedded-filter path for FEE_OVERRIDE_VERSIONS_EMBED, relative to the
 * `vendor_products_details` embed alias on the contracts root. `->` rather than
 * `->>` so a `{"fees": null}` edit still counts, matching the `!== undefined`
 * check the filter replaces. Embedded filters prune embed rows only — parent
 * contract rows are unaffected.
 */
const FEE_OVERRIDE_VERSIONS_FILTER =
  'vendor_products_details.vendor_products_details_versions.changed_data->fees';

/**
 * The parent contract embedded on every child relationship duplicates a whole
 * contract row per edge, and its product rows are the bulk of it. Only the
 * invoice reconciliation reads them, and the three boundaries it hands them
 * across — ParentProductRow (reports/transforms/invoices), SpendProductInput
 * (spend/contractInput) and FeeDigestProduct (spend/derivationKey) — declare
 * between them exactly these four columns plus `convertedFees`, a derived
 * stamp no embed ever carries. The parent's own columns stay wide: the same
 * reconciliation casts the raw embed to SpendContractInput unchecked, so the
 * resolver's column surface is not bounded by the type system there.
 */
const PARENT_PRODUCT_FIELDS = 'product_id, year, fees, one_time_only';

/**
 * Parent-side version rows ship full changed_data instead of the narrow
 * filtered shape: an embedded parent seeds the spend resolver, whose
 * hasFeeOverrides must suppress annual_increase compounding on hand-edited
 * fees, and no validated PostgREST filter path reaches this depth. Parents
 * per set are few, so the JSONB cost is bounded.
 */
const PARENT_FEE_OVERRIDE_VERSIONS_EMBED =
  'vendor_products_details_versions (changed_data)';

// This function is used in the inngest function uploadOpenAiFile
export async function insertContract(data: any) {
  const supabase = createClient();
  const { data: insertData, error } = await (supabase
    .from('contracts')
    .insert(data as any)
    .select() as any);
  if (error) throw error;
  return insertData;
}

export async function insertContractDoc(data: any) {
  const supabase = createClient();
  const { data: insertData, error } = await (supabase
    .from('contract_docs')
    .insert(data as any)
    .select() as any);
  if (error) throw error;
  return insertData;
}

/**
 * Fetches all contract relationships for an organization in a single query
 * This is used to optimize hierarchy processing by avoiding N+1 queries
 *
 * The `!inner` on the parent embed is load-bearing: without it PostgREST applies
 * `parent_contract.organization_id` to the embedded resource only, nulling it on
 * non-matching rows instead of dropping them — so this ran as a full-table fetch
 * on the service-role client.
 *
 * @param organizationId - The organization ID to fetch relationships for
 * @returns Array of contract relationships for the organization
 */
async function fetchAllRelationshipsForOrgImpl(
  organizationId: string,
): Promise<ContractRelationship[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contract_relationships')
    .select(
      '*, parent_contract:contracts!contract_relationships_parent_contract_id_fkey!inner(organization_id)',
    )
    .eq('parent_contract.organization_id', organizationId)
    .eq('active', true)
    .or('disabled.is.null,disabled.eq.false');

  if (error) {
    logger.error({ error, organizationId }, 'Error fetching org relationships');
    throw new DatabaseError('Failed to fetch relationships', error);
  }

  return data || [];
}

export const fetchAllRelationshipsForOrg = cache(
  fetchAllRelationshipsForOrgImpl,
);

/** One additional payer of an invoice, as the sidebar renders it. */
export interface BillingParent {
  id: number;
  typeName: string | null;
  productNames: string[];
  /** Drives the dimmed row; archived parents are shown, not hidden. */
  isArchived: boolean;
}

/**
 * The contract embed every billing-edge query selects: enough for a
 * name-and-products row plus the archived flag. `organization_id` is present
 * because the org filter rides this embed (`!inner` is load-bearing).
 */
const BILLING_CONTRACT_EMBED = `id, status, organization_id,
        contract_types ( name ),
        vendor_products_details ( vendor_products ( name ) )`;

interface BillingContractEmbed {
  id: number;
  status: string | null;
  contract_types: { name: string | null } | null;
  vendor_products_details: Array<{
    vendor_products: { name: string | null } | null;
  }> | null;
}

/** Flatten an embed row to the serializable shape the billing surfaces render. */
function toBillingSummary(contract: BillingContractEmbed): {
  id: number;
  typeName: string | null;
  productNames: string[];
  isArchived: boolean;
} {
  return {
    id: contract.id,
    typeName: contract.contract_types?.name ?? null,
    productNames: (contract.vendor_products_details ?? [])
      .map((detail) => detail.vendor_products?.name)
      .filter((name): name is string => name != null),
    isArchived: isArchivedStatus(contract.status),
  };
}

interface BillingParentRow {
  parent: BillingContractEmbed | null;
}

/**
 * Org-scoped billing parents, WITHOUT the viewer ACL — module-private so no
 * call site can render a contract the viewer's role is not allowed to see.
 * Use `fetchBillingParentsByUserRoles`.
 *
 * Qualifies edges exactly as the discrepancy report does (active, not
 * disabled), so the sidebar and the report agree on which parents are real.
 * `status` is selected but NOT filtered on: the report still counts an
 * archived parent's products, so hiding it here would put the two surfaces
 * in contradiction.
 *
 * The relationship row carries no organization_id; the org scope rides the
 * parent embed, and `!inner` is load-bearing for the same reason it is in
 * `fetchAllRelationshipsForOrg` above.
 */
async function fetchBillingParents(
  childContractId: number,
  organizationId: string,
): Promise<BillingParent[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contract_relationships')
    .select(
      `parent:contracts!contract_relationships_parent_contract_id_fkey!inner (
        ${BILLING_CONTRACT_EMBED}
      )`,
    )
    .eq('child_contract_id', childContractId)
    .eq('relationship_type', 'billing')
    .eq('active', true)
    .eq('parent.organization_id', organizationId)
    .or('disabled.is.null,disabled.eq.false');

  if (error) {
    logger.error(
      { error, childContractId, organizationId },
      'Error fetching billing parents',
    );
    throw new DatabaseError('Failed to fetch billing parents', error);
  }

  return ((data ?? []) as unknown as BillingParentRow[]).flatMap((row) =>
    row.parent ? [toBillingSummary(row.parent)] : [],
  );
}

/**
 * Ids among `ids` the viewer's role may see, via the same ACL extender the
 * full contract fetches use — the canonical access definition, applied to a
 * minimal id select instead of `fetchContractsByIdByUserRoles`'s dozen-embed
 * read. Errors throw: an ACL check that failed proves nothing about access,
 * and defaulting open would leak on exactly the failure path.
 */
async function accessibleContractIds(
  ids: number[],
  { userId, userRole, organizationId }: UserMetadata,
): Promise<Set<number>> {
  const supabase = createClient();

  const query = supabase.from('contracts').select('id').in('id', ids);
  const extendedQuery = await extendSupabaseQueryByUserRole(
    supabase,
    query,
    userId,
    userRole,
    organizationId,
  );
  const { data, error } = await extendedQuery;

  if (error) {
    logger.error({ error, ids }, 'Error checking contract accessibility');
    throw new DatabaseError('Failed to check contract accessibility', error);
  }

  return new Set((data ?? []).map((row: { id: number }) => row.id));
}

/**
 * Billing parents of one invoice, pruned to what the viewer may see. The
 * sidebar tree treats the role ACL as its permission fail-safe
 * (`filterHierarchyByAccessibleContracts`); a billing parent rendered without
 * the same check would hand an org member the name and products of a
 * contract the tree deliberately hides.
 */
export async function fetchBillingParentsByUserRoles({
  childContractId,
  userMetadata,
}: {
  childContractId: number;
  userMetadata: UserMetadata;
}): Promise<BillingParent[]> {
  const parents = await fetchBillingParents(
    childContractId,
    userMetadata.organizationId,
  );
  if (parents.length === 0) return parents;

  const accessible = await accessibleContractIds(
    parents.map((parent) => parent.id),
    userMetadata,
  );
  return parents.filter((parent) => accessible.has(parent.id));
}

/** One billing-linked invoice, keyed under its billing parent in the sidebar tree. */
export interface BillingChildInvoice {
  id: number;
  typeName: string | null;
  productNames: string[];
  /** Drives the dimmed row; archived children are shown, not hidden. */
  isArchived: boolean;
}

interface BillingChildRow {
  parent_contract_id: number;
  child: BillingContractEmbed | null;
}

/**
 * Org-scoped billing children of the given parents, WITHOUT the viewer ACL —
 * module-private for the same reason as `fetchBillingParents` above. Use
 * `fetchBillingChildrenByUserRoles`.
 *
 * Same edge qualification as `fetchBillingParents` (active, not disabled,
 * `'billing'` type), walked from the parent side: the relationship row carries
 * no organization_id, so the org scope rides the child embed and `!inner` is
 * load-bearing.
 */
async function fetchBillingChildren(
  parentContractIds: number[],
  organizationId: string,
): Promise<Array<{ parentContractId: number; invoice: BillingChildInvoice }>> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contract_relationships')
    .select(
      `parent_contract_id,
      child:contracts!contract_relationships_child_contract_id_fkey!inner (
        ${BILLING_CONTRACT_EMBED}
      )`,
    )
    .in('parent_contract_id', parentContractIds)
    .eq('relationship_type', 'billing')
    .eq('active', true)
    .eq('child.organization_id', organizationId)
    .or('disabled.is.null,disabled.eq.false');

  if (error) {
    logger.error(
      { error, parentContractIds, organizationId },
      'Error fetching billing children',
    );
    throw new DatabaseError('Failed to fetch billing children', error);
  }

  return ((data ?? []) as unknown as BillingChildRow[]).flatMap((row) =>
    row.child
      ? [
          {
            parentContractId: row.parent_contract_id,
            invoice: toBillingSummary(row.child),
          },
        ]
      : [],
  );
}

/**
 * Billing-linked invoices of the given tree contracts, pruned to what the
 * viewer may see, grouped by billing parent. Serializable record — this
 * crosses the RSC boundary. Same ACL rationale as
 * `fetchBillingParentsByUserRoles`: a billing child rendered without the role
 * check would leak a contract the tree deliberately hides.
 */
export async function fetchBillingChildrenByUserRoles({
  parentContractIds,
  userMetadata,
}: {
  parentContractIds: number[];
  userMetadata: UserMetadata;
}): Promise<Record<number, BillingChildInvoice[]>> {
  if (parentContractIds.length === 0) return {};

  const rows = await fetchBillingChildren(
    parentContractIds,
    userMetadata.organizationId,
  );
  if (rows.length === 0) return {};

  const accessible = await accessibleContractIds(
    Array.from(new Set(rows.map((row) => row.invoice.id))),
    userMetadata,
  );

  const byParent: Record<number, BillingChildInvoice[]> = {};
  for (const { parentContractId, invoice } of rows) {
    if (!accessible.has(invoice.id)) continue;
    (byParent[parentContractId] ??= []).push(invoice);
  }
  return byParent;
}

interface BillingParentRowBatch {
  child_contract_id: number;
  parent: BillingContractEmbed | null;
}

/**
 * Org-scoped billing parents of many invoices in one query, WITHOUT the
 * viewer ACL — module-private like `fetchBillingParents` above. Use
 * `fetchBillingParentsForContractsByUserRoles`. Same edge qualification and
 * `!inner` org scoping as the single-invoice query.
 */
async function fetchBillingParentsBatch(
  childContractIds: number[],
  organizationId: string,
): Promise<Array<{ childContractId: number; parent: BillingParent }>> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contract_relationships')
    .select(
      `child_contract_id,
      parent:contracts!contract_relationships_parent_contract_id_fkey!inner (
        ${BILLING_CONTRACT_EMBED}
      )`,
    )
    .in('child_contract_id', childContractIds)
    .eq('relationship_type', 'billing')
    .eq('active', true)
    .eq('parent.organization_id', organizationId)
    .or('disabled.is.null,disabled.eq.false');

  if (error) {
    logger.error(
      { error, childContractIds, organizationId },
      'Error fetching billing parents batch',
    );
    throw new DatabaseError('Failed to fetch billing parents batch', error);
  }

  return ((data ?? []) as unknown as BillingParentRowBatch[]).flatMap((row) =>
    row.parent
      ? [
          {
            childContractId: row.child_contract_id,
            parent: toBillingSummary(row.parent),
          },
        ]
      : [],
  );
}

/**
 * Billing parents of many invoices, pruned to what the viewer may see,
 * grouped by invoice. One edge query plus one ACL check regardless of how
 * many invoices a chain carries — the per-invoice variant above is for
 * single-contract surfaces like the sidebar's "Also billed under".
 */
export async function fetchBillingParentsForContractsByUserRoles({
  childContractIds,
  userMetadata,
}: {
  childContractIds: number[];
  userMetadata: UserMetadata;
}): Promise<Record<number, BillingParent[]>> {
  if (childContractIds.length === 0) return {};

  const rows = await fetchBillingParentsBatch(
    childContractIds,
    userMetadata.organizationId,
  );
  if (rows.length === 0) return {};

  const accessible = await accessibleContractIds(
    Array.from(new Set(rows.map((row) => row.parent.id))),
    userMetadata,
  );

  const byChild: Record<number, BillingParent[]> = {};
  for (const { childContractId, parent } of rows) {
    if (!accessible.has(parent.id)) continue;
    (byChild[childContractId] ??= []).push(parent);
  }
  return byChild;
}

async function adaptContractsWithCurrentVendorInfo<
  T extends ContractItemForAdaptation,
>(contracts: T[]): Promise<T[]> {
  if (!contracts || contracts.length === 0) {
    return contracts;
  }

  const originalVendorIds = Array.from(
    new Set<number>(
      contracts
        .map((contract) => contract.vendor_id as number)
        .filter((id): id is number => id != null),
    ),
  );

  if (originalVendorIds.length === 0) {
    return contracts;
  }

  const allCurrentVendorRecords =
    await getCurrentVendorsByOriginalVendorIds(originalVendorIds);

  if (!allCurrentVendorRecords) {
    return contracts;
  }

  return contracts.map((contract) => {
    if (contract.vendors && typeof contract.vendor_id === 'number') {
      const cvRecord = allCurrentVendorRecords.find(
        (cv: any) => cv.original_vendor_id === contract.vendor_id,
      );

      if (cvRecord) {
        const processedVendorInfo = {
          ...contract.vendors,
          id: cvRecord.current_vendor_id,
          name: cvRecord.current_vendor_name,
          domain: cvRecord.current_vendor_domain,
        };
        return {
          ...contract,
          vendors: processedVendorInfo,
          vendor_id: cvRecord.current_vendor_id,
        };
      }
    }
    return contract;
  });
}

interface ContractData {
  totalPages: number;
  totalContracts: number | null;
}

export async function fetchContractsPagesByUserRoles({
  query: searchQuery,
  userMetadata: { userId, userRole, organizationId },
  contractStatus,
  contractActiveStatus,
  hideFailed = true,
}: FetchContractsPagesByUserRolesParams): Promise<ContractData> {
  noStore();
  try {
    const supabase = createClient();
    let query = supabase
      .from('contracts')
      .select('id', { count: 'exact', head: true });
    if (query && searchQuery !== '') {
      query.ilike('vendors.name', `%${searchQuery}%`);
    }
    if (contractStatus) {
      query = query.eq('status_id', contractStatus);
    }
    if (contractActiveStatus) {
      if (Array.isArray(contractActiveStatus)) {
        query = query.in('status', contractActiveStatus);
      } else {
        query = query.eq('status', contractActiveStatus);
      }
    }
    if (hideFailed) {
      query = query.neq('ai_extraction_status', 'ai_failed');
    }

    const { count } = await extendSupabaseQueryByUserRole(
      supabase,
      query,
      userId,
      userRole,
      organizationId,
    );
    const totalPages = Math.ceil((count || 0) / ITEMS_PER_PAGE);
    return { totalPages, totalContracts: count };
  } catch (error) {
    console.error('Supabase Error:', error);
    throw new Error('Failed to fetch contracts');
  }
}

export async function fetchContractsByDateRangeByUserRoles({
  startDate,
  endDate,
  userMetadata: { userId, userRole, organizationId },
}: FetchContractsByDateRangeByUserRolesParams) {
  noStore();
  const supabase = createClient();

  try {
    const parsedStartDate = parseISO(startDate);
    let adjustedStartDate = parsedStartDate;
    if (parsedStartDate.getDate() !== 1) {
      adjustedStartDate = startOfMonth(addMonths(parsedStartDate, 1));
    }
    const formattedStartDate = format(adjustedStartDate, 'yyyy-MM-dd');

    let startDatesQuery = supabase
      .from('contracts')
      .select<string, any>(
        `
          id,
          vendor_id,
          term_start_date,
          term_end_date,
          cancel_date,
          cancel_by_date,
          subscription_term,
          renewal_period,
          renewal_type,
          annual_increase,
          status,
          status_id,
          currency,
          ai_extraction_status,
          is_duplicate,
          vendors ( id, name, domain ),
          contract_types ( id, name ),
          contract_statuses ( id, name ),
          vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
            *,
            vendor_products ( id, name, product_code )
          ),
          users!contracts_user_id_fkey (
            id, name, organization,
            organizations!users_organization_id_fkey (
              id,
              fiscal_year_start_month
            )
          )
        `,
      )
      .not('status', 'eq', 'inactive')
      .eq('status_id', 4)
      .gte('term_start_date->0->>date', formattedStartDate)
      .lte('term_start_date->0->>date', endDate);

    let endDatesQuery = supabase
      .from('contracts')
      .select<string, any>(
        `
          id,
          vendor_id,
          term_start_date,
          term_end_date,
          cancel_date,
          cancel_by_date,
          subscription_term,
          renewal_period,
          renewal_type,
          annual_increase,
          status,
          status_id,
          currency,
          ai_extraction_status,
          is_duplicate,
          vendors ( id, name, domain ),
          contract_types ( id, name ),
          contract_statuses ( id, name ),
          vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
            *,
            vendor_products ( id, name, product_code )
          ),
          users!contracts_user_id_fkey (
            id, name, organization,
            organizations!users_organization_id_fkey (
              id,
              fiscal_year_start_month
            )
          )
        `,
      )
      .not('status', 'eq', 'inactive')
      .eq('status_id', 4)
      .gte('term_end_date->0->>date', formattedStartDate)
      .lte('term_end_date->0->>date', endDate);

    let cancelDatesQuery = supabase
      .from('contracts')
      .select<string, any>(
        `
          id,
          vendor_id,
          term_start_date,
          term_end_date,
          cancel_date,
          cancel_by_date,
          subscription_term,
          renewal_period,
          renewal_type,
          annual_increase,
          status,
          status_id,
          currency,
          ai_extraction_status,
          is_duplicate,
          vendors ( id, name, domain ),
          contract_types ( id, name ),
          contract_statuses ( id, name ),
          vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
            *,
            vendor_products ( id, name, product_code )
          ),
          users!contracts_user_id_fkey (
            id, name, organization,
            organizations!users_organization_id_fkey (
              id,
              fiscal_year_start_month
            )
          )
        `,
      )
      .not('status', 'eq', 'inactive')
      .eq('status_id', 4)
      .gte('cancel_date->0->>date', formattedStartDate)
      .lte('cancel_date->0->>date', endDate);

    // Apply user role filters and execute queries
    const [
      { data: data1, error: error1 },
      { data: data2, error: error2 },
      { data: data3, error: error3 },
    ] = await Promise.all([
      extendSupabaseQueryByUserRole(
        supabase,
        startDatesQuery,
        userId,
        userRole,
        organizationId,
      ),
      extendSupabaseQueryByUserRole(
        supabase,
        endDatesQuery,
        userId,
        userRole,
        organizationId,
      ),
      extendSupabaseQueryByUserRole(
        supabase,
        cancelDatesQuery,
        userId,
        userRole,
        organizationId,
      ),
    ]);

    // Handle potential nulls and adapt each dataset individually using Promise.all for concurrency
    // Cast to ContractItemForAdaptation[] to ensure type compatibility with the helper
    const [adaptedData1, adaptedData2, adaptedData3] = await Promise.all([
      adaptContractsWithCurrentVendorInfo(
        (data1 || []) as ContractItemForAdaptation[],
      ),
      adaptContractsWithCurrentVendorInfo(
        (data2 || []) as ContractItemForAdaptation[],
      ),
      adaptContractsWithCurrentVendorInfo(
        (data3 || []) as ContractItemForAdaptation[],
      ),
    ]);

    if (error1) {
      console.error('Supabase Error (Query 1):', error1);
      throw new Error(
        'Failed to fetch contracts with term_start_date within the date range.',
      );
    }
    if (error2) {
      console.error('Supabase Error (Query 2):', error2);
      throw new Error(
        'Failed to fetch contracts with term_end_date within the date range.',
      );
    }
    if (error3) {
      console.error('Supabase Error (Query 3):', error3);
      throw new Error(
        'Failed to fetch contracts with cancel_date within the date range.',
      );
    }

    // Combine adapted results and remove duplicates for uniqueData
    const combinedAdaptedData = [
      ...adaptedData1,
      ...adaptedData2,
      ...adaptedData3,
    ];
    const uniqueData = Array.from(
      new Set(combinedAdaptedData.map((contract) => contract.id)),
    ).map((id) => combinedAdaptedData.find((contract) => contract.id === id));

    return {
      uniqueData,
      startDateContracts: adaptedData1,
      endDateContracts: adaptedData2,
      cancelDateContracts: adaptedData3,
    };
  } catch (error) {
    console.error('Supabase Error:', error);
    return {
      uniqueData: [],
      startDateContracts: [],
      endDateContracts: [],
      cancelDateContracts: [],
    };
  }
}

const OWNER_LOOKUP_PAGE_SIZE = 1000;

/** Stands in for "nothing matched": no contract can carry a negative id. */
const NO_MATCHING_CONTRACT_ID = -1;

/**
 * Ids of the contracts the user sponsors, for the "my contracts" filter.
 * `contracts.business_sponsor` is frozen at its pre-migration value (psk-1975),
 * so ownership is read from `contract_owners`: the user's own row, or a
 * free-text label holding the name or email the frozen column matched on.
 * Mirrors `isSponsoredBy` in `lib/v2/owners/embed.ts`, which the in-memory
 * filter in `app/lib/contracts/filtering.ts` applies to the same rows.
 */
async function fetchSponsoredContractIds(
  supabase: ReturnType<typeof createClient>,
  organizationId: string,
  userId: string,
): Promise<number[]> {
  const user = await getUserProfile(userId);
  const labels = [user?.name, user?.email]
    .map((value) => value?.trim() ?? '')
    .filter((value) => value !== '');

  const lookups: Array<{ column: 'user_id' | 'label'; values: string[] }> = [
    { column: 'user_id', values: [userId] },
  ];
  if (labels.length > 0) {
    lookups.push({ column: 'label', values: labels });
  }

  const contractIds = new Set<number>();
  for (const { column, values } of lookups) {
    for (let offset = 0; ; offset += OWNER_LOOKUP_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('contract_owners')
        .select('contract_id')
        .eq('organization_id', organizationId)
        .eq('role', 'sponsor')
        .in(column, values)
        .order('id')
        .range(offset, offset + OWNER_LOOKUP_PAGE_SIZE - 1);
      if (error) {
        logger.error(
          { error, organizationId, userId },
          'Error reading sponsored contract ids',
        );
        throw error;
      }
      for (const row of data ?? []) {
        contractIds.add(row.contract_id);
      }
      if (!data || data.length < OWNER_LOOKUP_PAGE_SIZE) break;
    }
  }
  return [...contractIds];
}

export async function fetchContractsByUserRoles({
  query,
  currentPage,
  contractFields = [],
  userId: searchUserId,
  contractStatus,
  range = 0,
  extendRange = false,
  status,
  hideFailed = false,
  unexecutedOnly = false,
  myContractsOnly = false,
  renewalType,
  contractTypes,
  excludeContractTypeIds,
  isPending = false,
  folderId,
  contractIds,
  orgWide = false,
  userMetadata: { userId, userRole, organizationId },
}: FetchContractsByUserRolesParams) {
  const supabase = createClient();
  noStore();
  try {
    // Function to execute the contract query
    const executeContractQuery = async (
      currentRange: number,
    ): Promise<ContractItemForAdaptation[]> => {
      let contractsWithVendorsQuery = supabase
        .from('contracts')
        .select<string, any>(
          `
          ${contractFields.length === 0 ? '*' : contractFields.join(',')},
          id,
          vendor_id,
          type_id,
          status_id,
          status,
          ai_extraction_status,
          subscription_term,
          renewal_period,
          annual_increase,
          uploaded_by:users!contracts_user_id_fkey (
            id,
            name,
            email
          ),
          vendors (
            id,
            name,
            domain
          ),
          contract_types (
            id, name
          ),
          contract_docs (
            id, file_path
          ),
          contract_statuses (
            id, name
          ),
          contract_tags (
            id, tag_id,
            user_tags (
              id, name
            )
          ),
          contract_asset_classes (
            asset_class_id,
            asset_classes!inner (
              id, name
            )
          ),
          contract_acl_group (
            group_id,
            groups (
              id, name, public_uuid
            )
          ),
          contract_users ( *, vendor_products ( id, name, product_code ) ),
          ${CONTRACT_OWNERS_EMBED},
          folder_contracts (
            folder_id,
            folders (
              name,
              folder_acl_group (
                group_id,
                groups (
                  id, name, public_uuid
                )
              )
            )
          ),
          vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
            *,
            vendor_products (
              id, name, product_code,
              data_delivery_types:data_delivery_types!vendor_products_delivery_method_id_fkey (
                id, name
              )
            ),
            ${FEE_OVERRIDE_VERSIONS_EMBED},
            vendor_products_eafs_fees ( product_fee, period_months )
          ),
          contract_data_delivery_types!contract_data_delivery_types_contract_id_fkey (
            id,
            data_delivery_types!contract_data_delivery_types_data_delivery_type_id_fkey ( id, name )
          ),
          vendor_products_users:vendor_products_users!vendor_products_users_contract_id_fkey (
            id, product_id, number_of_users, enterprise, contract_id,
            vendor_products (
              id, name, product_code,
              vendors (
                id, name
              )
            )
          ),
          users!contracts_user_id_fkey (
            id, name, organization,
            organizations!users_organization_id_fkey (
              id,
              fiscal_year_start_month
            )
          ),
          contract_relationships:contract_relationships!contract_relationships_child_contract_id_fkey1 (
            parent_contract_id,
            active,
            disabled,
            relationship_type,
            parent:contracts!contract_relationships_parent_contract_id_fkey1 (
              ${contractFields.length === 0 ? '*' : contractFields.join(',')},
              id, type_id,
              contract_types (
                id, name
              ),
              vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
                ${PARENT_PRODUCT_FIELDS},
                ${PARENT_FEE_OVERRIDE_VERSIONS_EMBED}
              )
            )
          )
        `,
        );

      // Released seats are history only — exclude from the embedded roster
      contractsWithVendorsQuery = contractsWithVendorsQuery.is(
        'contract_users.released_at',
        null,
      );

      contractsWithVendorsQuery = contractsWithVendorsQuery.not(
        FEE_OVERRIDE_VERSIONS_FILTER,
        'is',
        null,
      );

      if (isPending) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.neq(
          'status_id',
          4,
        );
        // Include null ai_extraction_status but exclude ai_failed and h_failed
        contractsWithVendorsQuery = contractsWithVendorsQuery.or(
          'ai_extraction_status.is.null,and(ai_extraction_status.not.in.(ai_failed,h_failed),ai_extraction_status.not.is.null)',
        );
      } else if (contractStatus) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.eq(
          'status_id',
          contractStatus,
        );
      }

      if (status) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.eq(
          'status',
          status,
        );
      } else {
        // Always exclude inactive contracts unless explicitly requesting them
        contractsWithVendorsQuery = contractsWithVendorsQuery.neq(
          'status',
          'inactive',
        );
      }

      if (hideFailed) {
        if (status === 'inactive') {
          // For archived: exclude only ai_failed and h_failed, but include null
          contractsWithVendorsQuery = contractsWithVendorsQuery.or(
            'ai_extraction_status.is.null,and(ai_extraction_status.not.in.(ai_failed,h_failed),ai_extraction_status.not.is.null)',
          );
        } else {
          // For other cases: use the existing logic
          contractsWithVendorsQuery = contractsWithVendorsQuery.not(
            'ai_extraction_status',
            'in',
            '(ai_failed,h_failed)',
          );
        }
      }

      if (unexecutedOnly) {
        contractsWithVendorsQuery = contractsWithVendorsQuery
          .eq('all_parties_signed', 'No')
          .eq('ai_extraction_status', 'h_success')
          .not('vendor_id', 'is', null)
          .not('type_id', 'in', typeIdInList(UNEXECUTED_EXCLUDED_TYPE_IDS));
      }

      if (renewalType) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.eq(
          'renewal_type',
          renewalType,
        );
      }

      if (
        contractTypes &&
        Array.isArray(contractTypes) &&
        contractTypes.length > 0
      ) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.in(
          'type_id',
          contractTypes,
        );
      }

      if (
        excludeContractTypeIds &&
        Array.isArray(excludeContractTypeIds) &&
        excludeContractTypeIds.length > 0
      ) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.not(
          'type_id',
          'in',
          `(${excludeContractTypeIds.join(',')})`,
        );
      }

      if (myContractsOnly) {
        const sponsoredIds = await fetchSponsoredContractIds(
          supabase,
          organizationId,
          userId,
        );
        contractsWithVendorsQuery = contractsWithVendorsQuery.in(
          'id',
          sponsoredIds.length > 0 ? sponsoredIds : [NO_MATCHING_CONTRACT_ID],
        );
      }

      if (contractIds && Array.isArray(contractIds) && contractIds.length > 0) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.in(
          'id',
          contractIds,
        );
      }

      // Apply the query filter if provided
      if (query && query.trim() !== '') {
        const formatQuery = (q: string): string => {
          return q
            .trim()
            .split(/\\s+/)
            .map((term) => term + ':*')
            .join(' & ');
        };
        const formattedQuery = formatQuery(query);
        contractsWithVendorsQuery = contractsWithVendorsQuery.textSearch(
          'contract_search',
          formattedQuery,
        );
      } else if (
        currentRange &&
        typeof currentRange === 'number' &&
        currentRange > 0
      ) {
        const currentDate = new Date();
        const futureDate = new Date(currentDate);
        futureDate.setDate(currentDate.getDate() + currentRange);

        const currentDateStr = currentDate.toISOString().split('T')[0];
        const futureDateStr = futureDate.toISOString().split('T')[0];

        contractsWithVendorsQuery = contractsWithVendorsQuery.or(
          `or(and(cancel_date->0->>date.gte.${currentDateStr},cancel_date->0->>date.lte.${futureDateStr}),and(term_end_date->0->>date.gte.${currentDateStr},term_end_date->0->>date.lte.${futureDateStr}))`,
        );

        // Filter out contracts where cancel_date has already passed (only if cancel_date is not null)
        contractsWithVendorsQuery = contractsWithVendorsQuery.or(
          `cancel_date.is.null,cancel_date->0->>date.gte.${currentDateStr}`,
        );
      }

      // Apply other filters
      if (searchUserId) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.eq(
          'user_id',
          searchUserId,
        );
      }

      if (orgWide) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.eq(
          'organization_id',
          organizationId,
        );
      }

      // Apply ordering BEFORE role-based filter (which executes the query)
      contractsWithVendorsQuery = contractsWithVendorsQuery.order(
        'updated_at',
        {
          ascending: false,
        },
      );

      // Apply user role-based filters and execute the query. The org-wide read
      // backs a cache entry shared by the whole org, so it must not bake one
      // user's ACL into the rows — the explicit org filter is its tenancy.
      const { data, error } = orgWide
        ? await contractsWithVendorsQuery
        : await extendSupabaseQueryByUserRole(
            supabase,
            contractsWithVendorsQuery,
            userId,
            userRole,
            organizationId,
          );
      if (error) {
        throw error;
      }

      return (data as ContractItemForAdaptation[] | null) || [];
    };

    // Initial fetch
    let fetchedContracts: ContractItemForAdaptation[] =
      await executeContractQuery(range);

    // If less than 3 entries, increase range and fetch again
    if (range && extendRange && fetchedContracts.length < 3) {
      fetchedContracts = await executeContractQuery(120);
    }

    // Start: Resolve current vendor info, then ICT provider status against
    // the canonical vendor_id and the requesting org.
    if (fetchedContracts.length > 0) {
      const adapted =
        await adaptContractsWithCurrentVendorInfo(fetchedContracts);
      fetchedContracts = await resolveAndCleanIctProviderStatus(
        adapted,
        organizationId,
      );
    }
    // End: Resolve current vendor info, then ICT provider status

    return fetchedContracts;
  } catch (error) {
    console.error('Supabase Error in fetchContractsByUserRoles:', error);
    throw new Error('Failed to fetch filtered contracts.');
  }
}

export async function fetchContractsByUserRolesForLineageAI({
  query,
  contractFields = [],
  contractStatus,
  range = 0,
  extendRange = false,
  status,
  hideFailed = false,
  unexecutedOnly = false,
  myContractsOnly = false,
  renewalType,
  contractTypes,
  excludeContractTypeIds,
  isPending = false,
  orgWide = false,
  userMetadata: { userId, userRole, organizationId },
}: FetchContractsByUserRolesParams) {
  const supabase = createClient();
  noStore();
  try {
    // Function to execute the contract query
    const executeContractQuery = async (
      currentRange: number,
    ): Promise<ContractItemForAdaptation[]> => {
      let contractsWithVendorsQuery = supabase
        .from('contracts')
        .select<string, any>(
          `
          ${contractFields.length === 0 ? '' : `${contractFields.join(',')},`}
          id,
          vendor_id,
          type_id,
          status_id,
          status,
          ai_extraction_status,
          cancel_date,
          cancel_by_date,
          will_not_renew,
          annual_increase_months,
          billing_frequency,
          term_start_date,
          term_end_date,
          renewal_type,
          vendors (
            id,
            name,
            domain
          ),
          contract_types (
            id, name
          ),
          contract_docs (
            id, file_path
          ),
          contract_statuses (
            id, name
          ),
          contract_tags (
            id, tag_id,
            user_tags (
              id, name
            )
          ),
          contract_asset_classes (
            asset_class_id,
            asset_classes!inner (
              id, name
            )
          ),
          contract_acl_group (
            group_id,
            groups (
              id, name, public_uuid
            )
          ),
          contract_users ( *, vendor_products ( id, name, product_code ) ),
          ${CONTRACT_OWNERS_EMBED},
          folder_contracts (
            folder_id,
            folders (
              name,
              folder_acl_group (
                group_id,
                groups (
                  id, name, public_uuid
                )
              )
            )
          ),
          vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
            *,
            vendor_products (
              id, name, product_code,
              data_delivery_types:data_delivery_types!vendor_products_delivery_method_id_fkey (
                id, name
              )
            ),
            ${FEE_OVERRIDE_VERSIONS_EMBED}
          ),
          contract_data_delivery_types!contract_data_delivery_types_contract_id_fkey (
            id,
            data_delivery_types!contract_data_delivery_types_data_delivery_type_id_fkey ( id, name )
          ),
          vendor_products_users:vendor_products_users!vendor_products_users_contract_id_fkey (
            id, product_id, number_of_users, enterprise, contract_id,
            vendor_products (
              id, name, product_code,
              vendors (
                id, name
              )
            )
          ),
          users!contracts_user_id_fkey (
            id, name, organization,
            organizations!users_organization_id_fkey (
              id,
              fiscal_year_start_month
            )
          ),
          contract_relationships:contract_relationships!contract_relationships_child_contract_id_fkey1 (
            parent_contract_id,
            active,
            disabled,
            relationship_type,
            parent:contracts!contract_relationships_parent_contract_id_fkey1 (
              ${contractFields.length === 0 ? '*' : contractFields.join(',')},
              id,
              contract_types (
                id, name
              ),
              vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
                ${PARENT_PRODUCT_FIELDS},
                ${PARENT_FEE_OVERRIDE_VERSIONS_EMBED}
              )
            )
          )
        `,
        );

      // Released seats are history only — exclude from the embedded roster
      contractsWithVendorsQuery = contractsWithVendorsQuery.is(
        'contract_users.released_at',
        null,
      );

      contractsWithVendorsQuery = contractsWithVendorsQuery.not(
        FEE_OVERRIDE_VERSIONS_FILTER,
        'is',
        null,
      );

      if (isPending) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.neq(
          'status_id',
          4,
        );
        // Include null ai_extraction_status but exclude ai_failed and h_failed
        contractsWithVendorsQuery = contractsWithVendorsQuery.or(
          'ai_extraction_status.is.null,and(ai_extraction_status.not.in.(ai_failed,h_failed),ai_extraction_status.not.is.null)',
        );
      } else if (contractStatus) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.eq(
          'status_id',
          contractStatus,
        );
      }

      if (status) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.eq(
          'status',
          status,
        );
      } else {
        // Always exclude inactive contracts unless explicitly requesting them
        contractsWithVendorsQuery = contractsWithVendorsQuery.neq(
          'status',
          'inactive',
        );
      }

      if (hideFailed) {
        if (status === 'inactive') {
          // For archived: exclude only ai_failed and h_failed, but include null
          contractsWithVendorsQuery = contractsWithVendorsQuery.or(
            'ai_extraction_status.is.null,and(ai_extraction_status.not.in.(ai_failed,h_failed),ai_extraction_status.not.is.null)',
          );
        } else {
          // For other cases: use the existing logic
          contractsWithVendorsQuery = contractsWithVendorsQuery.not(
            'ai_extraction_status',
            'in',
            '(ai_failed,h_failed)',
          );
        }
      }

      if (unexecutedOnly) {
        contractsWithVendorsQuery = contractsWithVendorsQuery
          .eq('all_parties_signed', 'No')
          .eq('ai_extraction_status', 'h_success')
          .not('vendor_id', 'is', null)
          .not('type_id', 'in', typeIdInList(UNEXECUTED_EXCLUDED_TYPE_IDS));
      }

      if (renewalType) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.eq(
          'renewal_type',
          renewalType,
        );
      }

      if (
        contractTypes &&
        Array.isArray(contractTypes) &&
        contractTypes.length > 0
      ) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.in(
          'type_id',
          contractTypes,
        );
      }

      if (
        excludeContractTypeIds &&
        Array.isArray(excludeContractTypeIds) &&
        excludeContractTypeIds.length > 0
      ) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.not(
          'type_id',
          'in',
          `(${excludeContractTypeIds.join(',')})`,
        );
      }

      if (myContractsOnly) {
        const sponsoredIds = await fetchSponsoredContractIds(
          supabase,
          organizationId,
          userId,
        );
        contractsWithVendorsQuery = contractsWithVendorsQuery.in(
          'id',
          sponsoredIds.length > 0 ? sponsoredIds : [NO_MATCHING_CONTRACT_ID],
        );
      }

      // Apply the query filter if provided
      if (query && query.trim() !== '') {
        const formatQuery = (q: string): string => {
          return q
            .trim()
            .split(/\\s+/)
            .map((term) => term + ':*')
            .join(' & ');
        };
        const formattedQuery = formatQuery(query);
        contractsWithVendorsQuery = contractsWithVendorsQuery.textSearch(
          'contract_search',
          formattedQuery,
        );
      } else if (
        currentRange &&
        typeof currentRange === 'number' &&
        currentRange > 0
      ) {
        const currentDate = new Date();
        const futureDate = new Date(currentDate);
        futureDate.setDate(currentDate.getDate() + currentRange);

        const currentDateStr = currentDate.toISOString().split('T')[0];
        const futureDateStr = futureDate.toISOString().split('T')[0];

        contractsWithVendorsQuery = contractsWithVendorsQuery.or(
          `or(and(cancel_date->0->>date.gte.${currentDateStr},cancel_date->0->>date.lte.${futureDateStr}),and(term_end_date->0->>date.gte.${currentDateStr},term_end_date->0->>date.lte.${futureDateStr}))`,
        );

        // Filter out contracts where cancel_date has already passed (only if cancel_date is not null)
        contractsWithVendorsQuery = contractsWithVendorsQuery.or(
          `cancel_date.is.null,cancel_date->0->>date.gte.${currentDateStr}`,
        );
      }

      if (orgWide) {
        contractsWithVendorsQuery = contractsWithVendorsQuery.eq(
          'organization_id',
          organizationId,
        );
      }

      // Apply ordering BEFORE role-based filter (which executes the query)
      contractsWithVendorsQuery = contractsWithVendorsQuery.order(
        'updated_at',
        {
          ascending: false,
        },
      );

      // Apply user role-based filters and execute the query. The org-wide read
      // backs a cache entry shared by the whole org, so it must not bake one
      // user's ACL into the rows — the explicit org filter is its tenancy.
      const { data, error } = orgWide
        ? await contractsWithVendorsQuery
        : await extendSupabaseQueryByUserRole(
            supabase,
            contractsWithVendorsQuery,
            userId,
            userRole,
            organizationId,
          );
      if (error) {
        throw error;
      }

      return (data as ContractItemForAdaptation[] | null) || [];
    };

    // Initial fetch
    let fetchedContracts: ContractItemForAdaptation[] =
      await executeContractQuery(range);

    // If less than 3 entries, increase range and fetch again
    if (range && extendRange && fetchedContracts.length < 3) {
      fetchedContracts = await executeContractQuery(120);
    }

    // Start: Resolve current vendor info, then ICT provider status against
    // the canonical vendor_id and the requesting org.
    if (fetchedContracts.length > 0) {
      const adapted =
        await adaptContractsWithCurrentVendorInfo(fetchedContracts);
      fetchedContracts = await resolveAndCleanIctProviderStatus(
        adapted,
        organizationId,
      );
    }
    // End: Resolve current vendor info, then ICT provider status

    return fetchedContracts;
  } catch (error) {
    console.error('Supabase Error in fetchContractsByUserRoles:', error);
    throw new Error('Failed to fetch filtered contracts.');
  }
}

export async function fetchRenewingContractsByUserRoles({
  userMetadata: { userId, userRole, organizationId },
  contractFields = [],
  daysAgo,
  autoRenewalsOnly = false,
}: FetchRenewingContractsByUserRolesParams) {
  const supabase = createClient();
  noStore();

  try {
    // Get date range based on either daysAgo or fiscal year
    const currentDate = new Date();
    let startDate: Date;
    let endDate: Date;
    let futureDate: Date | null = null;

    if (daysAgo) {
      // If daysAgo is provided, use it for the date range
      startDate = new Date(currentDate);
      startDate.setDate(currentDate.getDate() - daysAgo);
      endDate = currentDate;

      // Also calculate a future date for upcoming term_start_dates
      futureDate = new Date(currentDate);
      futureDate.setDate(currentDate.getDate() + daysAgo);
    } else {
      // If no daysAgo, use fiscal year range
      const user = await getUserMetadata();
      if (!user) {
        throw new Error('User metadata not found');
      }
      const fiscalYearStartMonth = user.organizationFY || 1;

      // Calculate fiscal year start and end
      const currentYear = currentDate.getFullYear();
      const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-based

      // If we're past the fiscal year start month, use current year, otherwise use previous year
      const fiscalYearStart = new Date(
        currentMonth >= (fiscalYearStartMonth || 1)
          ? currentYear
          : currentYear - 1,
        (fiscalYearStartMonth || 1) - 1, // Convert back to 0-based month
        1,
      );

      const fiscalYearEnd = new Date(
        fiscalYearStart.getFullYear() + 1,
        fiscalYearStartMonth - 1,
        0,
      );

      startDate = fiscalYearStart;
      endDate = fiscalYearEnd;
    }

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    const futureDateStr = futureDate
      ? futureDate.toISOString().split('T')[0]
      : null;
    const currentDateStr = currentDate.toISOString().split('T')[0];

    let contractsQuery = supabase
      .from('contracts')
      .select<string, any>(
        `
        ${contractFields.length === 0 ? '*' : contractFields.join(',')},
        id,
        vendor_id,
        type_id,
        status_id,
        status,
        ai_extraction_status,
        vendors (
          id, name, domain
        ),
        contract_types (
          id, name
        ),
        contract_docs (
          id, file_path
        ),
        contract_statuses (
          id, name
        ),
        contract_tags (
          id, tag_id,
          user_tags (
            id, name
          )
        ),
        vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
          *,
          vendor_products (
            id, name, product_code
          )
        ),
        users!contracts_user_id_fkey (
          id, name, organization,
          organizations!users_organization_id_fkey (
            id,
            fiscal_year_start_month
          )
        )
      `,
      )
      .eq('status', 'active')
      .eq('status_id', 4)
      .neq('ai_extraction_status', 'ai_failed')
      .not('type_id', 'in', typeIdInList(INVOICE_TYPE_IDS)); // Invoices never renew

    if (autoRenewalsOnly) {
      contractsQuery = contractsQuery.eq('renewal_type', 'Auto');
    }

    // Apply date filtering based on mode
    if (daysAgo && futureDateStr) {
      // For recent renewals, check either:
      // 1. Active status + term_start_date within past range
      // 2. Unconfirmed status + term_end_date within range
      // 3. Active status + term_start_date in future (up to daysAgo into future)
      contractsQuery = contractsQuery
        .or(
          `and(status.eq.active,term_start_date->0->>date.gte.${startDateStr},term_start_date->0->>date.lte.${endDateStr}),` +
            `and(status.eq.unconfirmed,term_end_date->0->>date.gte.${startDateStr},term_end_date->0->>date.lte.${endDateStr}),` +
            `and(status.eq.active,term_start_date->0->>date.gt.${currentDateStr},term_start_date->0->>date.lte.${futureDateStr})`,
        )
        .order('updated_at', { ascending: false }); // Order by most recently updated
    } else {
      // For fiscal year, check term_end_date
      contractsQuery = contractsQuery
        .filter('term_end_date->0->>date', 'gte', startDateStr)
        .filter('term_end_date->0->>date', 'lte', endDateStr)
        .order('term_end_date->0->>date', { ascending: false });
    }

    // Apply organization-based access control
    contractsQuery = await extendSupabaseQueryByUserRole(
      supabase,
      contractsQuery,
      userId,
      userRole,
      organizationId,
    );

    const { data, error } = await contractsQuery;

    if (error) {
      throw error;
    }

    const contracts = data || [];
    const adaptedContracts =
      await adaptContractsWithCurrentVendorInfo(contracts);

    return adaptedContracts;
  } catch (error) {
    console.error('Supabase Error:', error);
    throw new Error('Failed to fetch auto-renewing contracts.');
  }
}

interface Contract {
  id: number;
  contract_types: { id: number; name: string };
  vendor_products_details: any[];
  children?: Contract[];
}

export async function fetchContractHierarchy(
  contractId: number,
  organizationId: string,
) {
  const supabase = createClient();
  const visited = new Set<number>();

  async function fetchContract(id: number): Promise<Contract | null> {
    if (visited.has(id)) return null;
    visited.add(id);

    const { data, error } = await supabase
      .from('contracts')
      .select<string, any>(
        `
        id,
        contract_types (id, name),
        vendor_products_details (
          *, vendor_products (id, name, product_code)
        ),
        tos_urls
      `,
      )
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching contract:', error);
      return null;
    }

    return data as Contract;
  }

  async function buildHierarchy(id: number): Promise<Contract | null> {
    const contract = await fetchContract(id);
    if (!contract) return null;

    // Hierarchy edges only — this walk descends parent -> child, so an
    // unfiltered read would graft a billing-linked invoice into the tree as a
    // structural child of an SO it merely shares line items with.
    const { data: relationships, error } = await supabase
      .from('contract_relationships')
      .select(
        'child_contract_id, child_contracts:contracts!contract_relationships_child_contract_id_fkey(term_start_date)',
      )
      .eq('active', true)
      .eq('parent_contract_id', id)
      .is('relationship_type', null)
      .or('disabled.eq.false,disabled.is.null');

    if (error) {
      console.error('Error fetching relationships:', error);
      return contract;
    }

    contract.children = [];

    if (Array.isArray(relationships)) {
      // Sort relationships by child contract's term_start_date before building hierarchy
      // Use the LAST element (original/oldest term date) for chronological ordering
      const sortedRelationships = relationships.sort((a, b) => {
        const termStartA = (a as any).child_contracts?.term_start_date;
        const termStartB = (b as any).child_contracts?.term_start_date;

        const dateA =
          Array.isArray(termStartA) && termStartA.length > 0
            ? (termStartA[termStartA.length - 1]?.date ?? null)
            : typeof termStartA === 'string'
              ? termStartA
              : null;
        const dateB =
          Array.isArray(termStartB) && termStartB.length > 0
            ? (termStartB[termStartB.length - 1]?.date ?? null)
            : typeof termStartB === 'string'
              ? termStartB
              : null;

        // If both have dates, sort chronologically (older first)
        if (dateA && dateB) {
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        }

        // If only one has a date, prioritize the one with a date
        if (dateA) return -1;
        if (dateB) return 1;

        // Fallback to ID if no dates
        return (a.child_contract_id || 0) - (b.child_contract_id || 0);
      });

      for (const rel of sortedRelationships) {
        const relAny = rel as any;
        if (
          'child_contract_id' in relAny &&
          typeof relAny.child_contract_id === 'number'
        ) {
          const child = await buildHierarchy(relAny.child_contract_id);
          if (child) contract.children.push(child);
        }
      }
    }

    return contract;
  }

  // The map walk throws on a cycle where the DB walk it replaced logged and
  // returned the input id — same fallback, so a cyclic chain still renders
  // rooted at the contract asked for.
  const relationships = await fetchAllRelationshipsForOrg(organizationId);
  let topmostParentId = contractId;
  try {
    topmostParentId = findTopmostParent(
      contractId,
      buildOrgHierarchyMap(relationships),
    );
  } catch (error) {
    logger.error(
      { error, contractId },
      'Error resolving topmost parent for contract hierarchy',
    );
  }

  const completeHierarchy = await buildHierarchy(topmostParentId);

  return { completeHierarchy };
}

export async function fetchContractsByIdByUserRoles({
  ids,
  userMetadata: { userId, userRole, organizationId },
}: FetchContractsByIdByUserRolesParams) {
  const supabase = createClient();
  noStore();

  try {
    const selectString = `*,
        uploaded_by:users!contracts_user_id_fkey (
          id,
          name,
          email
        ),
        vendors (
          id,
          name,
          address,
          email,
          domain,
          vendor_products ( id, name, product_code )
        ),
        contract_types ( id, name ),
        contract_statuses ( id, name ),
        ai_extraction_status,
        contract_docs!contract_docs_contract_id_fkey (
          id, file_path
        ),
        contract_tags (
          id, tag_id,
          user_tags (
            id, name
          )
        ),
        vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
          *,
          vendor_products (
            id, name, product_code, delivery_method_id,
            data_delivery_types:data_delivery_types!vendor_products_delivery_method_id_fkey (
              id,
              name
            )
          ),
          ${FEE_OVERRIDE_VERSIONS_EMBED}
        ),
        vendor_products_users:vendor_products_users!vendor_products_users_contract_id_fkey (
          id, product_id, number_of_users, enterprise, contract_id,
          vendor_products (
            id, name, product_code,
            vendors (
              id, name
            )
          )
        ),
        contract_asset_classes (
          asset_class_id,
          asset_classes!inner (
            id, name
          )
        ),
        contract_data_delivery_types!contract_data_delivery_types_contract_id_fkey (
          id,
          data_delivery_types!contract_data_delivery_types_data_delivery_type_id_fkey ( id, name )
        ),
        parent_relationships:contract_relationships!contract_relationships_child_contract_id_fkey1 (
          id, parent_contract_id, active, disabled
        ),
        child_relationships:contract_relationships!contract_relationships_parent_contract_id_fkey1 (
          id, child_contract_id, active, disabled
        ),
        folder_contracts (
          folder_id,
          folders (
            id,
            name,
            path,
            folder_acl_group (
              group_id,
              groups (
                id, name, public_uuid
              )
            )
          )
        ),
        contract_acl_group (
          group_id,
          groups (
            id, name, public_uuid
          )
        ),
        ${CONTRACT_OWNERS_EMBED},
        ${CONTRACT_PRODUCT_CREDITS_EMBED}`;

    let query = supabase
      .from('contracts')
      .select<string, any>(selectString)
      .not(FEE_OVERRIDE_VERSIONS_FILTER, 'is', null)
      .in('id', ids);

    const extendedQuery = await extendSupabaseQueryByUserRole(
      supabase,
      query,
      userId,
      userRole,
      organizationId,
    );
    let {
      data: fetchedContracts,
      error,
    }: { data: ContractItemForAdaptation[] | null; error: any } =
      await extendedQuery;

    if (error) {
      if (
        error.code === 'PGRST116' ||
        error.message?.includes('not found') ||
        error.message?.includes('permission')
      ) {
        logger.warn(
          { ids },
          `Contracts with IDs ${ids} not found or access denied`,
        );
        return null;
      }
      throw error;
    }

    if (!fetchedContracts || fetchedContracts.length === 0) {
      return null;
    }

    const adapted = await adaptContractsWithCurrentVendorInfo(fetchedContracts);
    let contracts = await resolveAndCleanIctProviderStatus(
      adapted,
      organizationId,
    );

    // Existing post-processing for asset classes, file names, related contracts etc.
    if (contracts && contracts.length > 0) {
      contracts.forEach((contract: any) => {
        // Process asset classes for each contract individually
        if (
          contract.contract_asset_classes &&
          contract.contract_asset_classes.length > 0
        ) {
          const contractAssetClasses = contract.contract_asset_classes
            .map((association: any) => association.asset_classes)
            .filter(Boolean);
          if (contractAssetClasses.length > 0) {
            // Deduplicate asset classes by name to avoid parent class repetition
            const seen = new Set<string>();
            const uniqueAssetClasses = contractAssetClasses.filter(
              (ac: any) => {
                const key = String(ac?.name ?? ac?.id);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              },
            );
            contract.asset_classes = uniqueAssetClasses;
          }
        }
      });
    }

    contracts.forEach((contract: any) => {
      if (contract.contract_docs && contract.contract_docs.length > 0) {
        const filePath = contract.contract_docs[0].file_path;
        contract.file_name = filePath.split('/').pop();
      }

      const activeFilter = (rel: any) =>
        rel.active === true &&
        (rel.disabled === null || rel.disabled === false);

      const parentIds =
        contract.parent_relationships
          ?.filter(activeFilter)
          .map((rel: any) => rel.parent_contract_id) || [];

      const childIds =
        contract.child_relationships
          ?.filter(activeFilter)
          .map((rel: any) => rel.child_contract_id) || [];

      contract.related_contracts = {
        parent_ids: parentIds,
        child_ids: childIds,
      };

      delete contract.parent_relationships;
      delete contract.child_relationships;
    });

    return contracts;
  } catch (error: any) {
    console.error('Supabase Error in fetchContractsByIdByUserRoles:', error);
    throw new Error(error.message);
  }
}

export async function fetchContractDocumentsByIdByUserRoles({
  id,
  userMetadata: { userId, userRole, organizationId },
}: FetchContractDocumentsByIdByUserRolesParams) {
  const supabase = createClient();
  try {
    // First check if user has access to this contract
    const contractQuery = supabase.from('contracts').select('id').eq('id', id);

    const { data: contractAccess, error: accessError } =
      await extendSupabaseQueryByUserRole(
        supabase,
        contractQuery,
        userId,
        userRole,
        organizationId,
      );

    if (accessError) {
      console.error('Error checking contract access:', accessError);
      throw new Error('Failed to verify contract access.');
    }

    // If no access to contract, return empty array
    if (!contractAccess || contractAccess.length === 0) {
      return [];
    }

    // User has access, fetch documents
    const { data: contractDocuments, error: documentsError } = await supabase
      .from('contract_docs')
      .select('*')
      .eq('contract_id', id);

    if (documentsError) {
      console.error('Error fetching contract documents:', documentsError);
      throw new Error('Failed to fetch contract documents from Supabase.');
    }

    // If no documents are found, return or handle appropriately
    if (!contractDocuments || contractDocuments.length === 0) {
      return [];
    }

    // Generate signed URLs for each document
    const documentsWithSignedUrls = await Promise.all(
      contractDocuments.map(async (document: any) => {
        if (document.file_path === null) {
          throw new Error('File path is null');
        }
        const { data: signedUrlData, error: signedUrlError } =
          await supabase.storage
            .from('contract_docs') // Replace with your actual bucket name
            .createSignedUrl(document.file_path, 60 * 60); // URL expiry time in seconds

        if (signedUrlError) {
          console.error('Error generating signed URL:', signedUrlError);
          return { ...document, signedUrl: null }; // Decide how you want to handle errors
        }

        return { ...document, signedUrl: signedUrlData.signedUrl };
      }),
    );

    return documentsWithSignedUrls;
  } catch (error) {
    console.error('Supabase Error:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

export async function findDuplicateDocInUsers(
  userIds: string[],
  fileName: string,
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contract_docs')
    .select<
      string,
      { file_path: string; contract_id: number }
    >('file_path, contract_id')
    .in('user_id', userIds)
    .ilike('file_path', `%/${fileName}`);
  if (error) {
    throw error;
  }
  return data || [];
}

export async function getOwner(contractId: number) {
  try {
    const supabase = createClient();
    const { data, error, status } = await supabase
      .from('contracts')
      .select<
        string,
        {
          business_sponsor: any[] | null;
          business_justification: string | null;
          business_group: string | null;
          business_order: string | null;
        }
      >(
        `business_sponsor, business_justification, business_group, business_order`,
      )
      .eq('id', contractId)
      .single();

    if (error && status !== 406) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error fetching owner:', error);
    throw error;
  }
}

export async function getContractUsers(
  contractId: number,
): Promise<ContractUser[]> {
  await assertContractAndEmployeeInUserOrg([contractId], []);
  const me = await getUserMetadata();
  if (!me?.organizationId) {
    throw new AuthorizationError('Not authenticated');
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('contract_users')
    .select<
      string,
      Omit<ContractUser, 'org_employees'> & {
        org_employees: Omit<OrgEmployee, 'businessGroup'> | null;
        contracts: { organization_id: string } | null;
      }
    >(
      'id, name, email, product_id, vendor_products( id, name, product_code ), contract_id, created_at, updated_at, employee_id, region, country, division, department, cost_center, start_date, leave_date, org_employee_id, contracts!inner( organization_id ), org_employees( id, organization_id, first_name, last_name, email, employee_id, region, country, division, department, cost_center, entity, business_unit, team, org_unit_id, start_date, leave_date, status, deleted_at, created_at, updated_at )',
    )
    .eq('contract_id', contractId)
    // contract_users has no organization_id of its own; the service client
    // bypasses RLS, so tenancy is pinned through the parent contract.
    .eq('contracts.organization_id', me.organizationId)
    .is('released_at', null);

  if (error) throw error;

  const rows = data ?? [];
  const businessGroupsByLeaf = rows.some(
    (row) => row.org_employees?.org_unit_id != null,
  )
    ? await getBusinessGroupsByLeaf(me.organizationId, supabase)
    : new Map<number, BusinessGroup>();

  return rows.map(({ contracts: _contracts, ...row }) => ({
    ...row,
    org_employees: row.org_employees
      ? {
          ...row.org_employees,
          businessGroup:
            row.org_employees.org_unit_id != null
              ? (businessGroupsByLeaf.get(row.org_employees.org_unit_id) ??
                null)
              : null,
        }
      : null,
  }));
}

async function invalidateContractsCacheForOrg() {
  try {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      // The cache entry is org-wide now, so a skipped invalidation serves
      // stale data to the whole org for the TTL — page on it.
      logAlert(
        'contract-cache-invalidation-failure',
        null,
        {},
        'No user metadata after a contract-user mutation; org contract cache not invalidated',
      );
      return;
    }
    const cacheService = await getCacheService();
    // invalidateContractSetForOrg catches internally and reports via boolean,
    // so a Redis failure never reaches the catch below.
    const invalidated =
      await cacheService.invalidateContractSetForOrg(userMetadata);
    if (!invalidated) {
      logAlert(
        'contract-cache-invalidation-failure',
        null,
        { organizationId: userMetadata.organizationId },
        'Org contract cache invalidation reported failure after a contract-user mutation',
      );
    }
  } catch (err) {
    logAlert(
      'contract-cache-invalidation-failure',
      err,
      {},
      'Failed to invalidate org contract cache after a contract-user mutation',
    );
  }
}

async function assertContractUserInUserOrg(userId: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contract_users')
    .select('contract_id')
    .eq('id', userId)
    .single();
  if (error || !data?.contract_id) {
    throw new AuthorizationError('Contract user not found');
  }
  await assertContractAndEmployeeInUserOrg([data.contract_id], []);
}

async function assertContractAndEmployeeInUserOrg(
  contractIds: number[],
  orgEmployeeIds: number[],
) {
  const me = await getUserMetadata();
  if (!me?.organizationId) {
    throw new AuthorizationError('Not authenticated');
  }

  const supabase = createClient();

  if (contractIds.length > 0) {
    const { data: contracts, error: contractError } = await supabase
      .from('contracts')
      .select('id, organization_id')
      .in('id', contractIds);
    if (contractError) throw contractError;
    if ((contracts?.length ?? 0) !== contractIds.length) {
      throw new AuthorizationError('Contract not found');
    }
    if (contracts!.some((c) => c.organization_id !== me.organizationId)) {
      throw new AuthorizationError('Cross-organization contract access denied');
    }
  }

  if (orgEmployeeIds.length > 0) {
    const { data: employees, error: employeeError } = await supabase
      .from('org_employees')
      .select('id, organization_id')
      .in('id', orgEmployeeIds);
    if (employeeError) throw employeeError;
    if ((employees?.length ?? 0) !== orgEmployeeIds.length) {
      throw new AuthorizationError('Employee not found');
    }
    if (employees!.some((e) => e.organization_id !== me.organizationId)) {
      throw new AuthorizationError('Cross-organization employee access denied');
    }
  }
}

export async function addContractUserAssignment({
  contractId,
  orgEmployeeId,
  product_id,
  start_date,
  leave_date,
}: {
  contractId: number;
  orgEmployeeId: number;
  product_id: number;
  start_date?: string;
  leave_date?: string;
}) {
  await assertContractAndEmployeeInUserOrg([contractId], [orgEmployeeId]);

  const supabase = createClient();

  const { data: employee, error: empError } = await supabase
    .from('org_employees')
    .select('first_name, last_name, email')
    .eq('id', orgEmployeeId)
    .single();

  if (empError) throw empError;

  const { error } = await supabase.from('contract_users').insert({
    contract_id: contractId,
    org_employee_id: orgEmployeeId,
    name: `${employee.first_name} ${employee.last_name}`.trim(),
    email: employee.email,
    product_id,
    start_date,
    leave_date,
    created_at: new Date().toISOString(),
  });

  if (error) throw error;
  await invalidateContractsCacheForOrg();
}

export async function addContractUserAssignments(
  assignments: {
    contract_id: number;
    org_employee_id: number;
    product_id: number;
    start_date?: string;
    leave_date?: string;
    created_at: string;
  }[],
) {
  if (assignments.length === 0) return;

  const contractIds = Array.from(
    new Set(assignments.map((a) => a.contract_id)),
  );
  const orgEmployeeIds = Array.from(
    new Set(assignments.map((a) => a.org_employee_id)),
  );
  await assertContractAndEmployeeInUserOrg(contractIds, orgEmployeeIds);

  const supabase = createClient();

  const { data: employees, error: empError } = await supabase
    .from('org_employees')
    .select('id, first_name, last_name, email')
    .in('id', orgEmployeeIds);
  if (empError) throw empError;

  const empById = new Map(employees?.map((e) => [e.id, e]) ?? []);

  const rows = assignments.map((a) => {
    const emp = empById.get(a.org_employee_id);
    if (!emp) {
      throw new AuthorizationError('Employee not found');
    }
    return {
      ...a,
      name: `${emp.first_name} ${emp.last_name}`.trim(),
      email: emp.email,
    };
  });

  const { error } = await supabase.from('contract_users').insert(rows);

  if (error) throw error;
  await invalidateContractsCacheForOrg();
}

export async function addContractUser({
  contractId,
  name,
  email,
  product_id,
  employee_id,
  region,
  country,
  division,
  department,
  cost_center,
  start_date,
  leave_date,
}: {
  contractId: number;
  name: string;
  email?: string | null;
  product_id: number;
  employee_id?: string;
  region?: string;
  country?: string;
  division?: string;
  department?: string;
  cost_center?: string;
  start_date?: string;
  leave_date?: string;
}) {
  await assertContractAndEmployeeInUserOrg([contractId], []);

  const supabase = createClient();
  const { error } = await supabase.from('contract_users').insert({
    contract_id: contractId,
    name,
    email: normalizeEmail(email),
    product_id,
    employee_id,
    region,
    country,
    division,
    department,
    cost_center,
    start_date,
    leave_date,
    created_at: new Date().toISOString(),
  });

  if (error) throw error;
  await invalidateContractsCacheForOrg();
}

export async function addContractUsers(
  users: {
    contract_id: number;
    name: string;
    email: string;
    created_at: string;
    product_id: number;
    employee_id?: string;
    region?: string;
    country?: string;
    division?: string;
    department?: string;
    cost_center?: string;
    start_date?: string;
    leave_date?: string;
  }[],
) {
  if (users.length === 0) return;

  const contractIds = Array.from(new Set(users.map((u) => u.contract_id)));
  await assertContractAndEmployeeInUserOrg(contractIds, []);

  const supabase = createClient();
  const { error } = await supabase.from('contract_users').insert(users);

  if (error) throw error;
  await invalidateContractsCacheForOrg();
}

export async function deleteContractUser(userId: number) {
  await assertContractUserInUserOrg(userId);

  const supabase = createClient();
  const { error } = await supabase
    .from('contract_users')
    .delete()
    .eq('id', userId);

  if (error) throw error;
  await invalidateContractsCacheForOrg();
}

// Frees the seats while keeping the rows as history; released rows are
// excluded from all active-seat queries. Returns the IDs that actually
// transitioned so callers don't log/toast for already-released rows.
export async function releaseContractUsers(
  userIds: number[],
): Promise<number[]> {
  if (userIds.length === 0) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('contract_users')
    .select('contract_id')
    .in('id', userIds);
  if (error) throw error;
  if (
    (data?.length ?? 0) !== userIds.length ||
    data!.some((row) => row.contract_id == null)
  ) {
    throw new AuthorizationError('Contract user not found');
  }
  const contractIds = Array.from(
    new Set(data!.map((row) => row.contract_id as number)),
  );
  await assertContractAndEmployeeInUserOrg(contractIds, []);

  const { data: updatedRows, error: updateError } = await supabase
    .from('contract_users')
    .update({ released_at: new Date().toISOString() })
    .in('id', userIds)
    .is('released_at', null)
    .select('id');

  if (updateError) throw updateError;
  await invalidateContractsCacheForOrg();
  return (updatedRows ?? []).map((row) => row.id);
}

export async function updateContractUser({
  userId,
  name,
  email,
  product_id,
  employee_id,
  region,
  country,
  division,
  department,
  cost_center,
  start_date,
  leave_date,
}: {
  userId: number;
  name: string;
  email?: string | null;
  product_id: number;
  employee_id?: string;
  region?: string;
  country?: string;
  division?: string;
  department?: string;
  cost_center?: string;
  start_date?: string;
  leave_date?: string;
}) {
  await assertContractUserInUserOrg(userId);

  const supabase = createClient();
  const { error } = await supabase
    .from('contract_users')
    .update({
      name,
      email: normalizeEmail(email),
      product_id,
      employee_id,
      region,
      country,
      division,
      department,
      cost_center,
      start_date,
      leave_date,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
  await invalidateContractsCacheForOrg();
}

export async function overrideContract(
  fileName: string,
  contractId: number,
  currentFilePath: string,
) {
  try {
    const supabase = createClient();

    const divider = fileName.lastIndexOf('.');
    const fileExtension = fileName.substring(divider);
    const baseFileName = fileName.substring(0, divider);
    const newFileName = `${baseFileName}-${new Date().toISOString()}${fileExtension}`;
    const newFilePath = currentFilePath.replace(fileName, newFileName);

    // Rename the old contract in supabase storage
    const { error: renameError } = await supabase.storage
      .from('contract_docs')
      .move(currentFilePath, newFilePath);
    if (renameError) {
      throw renameError;
    }

    // Update the contract record in db
    const { error: updateError } = await supabase
      .from('contract_docs')
      .update({
        file_path: newFilePath,
      })
      .eq('contract_id', contractId);
    if (updateError) {
      throw updateError;
    }

    // Archive the old contract
    const { error: archiveError } = await supabase
      .from('contracts')
      .update({
        status: 'inactive',
        is_duplicate: true,
      })
      .eq('id', contractId);
    if (archiveError) {
      throw archiveError;
    }

    return {
      success: true,
    };
  } catch (error) {
    console.error(error);
    return {
      success: false,
    };
  }
}

export async function fetchContractMetadata({ id }: { id: number }) {
  const supabase = createClient();
  noStore();
  try {
    const { data: contract, error } = await supabase
      .from('contracts')
      .select<string, any>(
        `id,
        vendors ( id, name, address, email, domain ),
        contract_types ( id, name ),
        contract_tags (
          id, tag_id,
          user_tags (
            id, name
          )
        ),
        vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
          *,
          vendor_products (
            id, name, product_code
          )
        )`,
      )
      .eq('id', id)
      .single();
    if (error) {
      throw error;
    }

    return contract;
  } catch (error: any) {
    console.error('Supabase Error:');
    throw new Error(error.message);
  }
}

export async function getContractsByVendorId(vendorId: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contracts')
    .select<string, any>('*')
    .eq('vendor_id', vendorId);
  if (error) throw error;
  return data;
}

/**
 * `vendorIds` is the full merge lineage (see `expandVendorLineageIds`), not a
 * single vendor: the parent contract may be stored under a sibling id from a
 * corporate action.
 */
export async function findLinkedContract(
  vendorIds: number[],
  organizationId: string,
  startDate: string,
  contractId: number,
  typeId?: number,
) {
  const supabase = createClient();
  const userIds = await getAllOrgUsers(organizationId);
  const { data, error } = await supabase
    .from('contracts')
    .select<string, any>('id, term_start_date, type_id, contract_types(name)')
    .in('vendor_id', vendorIds)
    .eq('status_id', 4)
    .eq('term_start_date->-1->>date', startDate)
    .in('user_id', userIds)
    .not('id', 'eq', contractId);

  if (error) throw error;
  return data?.[0];
}

export async function fetchContractCitationsByUserRoles({
  contractId,
  userMetadata: { userId, userRole, organizationId },
}: {
  contractId: number | null | undefined;
  userMetadata: {
    userId: string | null | undefined;
    userRole: number | null | undefined;
    organizationId: string | null | undefined;
  };
}): Promise<Citation[]> {
  const supabase = createClient();
  noStore();

  try {
    // Validate required parameters
    if (!contractId) {
      console.warn(
        'No contractId provided to fetchContractCitationsByUserRoles',
      );
      return [];
    }

    if (!organizationId) {
      console.warn(
        'No organizationId provided to fetchContractCitationsByUserRoles',
      );
      return [];
    }

    // Only check contract access if we have the necessary data
    if (userId && userRole) {
      // First check if user has access to this contract
      const contractQuery = supabase
        .from('contracts')
        .select('id')
        .eq('id', contractId);

      const { data: contractAccess, error: accessError } =
        await extendSupabaseQueryByUserRole(
          supabase,
          contractQuery,
          userId,
          userRole,
          organizationId || '',
        );

      if (accessError) {
        console.error('Error checking contract access:', accessError);
        return [];
      }

      // If no access to contract, return empty array
      if (!contractAccess || contractAccess.length === 0) {
        return [];
      }
    }

    // User has access, fetch citations
    const { data, error } = await supabase
      .from('contract_citations')
      .select<string, { citation_text: any }>('citation_text')
      .eq('status_id', contractStatuses.published)
      .eq('contract_id', contractId);

    if (error) {
      console.error('Supabase Error:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    const citationData = data[0].citation_text as Array<{
      id: string;
      content: {
        pageNumber: number;
        citationText: string;
      }[];
    }>;
    return _.reduce(
      citationData,
      (acc: Citation[], item: any) => {
        if (item.content && item.content !== '' && item.content.length > 0) {
          acc.push({
            id: item.id,
            content: item.content,
          });
        }
        return acc;
      },
      [] as Citation[],
    );
  } catch (error) {
    console.error('Error fetching contract citations:', error);
    throw new Error('Failed to fetch contract citations');
  }
}

export async function fetchContract({ id }: { id: number }) {
  const supabase = createClient();
  noStore();
  try {
    const { data: contract, error } = await supabase
      .from('contracts')
      .select<string, any>(
        `*,
        vendors ( id, name, address, email, domain ),
        contract_types ( id, name ),
        contract_tags (
          id, tag_id,
          user_tags (
            id, name
          )
        ),
        vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
          *,
          vendor_products (
            id, name, product_code
          )
        ),
        vendor_products_users:vendor_products_users!vendor_products_users_contract_id_fkey (
          id, product_id, number_of_users, enterprise, contract_id,
          vendor_products (
            id, name, product_code
          )
        )`,
      )
      .eq('id', id)
      .single();
    if (error) {
      throw error;
    }

    return contract;
  } catch (error: any) {
    console.error('Supabase Error:');
    throw new Error(error.message);
  }
}

type LineageEndpoint = {
  id: number;
  organization_id: string | null;
  vendor_id: number | null;
};

/**
 * Narrows the generated `string | null` column to the DB CHECK's closed set.
 * NULL = the single hierarchy edge; 'billing' = an additional invoice parent.
 */
export type ContractRelationshipType = 'billing' | null;

/**
 * Delegates to the same DB function the `contract_relationships` trigger uses,
 * so the relatedness rule (shared id, shared merge lineage, or a corporate
 * action pair in either direction) is defined in exactly one place.
 */
async function areVendorsRelated(a: number, b: number): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    'contract_relationship_vendors_related',
    { p_vendor_a: a, p_vendor_b: b },
  );

  if (error) throw error;
  return data === true;
}

async function fetchLineageEndpoints(
  parentId: number,
  childId: number,
): Promise<{ parent: LineageEndpoint; child: LineageEndpoint }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contracts')
    .select('id, organization_id, vendor_id')
    .in('id', [parentId, childId]);

  if (error) throw error;

  const rows = (data ?? []) as LineageEndpoint[];
  const parent = rows.find((row) => row.id === parentId);
  const child = rows.find((row) => row.id === childId);
  if (!parent || !child) {
    throw new Error(
      `Cannot link contracts ${parentId} -> ${childId}: contract not found`,
    );
  }
  return { parent, child };
}

/**
 * Guards the relationship write: parent and child must belong to the same org
 * and to related vendors. A violation means an upstream lineage bug, so it
 * alerts rather than failing silently.
 */
async function assertLineageAllowed(
  parentId: number,
  childId: number,
): Promise<void> {
  const { parent, child } = await fetchLineageEndpoints(parentId, childId);
  const context = { parentContractId: parentId, childContractId: childId };

  if (parent.organization_id !== child.organization_id) {
    const error = new ContractLineageInvariantError(
      `Cannot link contracts across organizations (${parent.organization_id} -> ${child.organization_id})`,
    );
    logAlert('contract-relationship-invalid', error, context, error.message);
    throw error;
  }

  if (parent.vendor_id == null || child.vendor_id == null) {
    logger.warn(
      context,
      'Skipping vendor relatedness check: vendor_id is null',
    );
    return;
  }

  if (await areVendorsRelated(parent.vendor_id, child.vendor_id)) return;

  const error = new ContractLineageInvariantError(
    `Cannot link contracts with unrelated vendors (${parent.vendor_id} -> ${child.vendor_id})`,
  );
  logAlert('contract-relationship-invalid', error, context, error.message);
  throw error;
}

/**
 * A pair holds exactly one edge (UNIQUE parent+child), so `ignoreDuplicates`
 * swallowing the write means the pair is already linked. For a hierarchy edge
 * that is the intended no-op: re-running detection over settled data hits it
 * constantly. A billing edge is only ever requested for a parent the child is
 * *not* linked to, so a collision means the caller picked a parent that is
 * already the hierarchy parent -- an upstream bug that must not pass as success.
 */
function assertTypedEdgeWritten(
  relationship_type: ContractRelationshipType,
  written: boolean,
  context: { parentContractId: number; childContractId: number },
): void {
  if (relationship_type === null || written) return;

  const message =
    'Cannot add a ' +
    relationship_type +
    ' edge for ' +
    context.parentContractId +
    ' -> ' +
    context.childContractId +
    ': the pair is already linked';
  const error = new ContractLineageInvariantError(message);
  logAlert('contract-relationship-invalid', error, context, message);
  throw error;
}

/**
 * Vendor identity is not stored on the relationship: it is derived from the
 * linked contracts, which already carry the matched (historical) vendor id.
 * `metadata.vendor_id` still records the vendor the match was made under.
 *
 * `relationship_type` defaults to NULL, the hierarchy edge, so every existing
 * caller keeps its current behavior.
 */
export async function saveContractLineage(
  parent_contract_id: number,
  child_contract_id: number,
  metadata?: Json,
  relationship_type: ContractRelationshipType = null,
) {
  await assertLineageAllowed(parent_contract_id, child_contract_id);

  const supabase = createClient();
  const { data, error } = await supabase
    .from('contract_relationships')
    .upsert(
      {
        parent_contract_id,
        child_contract_id,
        metadata,
        relationship_type,
      },
      {
        onConflict: 'parent_contract_id,child_contract_id',
        ignoreDuplicates: true,
      },
    )
    .select();

  if (error) throw error;

  assertTypedEdgeWritten(relationship_type, Boolean(data?.[0]), {
    parentContractId: parent_contract_id,
    childContractId: child_contract_id,
  });

  return data?.[0];
}

/**
 * `vendorIds` is the full merge lineage (see `expandVendorLineageIds`), not a
 * single vendor: matching contracts may be stored under a sibling id from a
 * corporate action.
 */
export async function findContractsWithMatchingProducts(
  vendorIds: number[],
  organizationId: string,
  products_list: any[],
  contractId: number,
  typeIds: readonly number[],
) {
  const supabase = createClient();
  const userIds = await getAllOrgUsers(organizationId);

  const productIds = products_list.map((product: any) => product.product_id);

  const { data, error } = await supabase
    .from('contracts')
    .select<string, any>(
      `
      id,
      type_id,
      status_id,
      vendor_products_details (
        *,
        vendor_products (
          id,
          name
        )
      ),
      contract_types (
        id,
        name
      )
    `,
    )
    .in('vendor_id', vendorIds)
    .eq('status_id', 4) // Active contracts
    .in('type_id', typeIds)
    .in('user_id', userIds)
    .not('id', 'eq', contractId);

  if (error) throw error;

  const matchingContracts = data?.filter((contract: any) => {
    if (!contract.vendor_products_details?.length) return false;

    return contract.vendor_products_details.some((detail: any) => {
      const productId = detail.vendor_products?.id;
      return productId && productIds.includes(productId);
    });
  });

  return matchingContracts || [];
}

// START NEW HELPER FUNCTION
/**
 * Resolve per-org ICT provider status onto each contract's vendor.
 *
 * MUST be called AFTER adaptContractsWithCurrentVendorInfo so that
 * contract.vendor_id is the current (post-merge) canonical vendor id.
 * Looking up against the original vendor_id misses settings the user has
 * applied to the merged-into vendor.
 *
 * Why a separate query rather than the previous nested join under
 * `vendors.organization_vendor_settings`: vendors are global, the join
 * embeds settings keyed on the original vendor_id, and the post-fetch
 * vendor adapter remaps vendor_id later. The two layers disagreed, so
 * different contracts of the same display vendor (e.g. LexisNexis) ended
 * up with different ict_provider values. Resolving once, here, against
 * the current vendor_id and the requesting organization keeps every
 * contract for a given vendor consistent.
 */
async function resolveAndCleanIctProviderStatus(
  contracts: any[],
  organizationId: string,
): Promise<any[]> {
  if (!contracts || contracts.length === 0) {
    return [];
  }

  const supabase = createClient();
  const vendorIds = Array.from(
    new Set(
      contracts
        .map((c) => c?.vendor_id)
        .filter((id): id is number => typeof id === 'number'),
    ),
  );

  const ictByVendorId = new Map<number, boolean | null>();
  if (vendorIds.length > 0) {
    const { data, error } = await supabase
      .from('organization_vendor_settings')
      .select('vendor_id, settings')
      .eq('organization_id', organizationId)
      .in('vendor_id', vendorIds);
    if (error) {
      // Every vendor then resolves to ict_provider: null, which is also a valid
      // "not an ICT provider" answer — so the failure is indistinguishable from
      // a real result downstream. Alerted rather than thrown: this only enriches
      // display data, and failing the whole contract fetch over a settings
      // lookup would be worse than serving contracts without the ICT flag.
      logAlert(
        'organization-vendor-settings-load-failure',
        error,
        { organizationId, vendorCount: vendorIds.length },
        'Failed to load organization_vendor_settings for ICT resolution',
      );
    } else {
      for (const row of data ?? []) {
        const provider = (
          row.settings as { ict_provider?: boolean | null } | null
        )?.ict_provider;
        ictByVendorId.set(
          row.vendor_id,
          typeof provider === 'boolean' ? provider : null,
        );
      }
    }
  }

  return contracts.map((contract: any) => {
    const mutableContract = { ...contract };
    const ictProvider =
      typeof contract?.vendor_id === 'number'
        ? (ictByVendorId.get(contract.vendor_id) ?? null)
        : null;
    if (mutableContract.vendors) {
      mutableContract.vendors = {
        ...mutableContract.vendors,
        ict_provider: ictProvider,
      };
      delete mutableContract.vendors.organization_vendor_settings;
    }
    return mutableContract;
  });
}
// END NEW HELPER FUNCTION

// Functions below have no user role filtering!
export async function getContractDocument(contractId: number) {
  const supabase = createClient();
  const { data: contractDocData, error: filePathError } = await supabase
    .from('contract_docs')
    .select('file_path')
    .eq('contract_id', contractId)
    .single();
  if (filePathError) throw filePathError;
  const { file_path } = contractDocData;
  if (!file_path) throw new Error('File path not found');
  const { data, error: downloadError } = await supabase.storage
    .from('contract_docs')
    .download(file_path);
  if (downloadError) {
    throw downloadError;
  }
  return data;
}

export async function getContractById(contractId: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('contracts')
    .select<
      string,
      any
    >('*, vendor_products_details(*, vendor_products(id, name, product_code, vendors(id, name)))')
    .eq('id', contractId)
    .single();
  if (error) throw error;
  return data;
}

// ===== Contract ACL Functions =====

export async function getContractACL(contractId: number) {
  const supabase = createClient();
  noStore();

  try {
    const usersResult = await supabase
      .from('contract_acl_user')
      .select(
        `
        user_id,
        perm,
        users (
          id,
          name,
          email,
          signed_up
        )
      `,
      )
      .eq('contract_id', contractId);

    const groupsResult = await supabase
      .from('contract_acl_group')
      .select(
        `
        group_id,
        perm,
        groups (
          id,
          name,
          public_uuid,
          group_members (
            user_id,
            users (
              id,
              name,
              email
            )
          )
        )
      `,
      )
      .eq('contract_id', contractId);

    if (usersResult.error) throw usersResult.error;
    if (groupsResult.error) throw groupsResult.error;

    const users = (usersResult.data || []).map((item: any) => ({
      id: item.user_id,
      name: item.users?.name || '',
      email: item.users?.email || '',
      perm: item.perm,
      signedUp: item.users?.signed_up,
    }));

    const groups = (groupsResult.data || []).map((item: any) => ({
      id: item.group_id,
      name: item.groups?.name || '',
      publicUuid: item.groups?.public_uuid || '',
      memberCount: item.groups?.group_members?.length || 0,
      perm: item.perm,
      members: (item.groups?.group_members || []).map((m: any) => ({
        id: m.users?.id || m.user_id,
        name: m.users?.name || '',
        email: m.users?.email || '',
      })),
    }));

    return {
      users,
      groups,
    };
  } catch (error) {
    logger.error({ error, contractId }, 'Failed to fetch contract ACL');
    throw error;
  }
}

export async function getUsersWhoCanSeeContract(
  contractId: number,
  organizationId: string,
): Promise<
  Array<{
    userId: string;
    email: string;
    name: string;
    organizationId: string;
    perm: PermissionLevel;
    signedUp: boolean;
    permissionSources: string[];
  }>
> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase.rpc('users_who_can_see_contracts', {
      p_contract_ids: [contractId],
      p_organization_id: organizationId,
    } as any);

    if (error) {
      logger.error(
        { error, contractId, organizationId },
        'Failed to fetch users who can see contract',
      );
      throw new DatabaseError('Failed to fetch contract viewers', error);
    }

    return (data || []).map((row: any) => ({
      userId: row.user_id,
      email: row.email,
      name: row.name,
      organizationId: row.organization_id,
      perm: row.perm,
      signedUp: row.signed_up,
      permissionSources: row.permission_sources || [],
    }));
  } catch (error) {
    logger.error(
      { error, contractId, organizationId },
      'Error fetching users who can see contract',
    );
    throw error;
  }
}

export async function getUsersWhoCanSeeContracts(
  contractIds: number[],
  organizationId: string,
): Promise<
  Array<{
    contractId: number;
    userId: string;
    email: string;
    name: string;
    organizationId: string;
    perm: PermissionLevel;
    signedUp: boolean;
    permissionSources: string[]; // Array of sources like ['direct_acl', 'org_admin']
  }>
> {
  const supabase = createClient();

  if (contractIds.length === 0) {
    return [];
  }

  try {
    const { data, error } = await supabase.rpc('users_who_can_see_contracts', {
      p_contract_ids: contractIds,
      p_organization_id: organizationId,
    } as any);

    if (error) {
      logger.error(
        { error, contractIds, organizationId },
        'Failed to fetch users who can see contracts',
      );
      throw new DatabaseError('Failed to fetch contract viewers', error);
    }

    return (data || []).map((row: any) => ({
      contractId: row.contract_id,
      userId: row.user_id,
      email: row.email,
      name: row.name,
      organizationId: row.organization_id,
      perm: row.perm,
      signedUp: row.signed_up,
      permissionSources: row.permission_sources || [],
    }));
  } catch (error) {
    logger.error(
      { error, contractIds, organizationId },
      'Error fetching users who can see contracts',
    );
    throw error;
  }
}

/**
 * Fetch ACLs for multiple contracts in a single query (bulk operation)
 * Returns ACLs keyed by contract ID for efficient lookup
 */
export async function getBulkContractACLs(
  contractIds: number[],
  organizationId: string,
) {
  const supabase = createClient();
  noStore();

  if (contractIds.length === 0) {
    return {};
  }

  try {
    // Fetch users, direct groups, and folder-inherited groups in parallel
    const [usersResult, directGroupsResult, folderContractsResult] =
      await Promise.all([
        supabase.rpc('users_who_can_see_contracts', {
          p_contract_ids: contractIds,
          p_organization_id: organizationId,
        } as any),
        supabase
          .from('contract_acl_group')
          .select(
            `
          contract_id,
          perm,
          groups (
            id,
            name,
            public_uuid,
            group_members (
              user_id,
              users (
                id,
                name,
                email
              )
            )
          )
        `,
          )
          .in('contract_id', contractIds),
        // Get folder mappings for these contracts
        supabase
          .from('folder_contracts')
          .select('contract_id, folder_id')
          .in('contract_id', contractIds)
          .eq('organization_id', organizationId),
      ]);

    if (usersResult.error) throw usersResult.error;
    if (directGroupsResult.error) throw directGroupsResult.error;
    if (folderContractsResult.error) throw folderContractsResult.error;

    // Fetch folder-inherited groups if contracts are in folders
    let folderInheritedGroups: Array<{
      contract_id: number;
      group_id: number;
      perm: PermissionLevel;
      groups: any;
    }> = [];

    const folderMappings = folderContractsResult.data || [];
    if (folderMappings.length > 0) {
      const folderIds = [...new Set(folderMappings.map((m) => m.folder_id))];

      // Get folder paths
      const { data: folders, error: foldersError } = await supabase
        .from('folders')
        .select('id, path')
        .in('id', folderIds)
        .eq('organization_id', organizationId);

      if (foldersError) throw foldersError;

      if (folders && folders.length > 0) {
        // Get all folder_acl_group entries where the folder path is an ancestor of our contract folders
        const { data: folderGroupACLs, error: folderGroupsError } =
          await supabase
            .from('folder_acl_group')
            .select(
              `
            folder_id,
            perm,
            groups (
              id,
              name,
              public_uuid,
              group_members (
                user_id,
                users (
                  id,
                  name,
                  email
                )
              )
            )
          `,
            )
            .eq('organization_id', organizationId);

        if (folderGroupsError) throw folderGroupsError;

        if (folderGroupACLs && folderGroupACLs.length > 0) {
          // Get folder paths for ACL folders
          const aclFolderIds = [
            ...new Set(folderGroupACLs.map((a) => a.folder_id)),
          ];
          const { data: aclFolders, error: aclFoldersError } = await supabase
            .from('folders')
            .select('id, path')
            .in('id', aclFolderIds)
            .eq('organization_id', organizationId);

          if (aclFoldersError) throw aclFoldersError;

          const aclFolderPaths = new Map(
            (aclFolders || []).map((f) => [f.id, f.path as string]),
          );
          const contractFolderPaths = new Map(
            folders.map((f) => [f.id, f.path as string]),
          );

          // Map folder-group ACLs to contracts via path inheritance
          for (const mapping of folderMappings) {
            const contractFolderPath = contractFolderPaths.get(
              mapping.folder_id,
            );
            if (!contractFolderPath) continue;

            for (const acl of folderGroupACLs) {
              const aclFolderPath = aclFolderPaths.get(acl.folder_id);
              if (!aclFolderPath) continue;

              // Check if ACL folder is an ancestor of or equal to contract's folder
              // Using string prefix check for ltree paths
              if (
                contractFolderPath === aclFolderPath ||
                contractFolderPath.startsWith(aclFolderPath + '.')
              ) {
                folderInheritedGroups.push({
                  contract_id: mapping.contract_id,
                  group_id: acl.groups?.id,
                  perm: acl.perm as PermissionLevel,
                  groups: acl.groups,
                });
              }
            }
          }
        }
      }
    }

    // Combine direct and folder-inherited groups
    const groupsResult = {
      data: directGroupsResult.data || [],
      error: null,
    };

    // Group results by contract_id
    const aclsByContract: Record<
      number,
      {
        users: Array<{
          id: string;
          name: string;
          email: string;
          perm: PermissionLevel;
          signedUp: boolean;
          permissionSources: string[];
        }>;
        groups: Array<{
          id: number;
          name: string;
          perm: PermissionLevel;
          memberCount: number;
          publicUuid: string;
          members: Array<{ id: string; name: string; email: string }>;
        }>;
      }
    > = {};

    // Initialize empty arrays for all contract IDs
    contractIds.forEach((id) => {
      aclsByContract[id] = { users: [], groups: [] };
    });

    // Permission priority for deduplication
    const permPriority: Record<string, number> = {
      admin: 3,
      write: 2,
      read: 1,
    };

    // Helper to add group to contract (with deduplication)
    const addGroupToContract = (contractId: number, item: any) => {
      if (!aclsByContract[contractId]) return;

      const groupId = item.groups?.id || item.group_id;
      const existingIndex = aclsByContract[contractId].groups.findIndex(
        (g) => g.id === groupId,
      );

      const newGroup = {
        id: groupId,
        name: item.groups?.name || '',
        perm: item.perm,
        memberCount: item.groups?.group_members?.length || 0,
        publicUuid: item.groups?.public_uuid || '',
        members: (item.groups?.group_members || []).map((m: any) => ({
          id: m.users?.id || m.user_id,
          name: m.users?.name || '',
          email: m.users?.email || '',
        })),
      };

      if (existingIndex === -1) {
        aclsByContract[contractId].groups.push(newGroup);
      } else {
        // Keep higher permission
        const existingPerm =
          aclsByContract[contractId].groups[existingIndex].perm;
        if (
          (permPriority[item.perm] || 0) > (permPriority[existingPerm] || 0)
        ) {
          aclsByContract[contractId].groups[existingIndex] = newGroup;
        }
      }
    };

    // Populate direct groups
    (groupsResult.data || []).forEach((item: any) => {
      addGroupToContract(item.contract_id, item);
    });

    // Populate folder-inherited groups
    folderInheritedGroups.forEach((item) => {
      addGroupToContract(item.contract_id, item);
    });

    const data = usersResult.data;

    (data || []).forEach((item: any) => {
      const contractUsers = aclsByContract[item.contract_id].users;
      const existingUserIndex = contractUsers.findIndex(
        (u) => u.id === item.user_id,
      );

      const newUser = {
        id: item.user_id,
        name: item.name || '',
        email: item.email || '',
        perm: item.perm,
        signedUp: item.signed_up,
        permissionSources: item.permission_sources || [],
      };

      if (existingUserIndex === -1) {
        // User doesn't exist yet, add them
        contractUsers.push(newUser);
      } else {
        // User exists, keep the one with higher permission but merge sources
        const existingUser = contractUsers[existingUserIndex];
        const existingPriority = permPriority[existingUser.perm] || 0;
        const newPriority = permPriority[item.perm] || 0;

        if (newPriority > existingPriority) {
          // Replace with higher permission, merge permission sources
          contractUsers[existingUserIndex] = {
            ...newUser,
            permissionSources: [
              ...new Set([
                ...existingUser.permissionSources,
                ...newUser.permissionSources,
              ]),
            ],
          };
        } else {
          // Keep existing permission but merge sources
          existingUser.permissionSources = [
            ...new Set([
              ...existingUser.permissionSources,
              ...newUser.permissionSources,
            ]),
          ];
        }
      }
    });

    return aclsByContract;
  } catch (error) {
    logger.error(
      { error, contractIds: contractIds.length },
      'Failed to fetch bulk contract ACLs',
    );
    throw error;
  }
}

export async function addUserToContract(
  contractId: number,
  userId: string,
  perm: 'read' | 'write' | 'admin' = 'read',
  userRole?: number,
) {
  const supabase = createClient();
  noStore();

  try {
    // Get user metadata for organization_id
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      throw new Error('User metadata not found');
    }

    const { error } = await supabase.from('contract_acl_user').insert({
      contract_id: contractId,
      user_id: userId,
      organization_id: userMetadata.organizationId,
      perm,
    });

    if (error) {
      // Ignore duplicate errors
      if (error.code === '23505') {
        logger.info({ contractId, userId }, 'User already has contract access');
        return;
      }
      throw error;
    }

    logger.info({ contractId, userId, perm }, 'Added user to contract');
  } catch (error) {
    logger.error(
      { error, contractId, userId },
      'Failed to add user to contract',
    );
    throw error;
  }
}

export async function removeUserFromContract(
  contractId: number,
  userId: string,
  userRole?: number,
) {
  const supabase = createClient();
  noStore();

  try {
    const { error } = await supabase
      .from('contract_acl_user')
      .delete()
      .eq('contract_id', contractId)
      .eq('user_id', userId);

    if (error) throw error;

    logger.info({ contractId, userId }, 'Removed user from contract');
  } catch (error) {
    logger.error(
      { error, contractId, userId },
      'Failed to remove user from contract',
    );
    throw error;
  }
}

export async function addGroupToContract(
  contractId: number,
  groupId: number,
  perm: 'read' | 'write' | 'admin' = 'read',
) {
  const supabase = createClient();
  noStore();

  try {
    // Get user metadata for organization_id
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      throw new Error('User metadata not found');
    }

    const { error } = await supabase.from('contract_acl_group').insert({
      contract_id: contractId,
      group_id: groupId,
      organization_id: userMetadata.organizationId,
      perm,
    });

    if (error) {
      // Ignore duplicate errors
      if (error.code === '23505') {
        logger.info(
          { contractId, groupId },
          'Group already has contract access',
        );
        return;
      }
      throw error;
    }

    logger.info({ contractId, groupId, perm }, 'Added group to contract');

    // Invalidate contract cache for entire organization
    try {
      const currentUser = await getUserMetadata();
      if (currentUser) {
        const cacheService = await getCacheService();
        await cacheService.invalidateContractSetForOrg(currentUser);
        logger.info(
          { organizationId: currentUser.organizationId },
          'Invalidated all contract caches for org after adding group ACL',
        );
      }
    } catch (cacheError) {
      logger.warn(
        { error: cacheError },
        'Failed to invalidate cache after adding group to contract',
      );
    }
  } catch (error) {
    logger.error(
      { error, contractId, groupId },
      'Failed to add group to contract',
    );
    throw error;
  }
}

export async function removeGroupFromContract(
  contractId: number,
  groupId: number,
) {
  const supabase = createClient();
  noStore();

  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new Error('User metadata not found');
  }

  try {
    const { error } = await supabase
      .from('contract_acl_group')
      .delete()
      .eq('organization_id', userMetadata.organizationId)
      .eq('contract_id', contractId)
      .eq('group_id', groupId);

    if (error) throw error;

    logger.info({ contractId, groupId }, 'Removed group from contract');

    // Invalidate contract cache for entire organization
    try {
      const currentUser = await getUserMetadata();
      if (currentUser) {
        const cacheService = await getCacheService();
        await cacheService.invalidateContractSetForOrg(currentUser);
        logger.info(
          { organizationId: currentUser.organizationId },
          'Invalidated all contract caches for org after removing group ACL',
        );
      }
    } catch (cacheError) {
      logger.warn(
        { error: cacheError },
        'Failed to invalidate cache after removing group from contract',
      );
    }
  } catch (error) {
    logger.error(
      { error, contractId, groupId },
      'Failed to remove group from contract',
    );
    throw error;
  }
}

// ============================================================================
// Bulk ACL Operations
// ============================================================================

/**
 * Add a user to multiple contracts in a single bulk operation
 * First removes any existing entries, then inserts new ones
 */
export async function bulkAddUserToContracts(
  contractIds: number[],
  userId: string,
  organizationId: string,
  perm: 'read' | 'write' | 'admin' = 'read',
  userRole?: number,
): Promise<{ success: boolean; insertedCount: number }> {
  if (contractIds.length === 0) {
    return { success: true, insertedCount: 0 };
  }

  const supabase = createClient();
  noStore();

  try {
    // First, remove any existing ACL entries for this user on these contracts
    // This ensures we don't get duplicate key errors
    const { error: deleteError } = await supabase
      .from('contract_acl_user')
      .delete()
      .in('contract_id', contractIds)
      .eq('user_id', userId)
      .eq('organization_id', organizationId);

    if (deleteError) {
      logger.warn(
        { error: deleteError, contractIds, userId },
        'Failed to remove existing user ACL entries before bulk add',
      );
    }

    // Now insert the new entries
    const records = contractIds.map((contractId) => ({
      contract_id: contractId,
      user_id: userId,
      organization_id: organizationId,
      perm,
    }));

    const { data, error } = await supabase
      .from('contract_acl_user')
      .insert(records)
      .select();

    if (error) throw error;

    const insertedCount = data?.length ?? 0;
    logger.info(
      { contractIds, userId, perm, insertedCount },
      'Bulk added user to contracts',
    );

    return { success: true, insertedCount };
  } catch (error) {
    logger.error(
      { error, contractIds, userId },
      'Failed to bulk add user to contracts',
    );
    throw error;
  }
}

/**
 * Remove a user from multiple contracts in a single bulk delete
 */
export async function bulkRemoveUserFromContracts(
  contractIds: number[],
  userId: string,
  organizationId: string,
  userRole?: number,
): Promise<{ success: boolean; deletedCount: number }> {
  if (contractIds.length === 0) {
    return { success: true, deletedCount: 0 };
  }

  const supabase = createClient();
  noStore();

  try {
    const { data, error } = await supabase
      .from('contract_acl_user')
      .delete()
      .in('contract_id', contractIds)
      .eq('user_id', userId)
      .select();

    if (error) throw error;

    const deletedCount = data?.length ?? 0;
    logger.info(
      { contractIds, userId, deletedCount },
      'Bulk removed user from contracts',
    );

    return { success: true, deletedCount };
  } catch (error) {
    logger.error(
      { error, contractIds, userId },
      'Failed to bulk remove user from contracts',
    );
    throw error;
  }
}

/**
 * Add a group to multiple contracts in a single bulk operation
 * First removes any existing entries, then inserts new ones
 */
export async function bulkAddGroupToContracts(
  contractIds: number[],
  groupId: number,
  organizationId: string,
  perm: 'read' | 'write' | 'admin' = 'read',
): Promise<{ success: boolean; insertedCount: number }> {
  if (contractIds.length === 0) {
    return { success: true, insertedCount: 0 };
  }

  const supabase = createClient();
  noStore();

  try {
    // First, remove any existing ACL entries for this group on these contracts
    const { error: deleteError } = await supabase
      .from('contract_acl_group')
      .delete()
      .in('contract_id', contractIds)
      .eq('group_id', groupId)
      .eq('organization_id', organizationId);

    if (deleteError) {
      logger.warn(
        { error: deleteError, contractIds, groupId },
        'Failed to remove existing group ACL entries before bulk add',
      );
    }

    // Now insert the new entries
    const records = contractIds.map((contractId) => ({
      contract_id: contractId,
      group_id: groupId,
      organization_id: organizationId,
      perm,
    }));

    const { data, error } = await supabase
      .from('contract_acl_group')
      .insert(records)
      .select();

    if (error) throw error;

    const insertedCount = data?.length ?? 0;
    logger.info(
      { contractIds, groupId, perm, insertedCount },
      'Bulk added group to contracts',
    );

    // Invalidate contract cache for entire organization (group access affects multiple users)
    try {
      const currentUser = await getUserMetadata();
      if (currentUser) {
        const cacheService = await getCacheService();
        await cacheService.invalidateContractSetForOrg(currentUser);
        logger.info(
          { organizationId },
          'Invalidated all contract caches for org after bulk adding group ACL',
        );
      }
    } catch (cacheError) {
      logger.warn(
        { error: cacheError },
        'Failed to invalidate cache after bulk adding group to contracts',
      );
    }

    return { success: true, insertedCount };
  } catch (error) {
    logger.error(
      { error, contractIds, groupId },
      'Failed to bulk add group to contracts',
    );
    throw error;
  }
}

/**
 * Remove a group from multiple contracts in a single bulk delete
 */
export async function bulkRemoveGroupFromContracts(
  contractIds: number[],
  groupId: number,
  organizationId: string,
): Promise<{ success: boolean; deletedCount: number }> {
  if (contractIds.length === 0) {
    return { success: true, deletedCount: 0 };
  }

  const supabase = createClient();
  noStore();

  try {
    const { data, error } = await supabase
      .from('contract_acl_group')
      .delete()
      .in('contract_id', contractIds)
      .eq('group_id', groupId)
      .select();

    if (error) throw error;

    const deletedCount = data?.length ?? 0;
    logger.info(
      { contractIds, groupId, deletedCount },
      'Bulk removed group from contracts',
    );

    // Invalidate contract cache for entire organization
    try {
      const currentUser = await getUserMetadata();
      if (currentUser) {
        const cacheService = await getCacheService();
        await cacheService.invalidateContractSetForOrg(currentUser);
        logger.info(
          { organizationId },
          'Invalidated all contract caches for org after bulk removing group ACL',
        );
      }
    } catch (cacheError) {
      logger.warn(
        { error: cacheError },
        'Failed to invalidate cache after bulk removing group from contracts',
      );
    }

    return { success: true, deletedCount };
  } catch (error) {
    logger.error(
      { error, contractIds, groupId },
      'Failed to bulk remove group from contracts',
    );
    throw error;
  }
}

// ============================================================================
// Group Filter Functions
// ============================================================================

/**
 * Get all groups that have contracts shared with them (via contract_acl_group or folder_acl_group)
 * Used for populating filter dropdowns
 */
export async function getGroupsWithContracts(organizationId: string): Promise<
  Array<{
    id: number;
    name: string;
    publicUuid: string;
  }>
> {
  const supabase = createClient();
  noStore();

  try {
    // Get groups from direct contract ACLs
    const { data: directGroups, error: directError } = await supabase
      .from('contract_acl_group')
      .select(
        `
        groups (
          id,
          name,
          public_uuid
        )
      `,
      )
      .eq('organization_id', organizationId);

    if (directError) throw directError;

    // Get groups from folder ACLs
    const { data: folderGroups, error: folderError } = await supabase
      .from('folder_acl_group')
      .select(
        `
        groups (
          id,
          name,
          public_uuid
        )
      `,
      )
      .eq('organization_id', organizationId);

    if (folderError) throw folderError;

    // Combine and deduplicate groups
    const groupMap = new Map<
      number,
      { id: number; name: string; publicUuid: string }
    >();

    [...(directGroups || []), ...(folderGroups || [])].forEach((item: any) => {
      if (item.groups?.id && !groupMap.has(item.groups.id)) {
        groupMap.set(item.groups.id, {
          id: item.groups.id,
          name: item.groups.name || '',
          publicUuid: item.groups.public_uuid || '',
        });
      }
    });

    // Sort by name
    return Array.from(groupMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  } catch (error) {
    logger.error(
      { error, organizationId },
      'Failed to get groups with contracts',
    );
    throw error;
  }
}

/**
 * Get all contract IDs that belong to a specific group
 * Includes both direct (contract_acl_group) and folder-inherited (folder_acl_group) assignments
 */
export async function getContractIdsForGroup(
  groupId: number,
  organizationId: string,
): Promise<number[]> {
  const supabase = createClient();
  noStore();

  try {
    // Get direct contract ACLs for this group
    const { data: directACLs, error: directError } = await supabase
      .from('contract_acl_group')
      .select('contract_id')
      .eq('group_id', groupId)
      .eq('organization_id', organizationId);

    if (directError) throw directError;

    const directContractIds = (directACLs || []).map((a) => a.contract_id);

    // Get folder ACLs for this group
    const { data: folderACLs, error: folderError } = await supabase
      .from('folder_acl_group')
      .select('folder_id')
      .eq('group_id', groupId)
      .eq('organization_id', organizationId);

    if (folderError) throw folderError;

    let folderContractIds: number[] = [];

    if (folderACLs && folderACLs.length > 0) {
      const folderIds = folderACLs.map((a) => a.folder_id);

      // Get folder paths
      const { data: folders, error: foldersError } = await supabase
        .from('folders')
        .select('id, path')
        .in('id', folderIds)
        .eq('organization_id', organizationId);

      if (foldersError) throw foldersError;

      if (folders && folders.length > 0) {
        // Build OR conditions for path inheritance
        // For each folder, find contracts in that folder or any descendant folder
        const folderPaths = folders.map((f) => f.path as string);

        // Get all folders that are descendants of (or equal to) ACL folders
        const { data: descendantFolders, error: descError } = await supabase
          .from('folders')
          .select('id, path')
          .eq('organization_id', organizationId);

        if (descError) throw descError;

        const matchingFolderIds: number[] = [];
        (descendantFolders || []).forEach((folder) => {
          const folderPath = folder.path as string;
          // Check if this folder is equal to or a descendant of any ACL folder
          if (
            folderPaths.some(
              (aclPath) =>
                folderPath === aclPath || folderPath.startsWith(aclPath + '.'),
            )
          ) {
            matchingFolderIds.push(folder.id);
          }
        });

        if (matchingFolderIds.length > 0) {
          // Get contracts in matching folders
          const { data: folderContracts, error: fcError } = await supabase
            .from('folder_contracts')
            .select('contract_id')
            .in('folder_id', matchingFolderIds)
            .eq('organization_id', organizationId);

          if (fcError) throw fcError;

          folderContractIds = (folderContracts || []).map(
            (fc) => fc.contract_id,
          );
        }
      }
    }

    // Combine and deduplicate
    const allContractIds = [
      ...new Set([...directContractIds, ...folderContractIds]),
    ];

    logger.debug(
      {
        groupId,
        directCount: directContractIds.length,
        folderCount: folderContractIds.length,
        totalCount: allContractIds.length,
      },
      'Got contract IDs for group',
    );

    return allContractIds;
  } catch (error) {
    logger.error(
      { error, groupId, organizationId },
      'Failed to get contract IDs for group',
    );
    throw error;
  }
}

// ============================================================================
// Amendment Chain Functions
// ============================================================================

/**
 * Contract type for amendment chain processing
 * More flexible than the main Contract interface to handle various contract shapes
 */
interface AmendmentContract {
  id: number;
  [key: string]: any;
}

export interface AmendmentChainResult {
  parentContract: AmendmentContract | null;
  currentContract: AmendmentContract;
  childContracts: Array<AmendmentContract & { localAmendmentId?: string }>;
  completeHierarchy: ContractHierarchy | null;
  allContractsInHierarchy: Array<AmendmentContract & { localId: string }>;
}

/**
 * Generate local IDs for all contracts in hierarchy
 */
function generateLocalIds(
  contracts: AmendmentContract[],
  hierarchy: ContractHierarchy | null,
): Array<AmendmentContract & { localId: string }> {
  if (contracts.length === 0) {
    return [];
  }

  // If no hierarchy, fallback to simple ID-based ordering
  if (!hierarchy) {
    const contractsByType: Record<string, AmendmentContract[]> = {};

    contracts.forEach((contract) => {
      const typeName = contract.contract_types?.name || 'Unknown';
      if (!contractsByType[typeName]) {
        contractsByType[typeName] = [];
      }
      contractsByType[typeName].push(contract);
    });

    const contractsWithLocalIds: Array<
      AmendmentContract & { localId: string }
    > = [];

    Object.entries(contractsByType).forEach(([typeName, typeContracts]) => {
      const shortLabel = generateShortLabel(typeName);
      const sortedContracts = typeContracts.sort((a, b) => a.id - b.id);

      sortedContracts.forEach((contract, index) => {
        const localId =
          typeContracts.length > 1 ? `${shortLabel}-${index + 1}` : shortLabel;

        contractsWithLocalIds.push({
          ...contract,
          localId,
        });
      });
    });

    return contractsWithLocalIds;
  }

  // Create hierarchical ordering map
  const hierarchyOrder: number[] = [];
  const contractMap = new Map<number, AmendmentContract>();

  // Build contract map
  contracts.forEach((contract) => {
    contractMap.set(contract.id, contract);
  });

  // Traverse hierarchy depth-first to establish proper ordering
  function traverseHierarchy(node: ContractHierarchy) {
    hierarchyOrder.push(node.id);
    if (node.children) {
      node.children.forEach((child) => traverseHierarchy(child));
    }
  }

  traverseHierarchy(hierarchy);

  // Group contracts by type and maintain hierarchical order within each type
  const contractsByType: Record<
    string,
    { contract: AmendmentContract; hierarchyIndex: number }[]
  > = {};

  hierarchyOrder.forEach((contractId, index) => {
    const contract = contractMap.get(contractId);
    if (contract) {
      const typeName = contract.contract_types?.name || 'Unknown';
      if (!contractsByType[typeName]) {
        contractsByType[typeName] = [];
      }
      contractsByType[typeName].push({ contract, hierarchyIndex: index });
    }
  });

  // Generate local IDs respecting hierarchical order
  const contractsWithLocalIds: Array<AmendmentContract & { localId: string }> =
    [];

  Object.entries(contractsByType).forEach(([typeName, typeContracts]) => {
    const shortLabel = generateShortLabel(typeName);

    // Sort by hierarchy order (already in correct order, but being explicit)
    const orderedContracts = typeContracts.sort(
      (a, b) => a.hierarchyIndex - b.hierarchyIndex,
    );

    orderedContracts.forEach(({ contract }, index) => {
      const localId =
        typeContracts.length > 1 ? `${shortLabel}-${index + 1}` : shortLabel;

      contractsWithLocalIds.push({
        ...contract,
        localId,
      });
    });
  });

  return contractsWithLocalIds;
}

/**
 * Fetch complete amendment chain including parent and child contracts
 * Internal function - use the action wrapper in app/lib/contracts/actions.ts instead
 *
 * @param contractId - The contract ID to fetch the amendment chain for
 * @param userMetadata - User metadata for access control
 * @returns Amendment chain result with parent, current, and child contracts
 * @throws {AuthenticationError} if user has no access to any contracts in hierarchy
 *
 * @note On unexpected errors (network failures, DB errors), returns empty structure:
 *       - currentContract: {} (empty object cast to AmendmentContract)
 *       - completeHierarchy: null
 *       - Callers should check `currentContract.id` or `completeHierarchy` before use
 */
export async function fetchCompleteAmendmentChainByUserRoles({
  contractId,
  userMetadata,
}: {
  contractId: number;
  userMetadata: UserMetadata;
}): Promise<AmendmentChainResult> {
  try {
    // Fetch the complete hierarchy (unfiltered)
    const hierarchyResult = await fetchContractHierarchy(
      contractId,
      userMetadata.organizationId,
    );
    const unfilteredHierarchy = hierarchyResult.completeHierarchy;

    if (!unfilteredHierarchy) {
      return {
        parentContract: null,
        currentContract: {} as AmendmentContract,
        childContracts: [],
        completeHierarchy: null,
        allContractsInHierarchy: [],
      };
    }

    // Get all contract IDs from the complete hierarchy
    const allContractIds = new Set<number>();
    collectAllIdsFromHierarchy(unfilteredHierarchy, allContractIds);

    // Fetch all contracts in the hierarchy with user role filtering
    const allContracts = await fetchContractsByIdByUserRoles({
      ids: Array.from(allContractIds),
      userMetadata,
    });

    if (!allContracts || allContracts.length === 0) {
      throw new AuthenticationError(
        'User does not have access to any contracts in this hierarchy',
      );
    }

    // Create a set of accessible contract IDs
    const accessibleContractIds = new Set(allContracts.map((c) => c.id));

    // Filter the hierarchy to only include accessible contracts
    const filteredHierarchy = filterHierarchyByAccessibleContracts(
      unfilteredHierarchy,
      accessibleContractIds,
    );

    // Generate local IDs for all contracts using the filtered hierarchy
    const contractsWithLocalIds = generateLocalIds(
      allContracts,
      filteredHierarchy,
    );

    // Find specific contracts with their local IDs
    const currentContractWithLocalId = contractsWithLocalIds.find(
      (c) => c.id === contractId,
    );

    if (!currentContractWithLocalId) {
      throw new AuthenticationError(
        `User does not have access to contract ${contractId}`,
      );
    }

    // Find immediate parent contract in the filtered hierarchy
    const parentNode = findParentInHierarchy(filteredHierarchy, contractId);
    const parentContractWithLocalId = parentNode
      ? contractsWithLocalIds.find((c) => c.id === parentNode.id) || null
      : null;

    // Get child contracts (only addendums - type_id 3) - optimized filtering
    const currentNode = findContractInHierarchy(filteredHierarchy, contractId);
    const childContractIds = extractAllChildContractIds(currentNode);

    // Filter and find child contracts in a single pass
    const childContracts = contractsWithLocalIds.filter(
      (contract) =>
        childContractIds.includes(contract.id) && contract.type_id === 3,
    );

    return {
      parentContract: parentContractWithLocalId,
      currentContract: currentContractWithLocalId,
      childContracts: childContracts.map((contract) => ({
        ...contract,
        localAmendmentId: contract.localId, // Keep backward compatibility
      })),
      completeHierarchy: filteredHierarchy,
      allContractsInHierarchy: contractsWithLocalIds,
    };
  } catch (error) {
    logger.error(
      { error, contractId },
      'Error fetching complete amendment chain',
    );
    return {
      parentContract: null,
      currentContract: {} as AmendmentContract,
      childContracts: [],
      completeHierarchy: null,
      allContractsInHierarchy: [],
    };
  }
}
