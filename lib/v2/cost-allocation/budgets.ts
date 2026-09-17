import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { NotFoundError } from '@/lib/errors';
import { fiscalYearOf, type FiscalConfig } from '@/lib/v2/spend/buckets';
import { parseUTCDate } from '@/lib/v2/spend/dates';
import type { ReportWindow } from './report-window';

/** PostgREST caps responses at `max_rows` (1000), so read every page. */
const DB_PAGE_SIZE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type ServiceClient = ReturnType<typeof createClient>;

export type BudgetTarget = { kind: 'org_unit' | 'employee'; id: number };

export interface BudgetRow {
  org_unit_id: number | null;
  org_employee_id: number | null;
  fiscal_year: number;
  amount: number;
}

/**
 * Every fiscal year a half-open window touches, ascending, numbered by the
 * year the FY starts (the engine's convention). Decision Q4: no proration —
 * a sub-year window reads its containing FY; a spanning window reads each.
 */
export function fiscalYearsTouched(
  window: ReportWindow,
  fiscalConfig: FiscalConfig,
): number[] {
  const first = fiscalYearOf(parseUTCDate(window.start), fiscalConfig);
  const lastDay = new Date(parseUTCDate(window.end).getTime() - DAY_MS);
  const last = fiscalYearOf(lastDay, fiscalConfig);
  const years: number[] = [];
  for (let year = first; year <= last; year++) years.push(year);
  return years;
}

/** The engine's allocation key for a budget row's target: `unit:<id>` / `user:<id>`. */
export function budgetTargetKey(row: BudgetRow): string {
  return row.org_unit_id !== null
    ? `unit:${row.org_unit_id}`
    : `user:${row.org_employee_id}`;
}

/** Each target's budget summed over the fiscal years touched; targets with no row in any of them are absent. */
export function budgetsByTargetKey(
  rows: readonly BudgetRow[],
  fiscalYears: readonly number[],
): Map<string, number> {
  const years = new Set(fiscalYears);
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!years.has(row.fiscal_year)) continue;
    const key = budgetTargetKey(row);
    totals.set(key, (totals.get(key) ?? 0) + Number(row.amount));
  }
  return totals;
}

export async function loadBudgets(
  organizationId: string,
  client: ServiceClient = createClient(),
): Promise<BudgetRow[]> {
  const rows: BudgetRow[] = [];
  for (let offset = 0; ; offset += DB_PAGE_SIZE) {
    const { data, error } = await client
      .from('cost_allocation_budgets')
      .select('org_unit_id, org_employee_id, fiscal_year, amount')
      .eq('organization_id', organizationId)
      .order('id')
      .range(offset, offset + DB_PAGE_SIZE - 1);
    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId },
        'Failed to load cost allocation budgets',
      );
      throw error;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < DB_PAGE_SIZE) break;
  }
  return rows;
}

function targetColumn(target: BudgetTarget): 'org_unit_id' | 'org_employee_id' {
  return target.kind === 'org_unit' ? 'org_unit_id' : 'org_employee_id';
}

/** Tenancy: the service client bypasses RLS, so a target outside the org must 404 before any write. */
export async function assertBudgetTargetInOrg(
  organizationId: string,
  target: BudgetTarget,
  client: ServiceClient = createClient(),
): Promise<void> {
  const table = target.kind === 'org_unit' ? 'org_units' : 'org_employees';
  const { data, error } = await client
    .from(table)
    .select('id')
    .eq('organization_id', organizationId)
    .eq('id', target.id)
    .maybeSingle();
  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), organizationId, target },
      'Failed to look up budget target',
    );
    throw error;
  }
  if (!data) {
    throw new NotFoundError(
      target.kind === 'org_unit' ? 'Org unit' : 'Employee',
    );
  }
}

export interface SaveBudgetParams {
  organizationId: string;
  target: BudgetTarget;
  fiscalYear: number;
  /** null clears the budget for that fiscal year. */
  amount: number | null;
  userId?: string;
}

/**
 * One row per (target, fiscal year), amounts in the org base currency. The
 * service is the only writer, so a read-then-write keeps the fake-db tests
 * honest without an upsert-by-partial-unique dance.
 */
export async function saveBudget(
  params: SaveBudgetParams,
  client: ServiceClient = createClient(),
): Promise<void> {
  const column = targetColumn(params.target);
  const logContext = {
    organizationId: params.organizationId,
    target: params.target,
    fiscalYear: params.fiscalYear,
  };
  const { data: existing, error: readError } = await client
    .from('cost_allocation_budgets')
    .select('id')
    .eq('organization_id', params.organizationId)
    .eq(column, params.target.id)
    .eq('fiscal_year', params.fiscalYear)
    .maybeSingle();
  if (readError) {
    logger.error(
      { error: sanitizeForLogging(readError), ...logContext },
      'Failed to read cost allocation budget',
    );
    throw readError;
  }

  const now = new Date().toISOString();
  let error: unknown = null;
  if (params.amount === null) {
    if (existing) {
      ({ error } = await client
        .from('cost_allocation_budgets')
        .delete()
        .eq('organization_id', params.organizationId)
        .eq('id', existing.id));
    }
  } else if (existing) {
    ({ error } = await client
      .from('cost_allocation_budgets')
      .update({
        amount: params.amount,
        updated_by: params.userId ?? null,
        updated_at: now,
      })
      .eq('organization_id', params.organizationId)
      .eq('id', existing.id));
  } else {
    ({ error } = await client.from('cost_allocation_budgets').insert({
      organization_id: params.organizationId,
      org_unit_id: params.target.kind === 'org_unit' ? params.target.id : null,
      org_employee_id:
        params.target.kind === 'employee' ? params.target.id : null,
      fiscal_year: params.fiscalYear,
      amount: params.amount,
      created_by: params.userId ?? null,
      updated_by: params.userId ?? null,
    }));
  }
  if (error) {
    logger.error(
      { error: sanitizeForLogging(error), ...logContext },
      'Failed to save cost allocation budget',
    );
    throw error;
  }
}
