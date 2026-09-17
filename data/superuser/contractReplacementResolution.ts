import 'server-only';

import { createClient } from '@/utils/supabase/service_server';
import { Database } from '@/database.types';
import type { ContractLineageStatus } from '@/data/superuser/contractReplacementDetection';
import { getTermEndDate } from '@/lib/contracts/replacementCandidates';

type ContractLineageEventRow =
  Database['public']['Tables']['contract_lineage_events']['Row'];

// One declaration, shared with detection, so the union and the database CHECK
// constraint cannot drift apart independently.
export type { ContractLineageStatus };

/**
 * The columns the customer surfaces resolve against. Selecting only these keeps
 * `evidence` — which holds verbatim contract quotes and the LLM's reasoning —
 * out of any payload serialized into a client component.
 *
 * `status` is restated as a TS union because the generated types widen every
 * CHECK-constrained column to `string`; mirrors the psk-1830 pattern so callers
 * branch on a closed set the compiler can check.
 */
export type ReplacementEvent = Pick<
  ContractLineageEventRow,
  'id' | 'old_contract_id' | 'new_contract_id' | 'organization_id'
> & {
  status: ContractLineageStatus;
};

const EVENT_COLUMNS = 'id, old_contract_id, new_contract_id, organization_id';

/**
 * Verified events naming any of `contractIds` as the OLD contract — the
 * contracts a replacement prompt should appear on.
 *
 * Only `verified` is returned: `pending` events have not yet passed extractor
 * screening and must stay invisible to the customer, and `confirmed`/`rejected`
 * ones are already resolved. Batched by contract id so the list view resolves
 * every row's indicator in one query rather than N.
 */
export async function fetchVerifiedEventsForContracts({
  organizationId,
  contractIds,
}: {
  organizationId: string;
  contractIds: number[];
}): Promise<ReplacementEvent[]> {
  if (contractIds.length === 0) return [];

  const supabase = createClient();

  const { data, error } = await supabase
    .from('contract_lineage_events')
    .select(EVENT_COLUMNS)
    .in('old_contract_id', contractIds)
    .eq('organization_id', organizationId)
    .eq('status', 'verified');

  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    status: 'verified' as const,
  }));
}

/**
 * Verified events naming `contractId` as the NEW contract — the prompts the
 * replacement's own detail page renders, one per old contract it may replace
 * (the dedupe unique index is on (old, new, action), so several old contracts
 * can point at the same replacement).
 *
 * Same status posture as `fetchVerifiedEventsForContracts`: only `verified`
 * events are customer-visible.
 */
export async function fetchVerifiedEventsForNewContract({
  organizationId,
  contractId,
}: {
  organizationId: string;
  contractId: number;
}): Promise<ReplacementEvent[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contract_lineage_events')
    .select(EVENT_COLUMNS)
    .eq('new_contract_id', contractId)
    .eq('organization_id', organizationId)
    .eq('status', 'verified');

  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    status: 'verified' as const,
  }));
}

/**
 * The confirmed event naming `contractId` as the OLD contract, if any — drives
 * the persistent "Replaced by" flag on an archived contract.
 *
 * The full dedupe unique index is on (old, new, action), so one old contract
 * could in principle carry confirmed events to two different new contracts.
 * That would mean a user confirmed two replacements of the same contract; the
 * flag names the most recent one rather than failing.
 */
export async function fetchConfirmedEventForOldContract({
  organizationId,
  contractId,
}: {
  organizationId: string;
  contractId: number;
}): Promise<ReplacementEvent | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contract_lineage_events')
    .select(EVENT_COLUMNS)
    .eq('old_contract_id', contractId)
    .eq('organization_id', organizationId)
    .eq('status', 'confirmed')
    .order('id', { ascending: false })
    .limit(1);

  if (error) throw error;

  const row = (data ?? [])[0];
  return row ? { ...row, status: 'confirmed' as const } : null;
}

/** The replacing contract as the banner and badge need to name it. */
export interface ReplacementContractSummary {
  id: number;
  orderNumber: string | null;
  vendorName: string | null;
  firstProductName: string | null;
  startDate: string | null;
  /** Raw ISO date the contract runs out — the LATEST `term_end_date` entry. */
  endDate: string | null;
}

interface RawSummaryRow {
  id: number;
  term_start_date: unknown;
  term_end_date: unknown;
  metadata: { lineage?: { order_number?: unknown } } | null;
  vendors: { name: string | null } | null;
  vendor_products_details: Array<{
    vendor_products: { name: string | null } | null;
  } | null> | null;
}

