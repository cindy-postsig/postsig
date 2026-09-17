import type { SpendQueryInput } from '@/app/api/v2/handlers/spend/query';
import type { CostCalculationMethod } from '@/lib/settings/cost-calculation-method';

/**
 * psk-1844's cost calculation methods, in the ticket's vocabulary. One axis
 * drives the summary cards and the chart. The table's engineSpend columns
 * deliberately stay on the committed basis regardless of the selector
 * (product decision 2026-08-05): rows show recorded Contract Term fees, not
 * method-dependent allocations. 'committed' is the engine's name for what
 * the ticket calls Contract Term.
 */
export type CostMethod = 'amortized' | 'actual' | 'committed';

export const COST_METHODS: CostMethod[] = ['amortized', 'actual', 'committed'];

/**
 * The org setting (psk-1877) speaks the ticket's vocabulary; the engine speaks
 * its own. This is the whole of the translation — psk-1844 needed no engine
 * work because the three methods already exist as bases.
 */
const SETTING_TO_COST_METHOD: Record<CostCalculationMethod, CostMethod> = {
  amortized: 'amortized',
  actual_cost: 'actual',
  contract_term: 'committed',
};

export function costMethodFromSetting(
  setting: CostCalculationMethod,
): CostMethod {
  return SETTING_TO_COST_METHOD[setting];
}

export const costMethodLabels: Record<CostMethod, string> = {
  amortized: 'Amortized',
  actual: 'Actual Cost',
  committed: 'Contract Term',
};

export const costMethodTooltips: Record<CostMethod, string> = {
  amortized:
    'Allocates contract value proportionally across the contract term and applicable fiscal years.',
  actual:
    "Applies cost based on the expected payment date derived from the contract's payment terms.",
  committed:
    'Applies the full contract value to the fiscal year containing the contract or renewal start date.',
};

// Says what is being counted rather than repeating the method label, which the
// chart already shows as its heading.
export const costMethodSubtitles: Record<CostMethod, (fy: number) => string> = {
  amortized: (fy) => `Spend spread across each term · FY${fy}`,
  actual: (fy) => `Expected payments by billing date · FY${fy}`,
  committed: (fy) => `Commitments recognised in FY${fy}`,
};

export function costMethodInput(
  method: CostMethod,
  window: SpendQueryInput['window'],
  granularity: 'month' | 'year',
  groupBy: SpendQueryInput['groupBy'],
): SpendQueryInput {
  const shared = { window, granularity, groupBy };
  if (method === 'committed') {
    // Contract Term = start-dated commitments (product decision 2026-08-04,
    // reverting the provisional cancel-by dating): every term and renewal
    // books in the FY containing its start date — psk-1844's literal wording —
    // so one FY carries exactly one year-slice per contract. 'annual'
    // valuation gives a multi-year term one slice per FY. enrichWithEngineSpend
    // stamps the table's columns from the same query, so cards, chart, and
    // table agree.
    return {
      kind: 'commitments',
      valuation: 'annual',
      recognition: 'term-start',
      ...shared,
    };
  }
  return { kind: 'spend', basis: method, ...shared };
}

/**
 * The queries the spend cards and chart issue when they mount on these
 * selections: the current and next FY totals, the chart's monthly breakdown
 * and, on a historical year, that year's own total. Built through
 * costMethodInput so they are the keys useCostMethodTotals and SpendChart
 * read, which is what lets a server prefetch hydrate every one of them.
 */
export function spendInputsOnMount(
  method: CostMethod,
  fiscalYear: number,
  currentFiscalYear: number,
): SpendQueryInput[] {
  const isHistorical = fiscalYear < currentFiscalYear;
  return [
    ...(isHistorical
      ? [costMethodInput(method, { fiscalYear }, 'year', 'total')]
      : []),
    costMethodInput(method, 'currentFY', 'year', 'total'),
    costMethodInput(method, 'nextFY', 'year', 'total'),
    costMethodInput(
      method,
      isHistorical ? { fiscalYear } : 'currentFY',
      'month',
      'contract',
    ),
  ];
}
