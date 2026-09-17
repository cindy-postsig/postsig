import { runSpendQuery } from '@/app/api/v2/handlers/spend/query';
import { costMethodInput } from '@/components/budget/costMethod';
import type { UserMetadata } from '@/constants/types';
import { getDefaultCostMethod } from '@/lib/settings/default-cost-method';
import { getOrgHierarchyLevelOrder } from '@/lib/v2/org-units/sync';
import { loadSeatPopulation, withSeatEmployees } from '@/lib/v2/seats/service';
import { parseUTCDate, resolveWindow } from '@/lib/v2/spend';
import { earliestIsoDate } from '@/lib/v2/spend/resolver/resolveFeeSegments';
import { createClient } from '@/utils/supabase/service_server';
import { budgetsByTargetKey, fiscalYearsTouched, loadBudgets } from './budgets';
import { fetchAllPages, loadAllocationContextForRequest } from './context';
import {
  allTimeWindow,
  isValidIsoDate,
  resolveRollupWindow,
  type ContractSpan,
  type ReportWindowParams,
} from './report-window';
import {
  buildAllocationRollup,
  type AllocationRollupData,
} from './rollup-report-rows';
import { loadPickerEmployees } from './tab-data';
import { SID_RENEWAL_INCREASE_PERCENT } from '@/lib/v2/bloomberg-sid/spend';
import { unallocatedContractRows } from './unallocated';

/**
 * The org's recorded contract dates, for the All Time window. Term arrays
 * accumulate newest-first, so the latest end is `->0` while the earliest start
 * is the array's oldest entry — `earliestIsoDate` picks it. Two columns over
 * the org's contracts; the report runs a full engine query either way.
 */
export async function loadOrgContractSpan(
  organizationId: string,
  client = createClient(),
): Promise<ContractSpan> {
  const rows = await fetchAllPages<{
    term_start_date: unknown;
    term_end_date: unknown;
  }>(
    (from, to) =>
      client
        .from('contracts')
        .select('term_start_date, term_end_date')
        .eq('organization_id', organizationId)
        .order('id')
        .range(from, to),
    organizationId,
    'contract span',
  );

  let earliestStart: string | null = null;
  let latestEnd: string | null = null;
  for (const row of rows) {
    const start = earliestIsoDate(
      row.term_start_date as Array<{ date: string }> | null,
    );
    if (start !== null && (earliestStart === null || start < earliestStart)) {
      earliestStart = start;
    }
    const ends = Array.isArray(row.term_end_date)
      ? (row.term_end_date as Array<{ date: string }>)
      : [];
    for (const end of ends) {
      // Skipped rather than merely ignored downstream: a malformed
      // "9999-99-99" would otherwise win this comparison and displace the
      // real latest end, quietly shrinking the window.
      const iso = typeof end?.date === 'string' ? end.date.slice(0, 10) : null;
      if (!isValidIsoDate(iso)) continue;
      if (latestEnd === null || iso > latestEnd) latestEnd = iso;
    }
  }
  return { earliestStart, latestEnd };
}

function withSeatStarts(
  span: ContractSpan,
  seats: ReadonlyArray<{ term_start_date?: Array<{ date: string }> | null }>,
): ContractSpan {
  let earliestStart = span.earliestStart;
  for (const seat of seats) {
    const start = earliestIsoDate(seat.term_start_date);
    if (start !== null && (earliestStart === null || start < earliestStart)) {
      earliestStart = start;
    }
  }
  return { ...span, earliestStart };
}

/**
 * The Cost Allocation Summary's numbers: ONE engine query through the same
 * runner as the budget overview, dashboard cards, and get_spend
 * (runSpendQuery — same population, currency policy, derivation cache, and
 * the org's default cost method), asking for the allocation dimension at
 * level 'user'. That level keeps every explicit target as its own key, so
 * the per-target totals are the sufficient statistic every view rolls up
 * from; the direct-vs-rolled distinction is then rollupToLevel's, per node.
 *
 * The org's Bloomberg terminal seats join that population, loaded once and
 * handed to every query here so each number on the page counts the same
 * money: a seat is attributed to the employee its `last_user` matched, and
 * lands in Unassigned when the roster cannot place it.
 */
