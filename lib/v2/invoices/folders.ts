import { DEFAULT_INVOICE_STATUS } from '@/constants/invoiceStatus';
import type { InvoiceValidation } from '@/lib/v2/invoices/validation';

// Pure invoice-folder/stat logic, split out of service.ts so it can be
// imported from client components (service.ts pulls in server-only data
// access) — the Invoices page's stat tiles need this to react to the date
// filter without a server round trip.

/**
 * A negative discrepancy is the invoice billing LESS than expected —
 * underbilling reads as green everywhere the number itself is shown, even
 * where the mismatch tile/badge around it stays red for any mismatch.
 */
export function discrepancyColor(amount: number): string {
  return amount < 0 ? '#00A86B' : '#CC003F';
}

export type InvoiceFolder =
  | 'all'
  | 'awaiting-review'
  | 'potential-overbilling'
  | 'disputed'
  | 'approved'
  | 'archived';

export const INVOICE_FOLDERS: readonly InvoiceFolder[] = [
  'all',
  'awaiting-review',
  'potential-overbilling',
  'disputed',
  'approved',
  'archived',
];

/**
 * Every folder an invoice belongs to — not exactly one. The status-derived
 * folder is exclusive with itself, but Potential Discrepancies is
 * independent: it surfaces every invoice with a real amount or product
 * discrepancy, so a declined-and-discrepant invoice lands in both Disputed
 * and Potential Discrepancies. The one exception is once a reviewer has
 * paid, approved, or voided it — matching the Invoice Discrepancies
 * Report's own status gate, a resolved invoice's discrepancy (if any)
 * no longer needs surfacing as something still to act on.
 */
export function classifyInvoiceFolders(
  invoiceStatus: string | null | undefined,
  isDiscrepant: boolean,
): Set<Exclude<InvoiceFolder, 'all'>> {
  // A missing status displays and behaves as "review" everywhere else in the
  // app (constants/invoiceStatus.ts's DEFAULT_INVOICE_STATUS) — match that
  // here rather than only matching a status explicitly stored as 'review'.
  const status = invoiceStatus || DEFAULT_INVOICE_STATUS;
  const folders = new Set<Exclude<InvoiceFolder, 'all'>>();
  if (status === 'declined' || status === 'void') folders.add('disputed');
  else if (status === 'approved' || status === 'paid') folders.add('approved');
  else if (status === DEFAULT_INVOICE_STATUS) folders.add('awaiting-review');
  const isResolved =
    status === 'void' || status === 'paid' || status === 'approved';
  if (isDiscrepant && !isResolved) folders.add('potential-overbilling');
  return folders;
}

/**
 * The Status dropdown is only useful where a folder can mix statuses — "all"
 * and "archived" (archiving is independent of invoice_status). Every other
 * folder, including Potential Discrepancies, is already effectively
 * single-purpose, so the dropdown would only add a control without a
 * meaningful use for it.
 */
export function shouldShowInvoiceStatusFilter(folder: InvoiceFolder): boolean {
  return folder === 'all' || folder === 'archived';
}

/**
 * True when an invoice has a real amount or per-product discrepancy against
 * its parent, in either direction — matches the Invoice Discrepancies
 * Report's own inclusion rule (a real amount gap, or an unmatched product)
 * so Potential Discrepancies and the Report agree on which invoices count.
 * A missing parent (no Service Order) can't be compared at all, so
 * amountMatch/productsMatch default true and this returns false — same as
 * the Report's own "no active relationship" filter.
 */
export function isInvoiceDiscrepant(
  validation: InvoiceValidation | undefined,
): boolean {
  return (
    !(validation?.amountMatch ?? true) || !(validation?.productsMatch ?? true)
  );
}

export interface InvoiceStat {
  amount: number;
  count: number;
}

export interface InvoiceStats {
  all: InvoiceStat;
  awaitingReview: InvoiceStat;
  potentialDiscrepancies: InvoiceStat;
  disputed: InvoiceStat;
  approved: InvoiceStat;
}

function emptyStat(): InvoiceStat {
  return { amount: 0, count: 0 };
}

/**
 * "Potential Discrepancies" reads as the total dollar magnitude at stake,
 * not the gross total of the invoices that happen to be flagged — those two
 * numbers can differ a lot (a $1,100 invoice off by $150 is $150 at stake,
 * not $1,100). Unsigned: an underbilled invoice is just as much a
 * discrepancy as an overbilled one, matching the Invoice Discrepancies
 * Report's own total. Each entry is an invoice's amountDifference already
 * converted to the org's base currency at the invoice-date FX rate
 * (InvoiceValidation.amountDifferenceBase) — no rate reconstruction needed.
 */
export function toDiscrepancyStat(discrepanciesBase: number[]): InvoiceStat {
  const amount = discrepanciesBase.reduce(
    (sum, discrepancyBase) => sum + Math.abs(discrepancyBase),
    0,
  );
  return { amount, count: discrepanciesBase.length };
}

/** The minimal per-invoice shape computeInvoiceStats needs — a subset of
 * InvoiceRow, so callers don't have to build a full one just to feed this. */
export interface InvoiceStatsRow {
  invoiceStatus?: string | null;
  recordedAmountUSD?: number | null;
  validation?: InvoiceValidation;
}

/**
 * Buckets a row set into the five Invoice Management stat-tile totals.
 * Shared by the server-rendered sidebar counts (getInvoiceStats, the full
 * active set) and the client-rendered stat tiles (a date-filtered subset) so
 * the two never drift apart on how a folder is defined.
 */
export function computeInvoiceStats(rows: InvoiceStatsRow[]): InvoiceStats {
  const all = emptyStat();
  const buckets: Record<
    Exclude<InvoiceFolder, 'all' | 'archived'>,
    InvoiceStat
  > = {
    'awaiting-review': emptyStat(),
    'potential-overbilling': emptyStat(),
    disputed: emptyStat(),
    approved: emptyStat(),
  };
  const discrepanciesBase: number[] = [];

  for (const row of rows) {
    const amountUSD = row.recordedAmountUSD ?? 0;
    all.amount += amountUSD;
    all.count += 1;

    const isDiscrepant = isInvoiceDiscrepant(row.validation);
    const folders = classifyInvoiceFolders(row.invoiceStatus, isDiscrepant);
    // An invoice can belong to more than one folder (e.g. declined AND
    // discrepant — paid/approved/void invoices are excluded from Potential
    // Discrepancies, so those combinations can't happen), so it contributes
    // to each bucket it's actually in.
    for (const folder of folders) {
      if (folder === 'archived') continue;
      buckets[folder].amount += amountUSD;
      buckets[folder].count += 1;
    }

    if (folders.has('potential-overbilling')) {
      discrepanciesBase.push(row.validation?.amountDifferenceBase ?? 0);
    }
  }

  return {
    all,
    awaitingReview: buckets['awaiting-review'],
    potentialDiscrepancies: toDiscrepancyStat(discrepanciesBase),
    disputed: buckets.disputed,
    approved: buckets.approved,
  };
}
