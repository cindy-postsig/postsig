import { z } from 'zod';
import {
  getCompanyCustomKpis,
  getCompanyReporting,
  getCompanyStandardKpiOverrides,
  getKpis,
} from '@/lib/v2/kpis/service';
import {
  buildKpiPeriods,
  buildStandardEditableKpis,
  currentPeriod,
  customToEditableKpi,
  earliestDisplayedYear,
  resolveAnnualKpi,
  resolveQuarterKpi,
} from '@/lib/v2/kpis/transforms';
import type {
  EditableKpi,
  KpiPeriod,
  KpiPeriodView,
  KpiScalar,
} from '@/lib/v2/kpis/types';
import { requireMcpContext } from '@/app/lib/mcp/context';
import { FeatureDisabledToolError } from '@/app/lib/mcp/errors';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';
import { resolveCompanyRef } from './resolve-company';

const PERIOD_VIEWS = [
  'quarterly',
  'annual',
  'monthly',
] as const satisfies readonly KpiPeriodView[];

const getCompanyKpisInput = z.object({
  public_id: z
    .string()
    .describe(
      'Portfolio company public_id (UUID, from list_portfolio_companies), or its name — full or partial, case and punctuation ignored.',
    ),
  period: z
    .enum(PERIOD_VIEWS)
    .optional()
    .describe(
      'Granularity. "quarterly" (default); "annual" — one value per fiscal year, labelled "FY 2026 YTD" until that year\'s Q4 is reported; "monthly" — only values extracted from monthly reporting packs.',
    ),
  categories: z
    .array(z.string())
    .optional()
    .describe(
      'Only KPIs in these categories, e.g. ["Growth & Revenue", "Cash & Liquidity"]. Case-insensitive exact match.',
    ),
  kpis: z
    .array(z.string())
    .optional()
    .describe(
      'Only these KPIs, by code (e.g. "arr", "burn", "runway") or label (e.g. "Net Burn Rate"). Case-insensitive exact match. Custom KPIs have no code — match them by label.',
    ),
});

type KpiReadingValue = number | string;

interface KpiReading {
  period: string;
  value: KpiReadingValue;
  source: 'direct' | 'computed';
  portcoValue?: KpiReadingValue;
  computedValue?: KpiReadingValue;
}

const scalarValue = (
  scalar: KpiScalar | null | undefined,
): KpiReadingValue | null => scalar?.numeric ?? (scalar?.text?.trim() || null);

// Mirrors KpiValueCell: a month reads its own cell, while quarters and fiscal
// years show the recency-resolved reading, and only a displayed direct value
// can carry an investor correction or an out-of-sync roll-up.
function readKpi(kpi: EditableKpi, period: KpiPeriod): KpiReading | null {
  const cell = kpi.values.find(
    (v) =>
      v.periodYear === period.year &&
      v.periodQuarter === period.quarter &&
      v.periodMonth === period.month,
  );
  const resolved =
    period.month != null
      ? null
      : period.quarter != null
        ? resolveQuarterKpi(kpi, period.year, period.quarter)
        : resolveAnnualKpi(kpi, period.year);
  const value = scalarValue(
    period.month != null ? cell?.displayValue : resolved?.displayValue,
  );
  if (value == null) return null;

  const direct = period.month != null || resolved?.source === 'direct';
  const portcoValue = scalarValue(cell?.portcoValue);
  const computedValue = scalarValue(resolved?.computedValue);
  return {
    period: period.label,
    value,
    source: direct ? 'direct' : 'computed',
    ...(direct && cell?.investorValue && portcoValue != null
      ? { portcoValue }
      : {}),
    ...(resolved?.outOfSync && computedValue != null ? { computedValue } : {}),
  };
}

const lowerCaseSet = (values: string[] | undefined): Set<string> | null =>
  values ? new Set(values.map((v) => v.trim().toLowerCase())) : null;