/**
 * `term_start_date` is a Json array of extracted `{ date }` entries. The banner
 * names when the replacing contract starts, so it reads the EARLIEST — the same
 * convention the detection filter uses, for the same reason: a later element is
 * an extension, not the original start.
 *
 * Bare strings are tolerated too: older rows store the column that way, and
 * `getNewContractDate` accepts both shapes for the same reason.
 */
function earliestDate(value: unknown): string | null {
  const dates = (Array.isArray(value) ? value : [value])
    .map((entry) =>
      entry && typeof entry === 'object'
        ? (entry as { date?: unknown }).date
        : entry,
    )
    .filter(
      (entry): entry is string => typeof entry === 'string' && entry !== '',
    )
    .sort();
  return dates[0] ?? null;
}

/**
 * The LATEST `term_end_date` entry as a date-only ISO string — `getTermEndDate`
 * owns the "an extension appends a later end date" semantics; the `Date` it
 * returns is truncated back to a bare date so `formatDate` renders it in the
 * viewer's timezone without a day shift.
 */
function latestEndDate(value: unknown): string | null {
  return getTermEndDate(value)?.toISOString().slice(0, 10) ?? null;
}

/**
 * Name, order number, first product and start date of one contract — the fields
 * the replacement prompt and the "Replaced by" flag render.
 */
export async function fetchReplacementContractSummary({
  contractId,
  organizationId,
}: {
  contractId: number;
  organizationId: string;
}): Promise<ReplacementContractSummary | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contracts')
    .select(
      `id, term_start_date, term_end_date, metadata, vendors ( name ),
       vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
         vendor_products ( name )
       )`,
    )
    .eq('id', contractId)
    .eq('organization_id', organizationId)
    .maybeSingle<RawSummaryRow>();

  if (error) throw error;
  if (!data) return null;

  const firstProduct = (data.vendor_products_details ?? []).find(
    (row) => typeof row?.vendor_products?.name === 'string',
  );

  return {
    id: data.id,
    orderNumber: (data.metadata?.lineage?.order_number ?? null) as
      | string
      | null,
    vendorName: data.vendors?.name ?? null,
    firstProductName: firstProduct?.vendor_products?.name ?? null,
    startDate: earliestDate(data.term_start_date),
    endDate: latestEndDate(data.term_end_date),
  };
}

/**
 * Move an event out of `verified` to the customer's decision.
 *
 * `expectedStatus` is applied as a filter rather than read-then-written, so two
 * concurrent resolutions of the same prompt cannot both succeed: the second
 * matches no row and reports `{ resolved: false }`. This is the optimistic
 * concurrency guard the confirm action relies on for idempotent retry — the
 * pending -> verified transition belongs to the extractor queue in hextraction,
 * never to this repo.
 *
 * Scoped to `organizationId` because the service client bypasses RLS: an event
 * id from another org must not resolve here.
 */
export async function resolveReplacementEvent({
  eventId,
  organizationId,
  status,
  userId,
  expectedStatus = 'verified',
}: {
  eventId: number;
  organizationId: string;
  status: Extract<ContractLineageStatus, 'confirmed' | 'rejected'>;
  userId: string;
  expectedStatus?: Extract<ContractLineageStatus, 'verified'>;
}): Promise<{ resolved: boolean }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('contract_lineage_events')
    .update({
      status,
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .eq('organization_id', organizationId)
    .eq('status', expectedStatus)
    .select('id');

  if (error) throw error;

  return { resolved: (data ?? []).length > 0 };
}

/**
 * Confirm any verified replacement prompt whose OLD contract was just archived.
 *
 * The banner's "Yes" button is not the only way a contract gets archived — the
 * ordinary archive button (and its descendant cascade) reaches the same end
 * state without ever touching the event. Left alone, the prompt would keep
 * asking the customer to archive a contract that is already archived.
 *
 * Archiving is treated as the answer itself: the customer did the thing the
 * prompt asked for, so the event resolves to `confirmed` with them as
 * `resolved_by`. Only `verified` events are eligible — `resolveReplacementEvent`
 * applies that as a filter, so a prompt still pending extractor screening, or
 * one already resolved, is left untouched and a concurrent banner confirmation
 * cannot double-resolve.
 */
export async function confirmReplacementEventsForArchivedContracts({
  organizationId,
  contractIds,
  userId,
}: {
  organizationId: string;
  contractIds: number[];
  userId: string;
}): Promise<{ confirmedCount: number }> {
  if (contractIds.length === 0) return { confirmedCount: 0 };

  const events = await fetchVerifiedEventsForContracts({
    organizationId,
    contractIds,
  });

  const results = await Promise.all(
    events.map((event) =>
      resolveReplacementEvent({
        eventId: event.id,
        organizationId,
        status: 'confirmed',
        userId,
      }),
    ),
  );

  return { confirmedCount: results.filter((r) => r.resolved).length };
}
