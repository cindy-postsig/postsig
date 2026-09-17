import { z } from 'zod';
import { format, addMonths, parseISO } from 'date-fns';
import { getFiscalYearInfo } from '@/app/lib/budget/dateUtils';
import type { FiscalYearInfo } from '@/app/lib/budget/dateUtils';
import {
  runSpendQuery,
  type SpendQueryInput,
} from '@/app/api/v2/handlers/spend/query';
import {
  costMethodInput,
  costMethodLabels,
} from '@/components/budget/costMethod';
import { getDefaultCostMethod } from '@/lib/settings/default-cost-method';
import { requireMcpContext } from '@/app/lib/mcp/context';
import { assertSameOrg } from '@/app/lib/mcp/guards';
import { ValidationToolError } from '@/app/lib/mcp/errors';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';
import { getMonthlyReportData } from '@/lib/v2/reports/monthly-report/service';
import type {
  BusinessSponsorAndGroupData,
  ProductData,
} from '@/lib/v2/reports/monthly-report/transforms';

const PERIOD_VALUES = [
  'current_month',
  'next_month',
  'current_fy',
  'next_fy',
  'fy_q1',
  'fy_q2',
  'fy_q3',
  'fy_q4',
  'custom',
] as const;

type Period = (typeof PERIOD_VALUES)[number];

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

const input = z.object({
  view: z
    .enum(['actual', 'amortized', 'committed'])
    .optional()
    .describe(
      "Cost-calculation method. OMIT to use the org's configured default — the same method the in-app Spend Overview and budget cards use, so the totals match those surfaces exactly; only pass a view when the user names a specific basis. " +
        '"actual" — real billing-date cash flow. A contract billed annually appears entirely in its single billing month; a contract billed monthly is spread across months. ' +
        '"amortized" — fee spread evenly across the contract term, every month. ' +
        '"committed" — Contract Term: each term/renewal books its full year-slice in the fiscal year containing its start date. ' +
        'Pick "actual" for cash-flow questions, "amortized" for run-rate / accrual questions. ' +
        'When narrating actual-view results, describe annual-billing concentrations as "billed in full in <month>" — avoid loaded phrases like "lump sum" or "spike".',
    ),
  period: z
    .enum(PERIOD_VALUES)
    .default('current_month')
    .describe(
      'Time window. Quarters are FISCAL — fy_q1 = months 1-3 of the org fiscal year ' +
        '(default Jan-start, so for default orgs fy_q1 = calendar Jan-Mar). ' +
        'current_fy / next_fy span the full fiscal year. ' +
        'Use "custom" with start_month/end_month for arbitrary windows, including past fiscal years.',
    ),
  start_month: z
    .string()
    .regex(MONTH_REGEX)
    .optional()
    .describe('Required when period="custom". Format YYYY-MM. Inclusive.'),
  end_month: z
    .string()
    .regex(MONTH_REGEX)
    .optional()
    .describe(
      'Optional when period="custom". Defaults to start_month for a single-month query. ' +
        'Inclusive. Must be >= start_month.',
    ),
});

interface MonthRange {
  startMonth: string;
  endMonth: string;
  label: string;
}

const monthKey = (d: Date): string => format(d, 'yyyy-MM');

const addMonthsToKey = (key: string, n: number): string =>
  monthKey(addMonths(parseISO(`${key}-01`), n));