function matchesFilters(
  kpi: EditableKpi,
  categories: Set<string> | null,
  names: Set<string> | null,
): boolean {
  if (categories && !categories.has(kpi.category.toLowerCase())) return false;
  if (!names) return true;
  return (
    names.has(kpi.label.toLowerCase()) ||
    (kpi.code != null && names.has(kpi.code.toLowerCase()))
  );
}

async function getCompanyKpis(input: z.infer<typeof getCompanyKpisInput>) {
  if (!requireMcpContext().userMetadata.portcoKpisEnabled) {
    throw new FeatureDisabledToolError('The KPIs module');
  }
  const company = await resolveCompanyRef(input.public_id);

  const [catalog, reporting, customKpis, standardOverrides] = await Promise.all(
    [
      getKpis(),
      getCompanyReporting(company.id),
      getCompanyCustomKpis(company.id),
      getCompanyStandardKpiOverrides(company.id),
    ],
  );

  const submitted = reporting.filter((q) => q.submittedAt != null);
  const allKpis = [
    ...buildStandardEditableKpis(catalog, submitted, standardOverrides),
    ...customKpis.map(customToEditableKpi),
  ];
  const view = input.period ?? 'quarterly';
  const current = currentPeriod();
  const periods = buildKpiPeriods(view, submitted, allKpis, current);

  const categoryFilter = lowerCaseSet(input.categories);
  const nameFilter = lowerCaseSet(input.kpis);
  const rows = allKpis
    .filter((kpi) => matchesFilters(kpi, categoryFilter, nameFilter))
    .map((kpi) => ({
      kpi,
      values: periods.flatMap((period) => readKpi(kpi, period) ?? []),
    }))
    .filter((row) => row.values.length > 0);

  // Catalog category order, then custom-only categories — as the KPIs tab lists them.
  const categoryOrder = new Set([
    ...catalog.filter((d) => !d.isCustom).map((d) => d.category),
    ...rows.map((row) => row.kpi.category),
  ]);
  const categories = [...categoryOrder].flatMap((category) => {
    const inCategory = rows.filter((row) => row.kpi.category === category);
    if (inCategory.length === 0) return [];
    return [
      {
        category,
        kpis: inCategory.map(({ kpi, values }) => ({
          publicId: kpi.publicId,
          code: kpi.code,
          label: kpi.label,
          valueType: kpi.valueType,
          isFlow: kpi.isFlow,
          isCustom: kpi.isCustom,
          values,
        })),
      },
    ];
  });

  return {
    publicId: company.publicId,
    name: company.name,
    period: view,
    earliestYear: earliestDisplayedYear(current.year),
    kpiCount: rows.length,
    categories,
  };
}

export const investorKpiTools: McpToolDef[] = [
  {
    name: 'get_company_kpis',
    description:
      "KPI values for one portfolio company — the numbers the KPIs tab on /investor/company/[id] shows: the standard catalog (Growth & Revenue, Profitability, Cash & Liquidity, Unit Economics, Customers & Engagement, Capital & Valuation, Team & Efficiency) plus the organization's custom KPIs, grouped by category. Only KPIs with at least one value are returned, each with its values newest period first, covering earliestYear onward. " +
      'Portco-reported values count only once their report is submitted — drafts never appear. An investor correction wins over the portco-submitted value, and portcoValue then carries the value it replaced. ' +
      'source "direct" means the value was entered for that period; "computed" means a quarter or fiscal year was rolled up from its months or quarters (because none was entered, or those were updated more recently) — flow KPIs (isFlow) sum, the rest take the latest period. computedValue appears when a direct value disagrees with that roll-up. ' +
      'currency values are amounts the app displays as USD; percent values are percentage points (12.5 = 12.5%). KPIs the organization hides in its KPI settings, and narrative KPIs, are excluded. Requires the KPIs module to be enabled for the organization.',
    inputSchema: getCompanyKpisInput,
    annotations: {
      title: 'Get company KPIs',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getCompanyKpis as McpToolDef['handler'],
  },
];
