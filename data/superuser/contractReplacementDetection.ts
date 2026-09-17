import 'server-only';

import { createClient } from '@/utils/supabase/service_server';
import { Database, Json } from '@/database.types';
import logger from '@/utils/pino';
import { contractStatuses, contractTypes } from '@/app/lib/constants';

type ContractLineageEventRow =
  Database['public']['Tables']['contract_lineage_events']['Row'];

export type ContractLineageAction = 'replace';
export type ContractLineageSource = 'ai' | 'human';
export type ContractLineageStatus =
  | 'pending'
  | 'verified'
  | 'confirmed'
  | 'rejected';

/**
 * The row with its text+CHECK columns restated as TS unions — the generated
 * types widen every CHECK-constrained column to `string`. Mirrors the psk-1830
 * pattern so callers branch on a closed set the compiler can check.
 */
export type ContractLineageEvent = Omit<
  ContractLineageEventRow,
  'action' | 'source' | 'status'
> & {
  action: ContractLineageAction;
  source: ContractLineageSource;
  status: ContractLineageStatus;
};

const DUPLICATE_KEY = '23505';

/**
 * Record an AI-detected replacement as a pending event.
 *
 * Always writes status 'pending': an extractor screens it to 'verified' before
 * the customer ever sees a prompt. Detection runs under Inngest, which retries
 * steps, so this must be safe to call repeatedly for the same pair.
 *
 * Idempotency leans on the `contract_lineage_events_dedupe` unique index.
 * Unlike the psk-1830 product-events index, that one is FULL rather than
 * partial: a rejection at either screening stage must permanently suppress
 * re-detection, so a rejected pair still collides here and re-extraction cannot
 * re-raise the prompt. 23505 is therefore treated as success — the same
 * catch-and-continue idiom used elsewhere in this directory — and yields a null
 * `eventId`, since no row was written on this pass.
 */
export async function createPendingReplacementEvent({
  oldContractId,
  newContractId,
  organizationId,
  evidence = null,
  source = 'ai',
}: {
  oldContractId: number;
  newContractId: number;
  organizationId: string;
  evidence?: Json | null;
  source?: ContractLineageSource;
}): Promise<{ created: boolean; eventId: number | null }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contract_lineage_events')
    .insert({
      old_contract_id: oldContractId,
      new_contract_id: newContractId,
      organization_id: organizationId,
      action: 'replace' satisfies ContractLineageAction,
      source,
      status: 'pending' satisfies ContractLineageStatus,
      evidence,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === DUPLICATE_KEY) {
      logger.info(
        { oldContractId, newContractId },
        'Contract replacement event already exists',
      );
      return { created: false, eventId: null };
    }
    throw error;
  }

  return { created: true, eventId: data.id };
}

/**
 * Contract ids already paired with `newContractId` by an event of ANY status,
 * in EITHER direction. Feeds the candidate filter's suppression set, so a pair
 * a human already rejected is never re-detected.
 *
 * Both directions matter because the dedupe unique index is on the ordered
 * (old, new) pair: a rejected A→B does not collide with a later B→A. Re-running
 * detection on the other contract would otherwise re-raise the same question a
 * human has already answered, so the peer id is returned whichever column the
 * new contract sits in.
 *
 * Selects ids only — `evidence` holds verbatim contract quotes and has no
 * business leaving the DB for a dedupe check.
 */
export async function fetchExistingEventOldContractIds({
  newContractId,
  organizationId,
}: {
  newContractId: number;
  organizationId: string;
}): Promise<number[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contract_lineage_events')
    .select('old_contract_id, new_contract_id')
    .eq('organization_id', organizationId)
    .or(
      `new_contract_id.eq.${newContractId},old_contract_id.eq.${newContractId}`,
    );

  if (error) throw error;

  return (data ?? []).map((row) =>
    row.new_contract_id === newContractId
      ? row.old_contract_id
      : row.new_contract_id,
  );
}

/** A contract as the candidate filter needs it, products flattened to names. */
export interface ReplacementContractRow {
  id: number;
  vendor_id: number | null;
  type_id: number | null;
  status: string | null;
  term_start_date: Json | null;
  term_end_date: Json | null;
  metadata: Json | null;
  productNames: string[];
}

/** The joined product shape PostgREST returns for the rows below. */
type ProductDetailRow = {
  vendor_products: { name: string | null } | null;
} | null;

const toProductNames = (details: ProductDetailRow[] | null): string[] => {
  const names = (details ?? [])
    .map((row) => row?.vendor_products?.name)
    .filter((name): name is string => typeof name === 'string');
  return [...new Set(names)];
};

const CONTRACT_COLUMNS = `
  id,
  vendor_id,
  type_id,
  status,
  term_start_date,
  term_end_date,
  metadata,
  vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
    vendor_products ( name )
  )
`;

type RawContractRow = Omit<ReplacementContractRow, 'productNames'> & {
  vendor_products_details: ProductDetailRow[] | null;
};

const toContractRow = (row: RawContractRow): ReplacementContractRow => ({
  id: row.id,
  vendor_id: row.vendor_id,
  type_id: row.type_id,
  status: row.status,
  term_start_date: row.term_start_date,
  term_end_date: row.term_end_date,
  metadata: row.metadata,
  productNames: toProductNames(row.vendor_products_details),
});

/**
 * One contract with the fields detection compares on.
 *
 * Product names come from `vendor_products_details`, which the
 * `process-vendor-products` step populates — hence detection running after it.
 *
 * Scoped to `organizationId` because the service client bypasses RLS: the same
 * org that scopes the peer-contract lookup and the event write must scope this
 * read, or detection could compare across tenants.
 */
export async function fetchContractForReplacement({
  contractId,
  organizationId,
}: {
  contractId: number;
  organizationId: string;
}): Promise<ReplacementContractRow | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_COLUMNS)
    .eq('id', contractId)
    .eq('organization_id', organizationId);

  if (error) throw error;

  const [row] = data ?? [];

  return row ? toContractRow(row) : null;
}

/**
 * Active contracts belonging to any vendor in the given family — the pool the
 * candidate filter narrows.
 *
 * Vendor ids are the whole merge/corporate-action family (via
 * `expandVendorLineageIds`), because a contract signed before an acquisition
 * keeps the acquired vendor's original id. Filtering on the bare id would miss
 * exactly the renewals that arrive on the acquirer's paper.
 */
export async function fetchActiveContractsForVendors({
  vendorIds,
  organizationId,
  excludeContractId,
}: {
  vendorIds: number[];
  organizationId: string;
  excludeContractId: number;
}): Promise<ReplacementContractRow[]> {
  if (vendorIds.length === 0) return [];

  const supabase = createClient();

  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_COLUMNS)
    .in('vendor_id', vendorIds)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .eq('status_id', contractStatuses.published)
    .neq('id', excludeContractId);

  if (error) throw error;

  return (data ?? []).map(toContractRow);
}
