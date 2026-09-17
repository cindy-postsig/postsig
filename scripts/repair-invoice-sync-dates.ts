/**
 * Repair invoice-sync contracts' dates. Early syncs stored the provider dates
 * as {start} / {end} objects in the term-date columns; the columns now hold
 * the invoice date in execution_date and the due date in due_date, with
 * term_start_date carrying a [{date}] copy of the invoice date (the resolver
 * anchors on it) and term_end_date left empty — the provider has no billing
 * period, and a due date there would read as one.
 *
 * Per synced invoice: a provider object is parsed onto the empty date column
 * (never overwriting a value already there); term_start_date is set to the
 * invoice-date copy when null or object-shaped; term_end_date is cleared when
 * object-shaped or when it is exactly the due-date copy an earlier run wrote.
 * Any other array is a hand-entered period and is left alone. A row whose
 * provider value cannot be parsed is left untouched and listed.
 *
 *   npx tsx scripts/repair-invoice-sync-dates.ts --dry-run
 *   npx tsx scripts/repair-invoice-sync-dates.ts --org <uuid>
 *   npx tsx scripts/repair-invoice-sync-dates.ts --env .env.prod
 */
import type { Json } from '@/database.types';
import {
  parseProviderDate,
  termDateEntries,
  type TermDateEntry,
} from '@/lib/v2/integrations/invoice-sync/dates';
import {
  clientFromEnv,
  fetchAllRows,
  parseBackfillArgs,
} from './lib/backfill-cli';

export interface InvoiceDateRepairRow {
  id: number;
  execution_date: string | null;
  due_date: string | null;
  term_start_date: Json | null;
  term_end_date: Json | null;
}

export interface InvoiceDateRepairUpdate {
  execution_date?: string;
  due_date?: string;
  term_start_date?: TermDateEntry[] | null;
  term_end_date?: null;
}

export type InvoiceDateRepairPlan =
  | { kind: 'skip' }
  | { kind: 'unparseable'; raw: string[] }
  | { kind: 'unsupported'; raw: string[] }
  | { kind: 'update'; update: InvoiceDateRepairUpdate };

type TermColumn =
  | { shape: 'array'; entries: Json[] }
  | { shape: 'null' }
  | { shape: 'object'; raw: string | null }
  | { shape: 'scalar'; raw: string };

function classify(value: Json | null, key: 'start' | 'end'): TermColumn {
  if (value === null) return { shape: 'null' };
  if (Array.isArray(value)) return { shape: 'array', entries: value };
  // A bare string/number/boolean is neither shape this repair knows; it is
  // reported, never rewritten.
  if (typeof value !== 'object') {
    return { shape: 'scalar', raw: JSON.stringify(value) };
  }
  const raw = value[key];
  return { shape: 'object', raw: typeof raw === 'string' ? raw : null };
}

/** Parses a provider object's value; null when there is none, and records an unparseable one. */
function providerDate(
  term: Exclude<TermColumn, { shape: 'scalar' }>,
  unparseable: string[],
): string | null {
  if (term.shape !== 'object' || term.raw === null) return null;
  const parsed = parseProviderDate(term.raw);
  if (parsed === null) unparseable.push(term.raw);
  return parsed;
}

function isSingleDateEntry(entries: Json[], date: string): boolean {
  const [entry] = entries;
  return (
    entries.length === 1 &&
    entry !== null &&
    typeof entry === 'object' &&
    !Array.isArray(entry) &&
    entry.date === date
  );
}

/** The invoice-date pair: execution_date, with a [{date}] copy in term_start_date. */
function planStart(
  executionDate: string | null,
  term: Exclude<TermColumn, { shape: 'scalar' }>,
  unparseable: string[],
): { date?: string; term?: TermDateEntry[] | null } {
  if (term.shape === 'array') return {};
  const parsed = providerDate(term, unparseable);
  const date = executionDate ?? parsed;
  const result: { date?: string; term?: TermDateEntry[] | null } = {};
  if (date !== null && executionDate === null) result.date = date;
  if (date !== null || term.shape === 'object')
    result.term = termDateEntries(date);
  return result;
}

/** The due-date pair: due_date only; term_end_date holds no copy. */
function planEnd(
  dueDate: string | null,
  term: Exclude<TermColumn, { shape: 'scalar' }>,
  unparseable: string[],
): { date?: string; term?: null } {
  if (term.shape === 'null') return {};
  if (term.shape === 'array') {
    return dueDate !== null && isSingleDateEntry(term.entries, dueDate)
      ? { term: null }
      : {};
  }
  const parsed = providerDate(term, unparseable);
  const result: { date?: string; term?: null } = { term: null };
  if (parsed !== null && dueDate === null) result.date = parsed;
  return result;
}

export function planInvoiceDateRepair(
  row: InvoiceDateRepairRow,
): InvoiceDateRepairPlan {
  const startColumn = classify(row.term_start_date, 'start');
  const endColumn = classify(row.term_end_date, 'end');
  if (startColumn.shape === 'scalar' || endColumn.shape === 'scalar') {
    return {
      kind: 'unsupported',
      raw: [startColumn, endColumn].flatMap((column) =>
        column.shape === 'scalar' ? [column.raw] : [],
      ),
    };
  }

  const raw: string[] = [];
  const start = planStart(row.execution_date, startColumn, raw);
  const end = planEnd(row.due_date, endColumn, raw);
  if (raw.length > 0) return { kind: 'unparseable', raw };

  const update: InvoiceDateRepairUpdate = {};
  if (start.date !== undefined) update.execution_date = start.date;
  if (start.term !== undefined) update.term_start_date = start.term;
  if (end.date !== undefined) update.due_date = end.date;
  if (end.term !== undefined) update.term_end_date = end.term;
  return Object.keys(update).length === 0
    ? { kind: 'skip' }
    : { kind: 'update', update };
}

async function main() {
  const { org, envPath, dryRun } = parseBackfillArgs(process.argv.slice(2));
  const client = clientFromEnv(envPath);

  const rows = await fetchAllRows((from, to) => {
    let query = client
      .from('contracts')
      .select(
        'id, organization_id, execution_date, due_date, term_start_date, term_end_date',
      )
      .not('external_source', 'is', null);
    if (org) query = query.eq('organization_id', org);
    return query.order('id').range(from, to);
  });

  let updated = 0;
  for (const row of rows) {
    const plan = planInvoiceDateRepair(row);
    if (plan.kind === 'skip') continue;
    if (plan.kind === 'unparseable' || plan.kind === 'unsupported') {
      console.log(
        `- contract ${row.id} (${row.organization_id}): left untouched, ${plan.kind} ${JSON.stringify(plan.raw)}`,
      );
      continue;
    }
    console.log(
      `- contract ${row.id} (${row.organization_id}): ${JSON.stringify(plan.update)}${dryRun ? ' (dry run)' : ''}`,
    );
    if (dryRun) continue;
    const { error } = await client
      .from('contracts')
      .update(plan.update)
      .eq('id', row.id);
    if (error) throw error;
    updated++;
  }
  console.log(
    `Done. ${rows.length} synced invoices scanned, ${updated} updated${dryRun ? ' (dry run: nothing written)' : ''}.`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
