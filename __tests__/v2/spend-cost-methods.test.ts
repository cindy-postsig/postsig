import type { Contract } from '@/app/lib/budget/types';
import { querySpend, EMPTY_LINEAGE } from '@/lib/v2/spend';
import { costMethodInput, COST_METHODS } from '@/components/budget/costMethod';
import { buildBudgetExportValues } from '@/lib/v2/reports/budget-export/engine';
import type { ContractWithPricing } from '@/lib/v2/core/types';

// The engine's legacy USD policy: fixtures carry pre-converted USD stamps.
const USD_POLICY = { mode: 'preconverted-usd' } as const;

const ASOF = new Date('2026-08-01T00:00:00Z');
const usd = { mode: 'preconverted-usd' } as const;

// Mid-year start, calendar fiscal year: only Jun–Dec of the term falls inside
// FY2026. This is psk-1844's acceptance case — "a contract started in June
// should record only part of its fee in the current summary box".
const juneStart = {
  id: 1,
  vendor_id: 10,
  type_id: 2,
  status: 'active',
  status_id: 4,
  currency: 'usd',
  annual_increase: null,
  annual_increase_months: null,
  subscription_term: 12,
  renewal_period: 12,
  renewal_type: 'Auto',
  billing_frequency: 'Annually',
  will_not_renew: false,
  term_start_date: [{ date: '2026-06-01' }],
  term_end_date: [{ date: '2027-05-31' }],
  cancel_date: [],
  cancel_by_date: null,
  vendor_products_details: [
    {
      product_id: 100,
      year: 1,
      fees: 120000,
      vendor_products: { id: 100, name: 'Product' },
    },
  ],
  vendors: { name: 'Test Vendor' },
} as unknown as Contract;

function currentFY(basis: 'amortized' | 'actual' | 'committed'): number {
  return querySpend(
    [juneStart],
    {
      basis,
      source: 'expected',
      window: 'currentFY',
      granularity: 'year',
      groupBy: 'total',
      currency: usd,
      fiscalConfig: { startMonth: 1 },
      asOf: ASOF,
      ...(basis === 'amortized' ? { proration: 'monthly' as const } : {}),
    },
    EMPTY_LINEAGE,
  ).items.reduce((sum, item) => sum + item.value, 0);
}

describe('psk-1844 cost calculation methods on a mid-year contract', () => {
  it('Amortized prorates — 7 of the 12 term months fall in FY2026', () => {
    // 120,000 / 12 = 10,000 per month; Jun through Dec inclusive is 7 months.
    expect(currentFY('amortized')).toBe(70000);
  });

  it('Contract Term takes the whole cycle in the year it starts', () => {
    expect(currentFY('committed')).toBe(120000);
  });

  it('Actual Cost follows the billing date — annual, paid up front in June', () => {
    expect(currentFY('actual')).toBe(120000);
  });

  it('the three methods genuinely differ for a mid-year start', () => {
    expect(currentFY('amortized')).toBeLessThan(currentFY('committed'));
  });

  // Contract Term = start-dated commitments (product decision 2026-08-04,
  // reverting the provisional cancel-by dating): every term and renewal books
  // in the FY containing its start date — psk-1844's literal wording.
  // enrichWithEngineSpend stamps the table's columns and
  // buildBudgetExportValues fills the export workbook from the same query, so
  // this pin is the lockstep guard: change one, change all four.
  it('Amortized and Actual Cost are plain spend queries', () => {
    for (const method of ['amortized', 'actual'] as const) {
      expect(costMethodInput(method, 'currentFY', 'year', 'total')).toEqual({
        kind: 'spend',
        basis: method,
        window: 'currentFY',
        granularity: 'year',
        groupBy: 'total',
      });
    }
    expect(COST_METHODS).toEqual(['amortized', 'actual', 'committed']);
  });

  it('Contract Term is the commitments query at term-start recognition', () => {
    expect(costMethodInput('committed', 'currentFY', 'year', 'total')).toEqual({
      kind: 'commitments',
      valuation: 'annual',
      recognition: 'term-start',
      window: 'currentFY',
      granularity: 'year',
      groupBy: 'total',
    });
  });

  it('the export workbook dates an offset renewal at its start, like the chart', () => {
    const offset = {
      ...juneStart,
      id: 2,
      term_start_date: [{ date: '2026-04-01' }],
      term_end_date: [{ date: '2027-03-31' }],
      cancel_by_date: 90,
    } as unknown as Contract;
    const enriched = [
      {
        id: 2,
        contract: offset,
        products: [],
        priceHistory: { annualContractValueUSD: 120000 },
        isLinkedChildInvoice: false,
      } as unknown as ContractWithPricing,
    ];

    const { values } = buildBudgetExportValues(
      enriched,
      [],
      { startMonth: 1 },
      ASOF,
      USD_POLICY,
    );
    const committed = values.committed.get(2) ?? {};
    // Initial term at its own start; the renewal in the month its term starts
    // (2027-04), NOT at its 2026-12-31 cancel-by deadline — the 90-day offset
    // must not shift it.
    expect(committed['2026-04']).toBe(120000);
    expect(committed['2026-12']).toBeUndefined();
    expect(committed['2027-04']).toBe(120000);
  });

  it('the export accepts a historical fiscal year — [FY, FY+1] windows over in-window rows', () => {
    // juneStart's earliest recorded term begins 2026-06; a second contract ran
    // 2022 only (One-Time, ended, would-be-archived). FY2022 must export the
    // 2022 contract and drop juneStart, with months spanning 2022–2023.
    const ended = {
      ...juneStart,
      id: 3,
      renewal_type: 'One-Time',
      renewal_period: null,
      term_start_date: [{ date: '2022-03-01' }],
      term_end_date: [{ date: '2023-02-28' }],
    } as unknown as Contract;
    const wrap = (contract: Contract) =>
      ({
        id: (contract as { id: number }).id,
        contract,
        products: [],
        priceHistory: { annualContractValueUSD: 120000 },
        isLinkedChildInvoice: false,
      }) as unknown as ContractWithPricing;

    const { kept, months, values } = buildBudgetExportValues(
      [wrap(juneStart), wrap(ended)],
      [],
      { startMonth: 1 },
      ASOF,
      USD_POLICY,
      2022,
    );

    expect(kept.map((ec) => ec.id)).toEqual([3]);
    expect(months[0]).toBe('2022-01');
    expect(months[months.length - 1]).toBe('2023-12');
    expect(values.committed.get(3)?.['2022-03']).toBe(120000);
    // juneStart's 2026 money must not leak into the FY2022 workbook grid.
    expect(values.committed.get(1)).toBeUndefined();
  });

  // SpendMethodCards omits proration entirely, so the cards depend on
  // querySpend's `proration ?? 'monthly'` default rather than on passing it.
  it('omitting proration matches monthly — the path the summary cards take', () => {
    const omitted = querySpend(
      [juneStart],
      {
        basis: 'amortized',
        source: 'expected',
        window: 'currentFY',
        granularity: 'year',
        groupBy: 'total',
        currency: usd,
        fiscalConfig: { startMonth: 1 },
        asOf: ASOF,
      },
      EMPTY_LINEAGE,
    ).items.reduce((sum, item) => sum + item.value, 0);

    expect(omitted).toBe(70000);
  });
});