export async function loadAllocationRollupReport(
  userMetadata: UserMetadata,
  params: ReportWindowParams,
  today: Date = new Date(),
): Promise<AllocationRollupData> {
  const organizationId = userMetadata.organizationId;
  const fiscalConfig = { startMonth: userMetadata.organizationFY || 1 };
  const resolved = resolveRollupWindow(params, today, fiscalConfig);
  const { period, custom } = resolved;
  // Lazy import keeps fixture tests off the contracts data layer, as the
  // invoice report does; the same Redis-cached, engine-stamped set it reads.
  const { getContractsList } = await import('@/lib/v2/contracts/service');
  const [
    costMethod,
    ctx,
    levelOrder,
    employees,
    budgets,
    { contracts },
    seatPopulation,
    contractSpan,
  ] = await Promise.all([
    getDefaultCostMethod(organizationId),
    loadAllocationContextForRequest(organizationId),
    getOrgHierarchyLevelOrder(organizationId),
    loadPickerEmployees(organizationId),
    loadBudgets(organizationId),
    getContractsList({ status: 'active', productValues: true }),
    // A population is only valid for the window it was loaded with, and the
    // Current FY preset also runs a nextFY companion query, so the load
    // reaches to the end of next fiscal year. All Time resolves to the
    // engine's own bounds, which already contain every imported report, so
    // widening the query window by the seats' own contract dates below cannot
    // change the reports this reads.
    loadSeatPopulation(
      organizationId,
      {
        start: parseUTCDate(resolved.window.start),
        end:
          period === 'current-fy'
            ? resolveWindow('nextFY', today, fiscalConfig).end
            : parseUTCDate(resolved.window.end),
      },
      { matchEmployees: true },
    ),
    period === 'all' ? loadOrgContractSpan(organizationId) : null,
  ]);

  // All Time is the org's own fiscal-year span, not the engine's full bounds:
  // the renewal horizon follows the window, so 2100 books decades of
  // compounded projections nobody asked for. See allTimeWindow. Seats are
  // part of that span: a terminal contracted before any recorded contract
  // starts the window.
  const window =
    period === 'all' && contractSpan
      ? allTimeWindow(
          withSeatStarts(contractSpan, seatPopulation.engine.contracts),
          fiscalConfig,
          today,
        )
      : resolved.window;

  const [spend, projectedSpend, contractSpend] = await Promise.all([
    runSpendQuery(
      userMetadata,
      costMethodInput(
        costMethod,
        { from: window.start, to: window.end },
        'month',
        { kind: 'allocation', level: 'user' },
      ),
      { bloombergSid: seatPopulation.engine },
    ),
    // Current Estimated Spend beside Projected Spend: the same nextFY query
    // useCostMethodTotals runs, over this report's population — seats
    // included, which the dashboard's own call does not carry.
    period === 'current-fy'
      ? runSpendQuery(
          userMetadata,
          costMethodInput(costMethod, 'nextFY', 'year', 'total'),
          { bloombergSid: seatPopulation.engine },
        )
      : null,
    // The unallocated list's amounts: the same window, population and basis as
    // the allocation query above, grouped by contract instead of by target.
    runSpendQuery(
      userMetadata,
      costMethodInput(
        costMethod,
        { from: window.start, to: window.end },
        'month',
        'contract',
      ),
      { bloombergSid: seatPopulation.engine },
    ),
  ]);
  const targetTotals = new Map<string, number>();
  for (const item of spend.items) {
    targetTotals.set(
      item.groupKey,
      (targetTotals.get(item.groupKey) ?? 0) + item.value,
    );
  }
  const projected =
    projectedSpend === null
      ? null
      : Math.round(
          projectedSpend.items.reduce((sum, item) => sum + item.value, 0) * 100,
        ) / 100;

  const amountByContractId = new Map<number, number>();
  for (const item of contractSpend.items) {
    const contractId = Number(item.groupKey);
    amountByContractId.set(
      contractId,
      (amountByContractId.get(contractId) ?? 0) + item.value,
    );
  }

  const fiscalYears = fiscalYearsTouched(window, fiscalConfig);
  return {
    period,
    window,
    custom,
    costMethod,
    fiscalYears,
    budgetFiscalYear: fiscalYears.length === 1 ? fiscalYears[0] : null,
    projected,
    bloombergSeatRenewalIncreasePercent:
      seatPopulation.engine.contracts.length > 0
        ? SID_RENEWAL_INCREASE_PERCENT
        : null,
    unallocatedContracts: unallocatedContractRows(
      contracts,
      ctx,
      amountByContractId,
    ),
    ...buildAllocationRollup({
      targetTotals,
      unitsById: ctx.unitsById,
      employeesById: withSeatEmployees(ctx.employeesById, seatPopulation),
      levelOrder,
      employees,
      budgetByKey: budgetsByTargetKey(budgets, fiscalYears),
    }),
  };
}
