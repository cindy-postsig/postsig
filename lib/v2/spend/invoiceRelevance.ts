import { isInvoiceType } from '@/app/lib/constants';
import { toIsoDate } from './resolver/resolveFeeSegments';
import { parseUTCDate } from './dates';

// An invoice records a one-off billing event, but its two dates routinely
// disagree about WHEN: the invoice date (execution_date) can precede the
// billing period it pays for (charged up front) or follow it (arrears, the
// typical case). Relevance therefore takes the LATER of the invoice date and
// the billing-period end — judging by either date alone would drop an invoice
// the other date proves is still current.
export interface InvoiceRelevanceSource {
  type_id?: number | null;
  execution_date?: string | null;
  term_start_date?: Array<{ date: string }> | null;
  term_end_date?: Array<{ date: string }> | null;
}

function isoDatesOf(
  entries: Array<{ date: string }> | null | undefined,
): Array<string | null> {
  return Array.isArray(entries)
    ? entries.map((entry) => toIsoDate(entry?.date))
    : [];
}

/**
 * Latest activity an invoice records: the last of its invoice date and its
 * billing-period start and end dates. Null when no date parses — such an
 * invoice is never treated as stale (no evidence to exclude on).
 *
 * Billing-period STARTS count because a prepaid invoice routinely records no
 * end date at all — the resolver books it as a single month from its start
 * (resolveFeeSegments' invoice rule). Judging that invoice by its execution
 * date alone dates it to the year it was raised, so one issued in December for
 * the following May read as stale and lost a fee that lands squarely inside
 * the window.
 */
export function invoiceActivityDate(
  source: InvoiceRelevanceSource,
): string | null {
  const dates = [
    toIsoDate(source.execution_date),
    ...isoDatesOf(source.term_start_date),
    ...isoDatesOf(source.term_end_date),
  ].filter((date): date is string => date !== null);
  if (dates.length === 0) return null;
  return dates.sort()[dates.length - 1];
}

/**
 * True when an invoice's activity ended before the window starts — it belongs
 * to an earlier period and must not appear in this query. Window-relative by
 * design: a historical window (the price-history page queries from 1970) keeps
 * its invoices; only forward-looking windows shed the old ones. Non-invoice
 * contracts are never stale — their futures are the resolver's business
 * (renewal projections, inactive caps).
 */
export function isStaleInvoice(
  source: InvoiceRelevanceSource,
  windowStart: Date,
): boolean {
  if (!isInvoiceType(source.type_id)) return false;
  const activity = invoiceActivityDate(source);
  if (!activity) return false;
  return parseUTCDate(activity) < windowStart;
}

/**
 * Row-level companion for surfaces that list contracts rather than query the
 * engine (budget table, legacy summary totals): drops enriched rows whose
 * contract is a stale invoice for the given window start.
 */
export function excludeStaleInvoices<
  T extends { contract: InvoiceRelevanceSource },
>(rows: T[], windowStart: Date): T[] {
  return rows.filter((row) => !isStaleInvoice(row.contract, windowStart));
}