function resolvePeriod(
  period: Period,
  fy: FiscalYearInfo,
  startMonth?: string,
  endMonth?: string,
): MonthRange {
  switch (period) {
    case 'current_month': {
      const k = monthKey(new Date());
      return {
        startMonth: k,
        endMonth: k,
        label: format(parseISO(`${k}-01`), 'MMM yyyy'),
      };
    }
    case 'next_month': {
      const k = monthKey(addMonths(new Date(), 1));
      return {
        startMonth: k,
        endMonth: k,
        label: format(parseISO(`${k}-01`), 'MMM yyyy'),
      };
    }
    case 'current_fy': {
      const s = monthKey(fy.currentFiscalYearStart);
      return {
        startMonth: s,
        endMonth: addMonthsToKey(s, 11),
        label: `FY ${fy.currentFiscalYear}`,
      };
    }
    case 'next_fy': {
      const s = monthKey(fy.nextFiscalYearStart);
      return {
        startMonth: s,
        endMonth: addMonthsToKey(s, 11),
        label: `FY ${fy.currentFiscalYear + 1}`,
      };
    }
    case 'fy_q1':
    case 'fy_q2':
    case 'fy_q3':
    case 'fy_q4': {
      const qIdx = Number(period.slice(-1)) - 1;
      const fyStart = monthKey(fy.currentFiscalYearStart);
      return {
        startMonth: addMonthsToKey(fyStart, qIdx * 3),
        endMonth: addMonthsToKey(fyStart, qIdx * 3 + 2),
        label: `FY ${fy.currentFiscalYear} Q${qIdx + 1}`,
      };
    }
    case 'custom': {
      if (!startMonth) {
        throw new ValidationToolError(
          'start_month is required when period="custom"',
        );
      }
      const end = endMonth ?? startMonth;
      if (end < startMonth) {
        throw new ValidationToolError('end_month must be >= start_month');
      }
      return {
        startMonth,
        endMonth: end,
        label:
          startMonth === end
            ? format(parseISO(`${startMonth}-01`), 'MMM yyyy')
            : `${startMonth} to ${end}`,
      };
    }
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

async function getSpendTool(payload: z.infer<typeof input>) {
  const ctx = requireMcpContext();
  const fyStartMonth = ctx.userMetadata.organizationFY ?? 1;
  const fy = getFiscalYearInfo(fyStartMonth);
  const range = resolvePeriod(
    payload.period,
    fy,
    payload.start_month,
    payload.end_month,
  );

  // The org's configured cost-calculation method (psk-1877) is the default,
  // so a bare get_spend call answers with the same numbers the in-app Spend
  // Overview and budget cards show.
  const method =
    payload.view ??
    (await getDefaultCostMethod(ctx.userMetadata.organizationId));

  // currentFY/nextFY pass through as the literal windows the summary cards
  // query; every other period becomes its exact month range, half-open on
  // the right per the spend route's window contract.
  const window: SpendQueryInput['window'] =
    payload.period === 'current_fy'
      ? 'currentFY'
      : payload.period === 'next_fy'
        ? 'nextFY'
        : {
            from: `${range.startMonth}-01`,
            to: `${addMonthsToKey(range.endMonth, 1)}-01`,
          };

  // The same engine query (and derivation cache) behind the budget overview
  // and the dashboard's Spend Overview: identical population filters,
  // currency policy, and cost-method math, so the assistant's figures match
  // the app's by construction (psk-1937 follow-up). Conversion happens before
  // accumulation, so month buckets summed equal the cards' year buckets.
  const response = await runSpendQuery(
    ctx.userMetadata,
    costMethodInput(method, window, 'month', 'total'),
  );

  // Accumulate, don't overwrite: a commitments query returns separate
  // 'new' / 'multi-year' / 'renewal' items that can share a period, and the
  // cards sum all of them.
  const valueByMonth = new Map<string, number>();
  for (const item of response.items) {
    valueByMonth.set(
      item.period,
      (valueByMonth.get(item.period) ?? 0) + item.value,
    );
  }
  const months = response.periods.map((key) => ({
    key,
    label: format(parseISO(`${key}-01`), 'MMM yyyy'),
    value: round2(valueByMonth.get(key) ?? 0),
  }));

  // Summed from the RAW engine values, exactly as the Spend Overview cards
  // sum their items — rounding per month first could drift cents off the
  // cards' figure.
  const total = round2(
    response.items.reduce((sum, item) => sum + item.value, 0),
  );
  const currentFyStart = monthKey(fy.currentFiscalYearStart);
  const nextFyStart = monthKey(fy.nextFiscalYearStart);

  return {
    view: method,
    viewLabel: costMethodLabels[method],
    period: payload.period,
    range,
    fiscalYear: {
      startMonth: fyStartMonth,
      currentFY: fy.currentFiscalYear,
      currentRange: {
        start: currentFyStart,
        end: addMonthsToKey(currentFyStart, 11),
      },
      nextRange: {
        start: nextFyStart,
        end: addMonthsToKey(nextFyStart, 11),
      },
    },
    // Denomination of total and months[].value — the org's base display currency.
    baseCurrency: response.targetCurrency,
    total,
    months,
  };
}

const breakdownInput = z.object({
  group_by: z
    .enum(['business_sponsor', 'business_group'])
    .default('business_sponsor')
    .describe(
      'Dimension to pivot on. business_sponsor = the owner field on each contract; ' +
        "business_group = the contract's owner business groups.",
    ),
  view: z
    .enum(['amortized', 'actual'])
    .default('amortized')
    .describe(
      '"amortized" — fee spread evenly across the contract term every month (run-rate / accrual). ' +
        '"actual" — real billing-date cash flow. Match this to whichever view the user is comparing against in the monthly report.',
    ),
  include_contracts: z
    .boolean()
    .default(false)
    .describe(
      'Include per-contract subRows under each group, with their own currentMonth / nextMonth / change. ' +
        'Set true when narrating which specific contracts are driving a group\'s shift; leave false for top-line "which group moved most" answers.',
    ),
  top_n: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe(
      'Limit to the top N rows by ABSOLUTE change (biggest movers — increases or decreases). ' +
        'Use for "biggest spend increase next month" / "top 5 movers" questions. ' +
        'Omit to return all groups, sorted by absolute change descending.',
    ),
});

function projectSubRow(p: ProductData) {
  return {
    contractId: p.contractId,
    vendor: p.vendor,
    product: p.product,
    currentMonth: p.currentMonth,
    nextMonth: p.nextMonth,
    change: p.change,
    isSplit: p.isSplit ?? false,
    splitAmongSponsors:
      p.sponsorCount && p.sponsorCount > 1 ? p.businessSponsors : undefined,
    splitAmongGroups:
      p.groupCount && p.groupCount > 1 ? p.businessGroups : undefined,
    tags: p.tags,
  };
}

async function getSpendBreakdownTool(payload: z.infer<typeof breakdownInput>) {
  const ctx = requireMcpContext();
  const data = await getMonthlyReportData();
  if (!data) {
    throw new ValidationToolError(
      'Unable to load monthly report data for this organization',
    );
  }
  assertSameOrg(
    data.enrichedContracts,
    'get_spend_breakdown',
    (c) => c.contract?.organization_id,
  );

  const viewData =
    payload.view === 'amortized' ? data.amortizedData : data.actualCostData;
  const sourceRows: BusinessSponsorAndGroupData[] =
    payload.group_by === 'business_sponsor'
      ? viewData.spendByBusinessSponsor
      : viewData.spendByBusinessGroup;

  // Sort by absolute change so biggest movers (positive OR negative) are first.
  // This matches how the agent will narrate "biggest increase/decrease" answers.
  const sorted = [...sourceRows].sort(
    (a, b) => Math.abs(b.change) - Math.abs(a.change),
  );
  const sliced =
    payload.top_n !== undefined ? sorted.slice(0, payload.top_n) : sorted;

  const rows = sliced.map((r) => ({
    id: r.id,
    name: r.name,
    vendorCount: r.vendors,
    contractCount: r.subRows.length,
    currentMonth: r.currentMonth,
    nextMonth: r.nextMonth,
    change: r.change,
    ...(payload.include_contracts && {
      contracts: r.subRows.map(projectSubRow),
    }),
  }));

  const today = new Date();
  const currentMonthKey = format(today, 'yyyy-MM');
  const nextMonthKey = format(addMonths(today, 1), 'yyyy-MM');

  return {
    groupBy: payload.group_by,
    viewMode: payload.view,
    // Denomination of every monetary figure in this response.
    baseCurrency: ctx.userMetadata.baseCurrency,
    monthRange: { currentMonth: currentMonthKey, nextMonth: nextMonthKey },
    overview: {
      currentMonth: viewData.overview.currentMonthSpend.amount,
      nextMonth: viewData.overview.nextMonthSpend.amount,
      change: viewData.overview.nextMonthSpend.change,
      changePercent: viewData.overview.nextMonthSpend.changePercent,
    },
    rowCount: rows.length,
    totalRowsAvailable: sourceRows.length,
    rows,
  };
}

export const spendTools: McpToolDef[] = [
  {
    name: 'get_spend',
    description:
      'Total ORG-WIDE spend over a time window, computed by the SAME engine query behind the in-app Spend Overview and budget cards — with no view argument it uses the org\'s configured cost method, so "current estimated spend" / "projected spend" answers match those cards exactly (period:"current_fy" = Current Estimated Spend, period:"next_fy" = Projected Spend). ' +
      'Answers "what is my current/projected spend?", "what is my actual cost this month?", "amortized spend for Q4", "spend in March", "next FY total". ' +
      'Pass view:"actual" for cash-flow / billing-style questions — "what did we actually spend", "cash flow", "billing cost"; view:"amortized" for run-rate; view:"committed" for Contract Term; omit view otherwise so the numbers match the app. ' +
      'Quarters are FISCAL — fy_q1 = months 1-3 ' +
      'of the org fiscal year (default Jan-start, so for default orgs fy_q1 = calendar Q1). ' +
      "Returns total + per-month breakdown denominated in the organization's base display currency (see the response `baseCurrency`) — format amounts with that currency, never assuming USD. Excludes fully superseded contracts " +
      'and linked child invoices, and nets out per-product supersession in amendment chains, matching the budget overview page. ' +
      'This tool does NOT scope by vendor/tag/sponsor/group — for a vendor- or tag-scoped spend total (with the contributing contracts listed), use query_contracts with aggregation_mode:"rollup"; for per-sponsor/group breakdowns with month-over-month deltas, use get_spend_breakdown.',
    inputSchema: input,
    annotations: {
      title: 'Get spend',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getSpendTool as McpToolDef['handler'],
  },
  {
    name: 'get_spend_breakdown',
    description:
      'Spend pivoted by business_sponsor or business_group, with current-month vs next-month deltas per row. ' +
      'Mirrors the in-app monthly report numbers EXACTLY — applies the same future-term-date adjustment (contracts whose latest term_start is in the future use their previous term), split-sponsor apportionment (contracts with multiple sponsors are duplicated under each), and supersession filtering that the report uses. ' +
      'CANONICAL tool for "which sponsor/group has the biggest spend increase next month?" / "who is driving the run-rate change?" / month-over-month comparison questions. ' +
      'Do NOT aggregate from query_contracts for these questions — chain-of-reasoning gives wrong rankings because query_contracts returns raw latest-term data that the monthly report intentionally adjusts, and has no visibility into split-sponsor apportionment. ' +
      "Pass top_n to slice to biggest movers by |change|. include_contracts adds per-contract subRows so you can narrate which specific contracts are driving each group's shift. " +
      "Monetary figures are denominated in the organization's base display currency (see the response `baseCurrency`) — format amounts with that currency, never assuming USD.",
    inputSchema: breakdownInput,
    annotations: {
      title: 'Spend breakdown by sponsor/group',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getSpendBreakdownTool as McpToolDef['handler'],
  },
];
