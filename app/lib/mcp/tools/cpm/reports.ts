import { z } from 'zod';
import { getReportData, reportPipelines } from '@/lib/v2';
import { reportConfigs } from '@/app/(app)/(cpm)/reports/reportConfigs';
import { requireMcpContext } from '@/app/lib/mcp/context';
import { assertSameOrg } from '@/app/lib/mcp/guards';
import { paginate, paginationSchema } from '@/app/lib/mcp/pagination';
import type { McpToolDef } from '@/app/lib/mcp/tools/types';

export interface ReportInfo {
  description: string;
  acceptsRange?: boolean;
  rangeDescription?: string;
}

// Descriptions are derived from the JSDoc on each pipeline in
// lib/v2/reports/definitions. Keep these in sync when reports change.
export const REPORT_INFO: Record<keyof typeof reportPipelines, ReportInfo> = {
  unconfirmed: {
    description:
      "Contracts with status 'unconfirmed', excluding invoices. Use to triage records that need human review before they enter the active set.",
  },
  trial: {
    description:
      'Trial contracts (type_id 7) with days_remaining. Sorted by days_remaining ascending. Use for "what trials are wrapping up?"',
  },
  nda: {
    description:
      'NDA contracts (type_id 8). Use for tracking executed NDAs across vendors.',
  },
  unexecuted: {
    description:
      'Contracts not yet signed (all_parties_signed = "No"), with a vendor attached. Excludes invoices, terms of service, fee schedules and unclassified ("Other") documents, which carry no signature to chase. Use for chasing missing signatures.',
  },
  dora: {
    description:
      'DORA compliance report (EU financial regulation). Each row carries `doraScoreValue` (0–9), `missingDoraCategories` (string[] of human-readable category names, e.g. "Audit Requirements", "Service Level Agreements"), and `hasICTVendor` (boolean), on top of the base contract fields (vendor with name+domain, contract type, etc.). Sorted by score ascending so the worst gaps come first. Filters by ICT-provider status — pass active_tab="ict" (default) for ICT providers, or "other" for non-ICT.',
  },
  'contract-omissions': {
    description:
      "Contracts with required clauses missing (e.g. payment terms, cancellation process). Driven by your org's missing-clauses settings. Use for compliance gap analysis.",
  },
  invoices: {
    description:
      "Invoice discrepancy report: invoice-type contracts (type_id 6) linked to a parent contract, compared against it to surface over/undercharges. Each row carries expectedInvoiceAmount, invoiceAmount, `discrepancy` (this invoice's over/undercharge for its own billing period, in the invoice's source currency — invoiced minus expected), `difference` (the percentage gap), and frequencyMismatch. " +
      'ANNUALIZED vs PER-INVOICE: an aggregate "overcharge" total for this report is ANNUALIZED (each invoice\'s discrepancy projected to a full year) and converted into the org base currency at each invoice-date FX rate, so it will NOT equal the sum of the per-invoice `discrepancy` amounts in a row-by-row table. When you state a total, label it (e.g. "annualized overcharges of X", formatted in the org base currency) — never write "N invoices totalling X" when the rows show per-invoice amounts that sum to something else. If you want a figure that reconciles with the displayed rows, sum the per-invoice `discrepancy` you actually show — valid only while every row shares one currency; across mixed-currency rows sum each row\'s `discrepancyBase` (org base currency, still per-invoice, not annualized) instead.',
  },
  utilization: {
    description:
      'Contracts with seat allocation (vendor_products_users) — either enterprise-licensed or with explicit seat counts. Use for usage-vs-seats analysis. ' +
      "For 'total idle spend' / 'unassigned seat cost' / 'potential overage' figures, narrate the top-level totalValue.amountBase (denominated in the response's `baseCurrency`) — that is the canonical number shown in the in-app utilization summary. " +
      'Do NOT sum per-row potentialOverage to produce a total: row values are in native currency and use a different per-product calculation, so the sum will drift from the canonical figure. ' +
      'When rendering as a table, present columns as: Product · Licensed · Assigned · Unassigned · Idle Spend.',
  },
  'auto-renewals': {
    description:
      'Contracts with renewal_type "Auto" expiring within range_days. Default 90 days. Sorted by cancel-by date ascending.',
    acceptsRange: true,
    rangeDescription: 'Days from today to look ahead. Default 90.',
  },
  'manual-renewals': {
    description:
      'Contracts with renewal_type other than "Auto" expiring within range_days. Default 90 days. Sorted by cancel-by date ascending.',
    acceptsRange: true,
    rangeDescription: 'Days from today to look ahead. Default 90.',
  },
  'recently-renewed': {
    description:
      'Contracts that have renewed within the last range_days (most recent term_start_date is within the window). Default 90 days.',
    acceptsRange: true,
    rangeDescription: 'Days back from today. Default 90.',
  },
};

const REPORT_TYPES = Object.keys(REPORT_INFO) as Array<
  keyof typeof reportPipelines
>;

const reportListing = REPORT_TYPES.map(
  (t) => `  - ${t}: ${REPORT_INFO[t].description}`,
).join('\n');

const input = z.object({
  type: z
    .enum(REPORT_TYPES as [string, ...string[]])
    .describe(
      `Report type. Available reports:\n${reportListing}\n\n` +
        'auto-renewals/manual-renewals/recently-renewed accept range_days. ' +
        'dora accepts active_tab. ' +
        "contract-omissions uses the user's org missing-clauses settings automatically.",
    ),
  range_days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe(
      'Only used by renewal reports (auto-renewals, manual-renewals, recently-renewed). Defaults to 90.',
    ),
  active_tab: z
    .enum(['ict', 'other'])
    .optional()
    .describe(
      'Only used by the DORA report. Defaults to "ict" (ICT providers per DORA classification).',
    ),
  ...paginationSchema,
});

async function getReportTool(payload: z.infer<typeof input>) {
  const ctx = requireMcpContext();
  const info = REPORT_INFO[payload.type as keyof typeof REPORT_INFO];

  const options: Record<string, unknown> = {};
  if (info?.acceptsRange && payload.range_days !== undefined) {
    options.range = payload.range_days;
  }
  if (payload.type === 'dora') {
    options.activeTab = payload.active_tab ?? 'ict';
  }
  if (payload.type === 'contract-omissions') {
    options.missingClauseSettings =
      ctx.userMetadata.organizationMissingClauseSettings?.settings ?? null;
  }
  // Use the in-app summary's canonical valueField for each report so
  // totalValue.amountBase matches what the user sees on the report page.
  // Without this, utilization (configured for valueField:"potentialOverage" in
  // reportConfigs) would default to "totalContractValue" in the runner and
  // surface a sum of contract values instead of idle spend — the exact bug
  // behind the $823,530-vs-$354,749 mismatch.
  const reportConfig = reportConfigs[payload.type];
  const valueField = reportConfig?.valueField ?? 'totalContractValue';
  options.valueField = valueField;

  const data = await getReportData(payload.type, options);
  assertSameOrg(
    data.contracts ?? [],
    `get_report_data:${payload.type}`,
    (c) => c.contract?.organization_id,
  );
  const page = paginate(data.rows, payload);

  // DORA's metadata.allContracts is the full active-contracts dump used by the
  // browser for client-side tab switching (ICT ↔ non-ICT). At ~20KB per row
  // it bloats the response by 96% in production-sized orgs and isn't needed
  // for an API consumer — the agent re-calls with the other tab if it wants
  // that slice.
  let metadata = data.metadata;
  if (
    payload.type === 'dora' &&
    metadata &&
    typeof metadata === 'object' &&
    'allContracts' in metadata
  ) {
    const { allContracts: _drop, ...rest } = metadata as Record<
      string,
      unknown
    >;
    metadata = rest;
  }

  return {
    type: payload.type,
    description: info?.description,
    optionsApplied: options,
    count: page.items.length,
    totalMatched: page.totalAvailable,
    nextCursor: page.nextCursor,
    // Denomination of totalValue.amountBase — the org's base display currency.
    baseCurrency: ctx.userMetadata.baseCurrency,
    // What totalValue.amountBase actually measures for THIS report — labeled
    // so the agent narrates it correctly instead of inferring from the report
    // type. e.g. utilization → "Idle spend (unassigned-seat value)".
    // (data.totalValueInUSD is a legacy name — since PSK-1796 it holds the
    // base-currency figure.)
    totalValue: {
      amountBase: data.totalValueInUSD,
      valueField,
      label: reportConfig?.valueLabel ?? null,
    },
    metadata,
    rows: page.items,
  };
}

export const reportsTools: McpToolDef[] = [
  {
    name: 'get_report_data',
    description:
      "Run a named CPM report and return its rows. Reports are the canonical, hardcoded slices the team has agreed on (renewals, compliance, invoicing, etc.). Use list_contracts/query_contracts for ad-hoc filtering. Each report type has its own purpose — see the type parameter description for the full menu. Aggregate totals are denominated in the organization's base display currency (see the response `baseCurrency`) — format amounts with that currency, never assuming USD. Paginated.",
    inputSchema: input,
    annotations: {
      title: 'Run CPM report',
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: getReportTool as McpToolDef['handler'],
  },
];
