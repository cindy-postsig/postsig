import { generatePriceHistory } from '@/app/lib/budget/priceHistoryCalculator';
import {
  extractActualCostData,
  extractAmortizedData,
} from '@/app/lib/budget/priceHistoryChartUtils';
import type { Contract } from '@/app/lib/budget/types';

interface ProductSpec {
  product_id: number;
  year?: number;
  fees: number;
}

interface ContractSpec {
  id?: number;
  termStart: string;
  termEnd: string;
  subscriptionTerm?: number | null;
  renewalPeriod?: number | null;
  billingFrequency?: string | null;
  products: ProductSpec[];
}

function makeContract(spec: ContractSpec): Contract {
  return {
    id: spec.id ?? 1,
    vendor_id: 1,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: 'Auto',
    billing_frequency: spec.billingFrequency ?? null,
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_date: [],
    vendor_products_details: spec.products.map((p) => ({
      product_id: p.product_id,
      year: p.year ?? 1,
      fees: p.fees,
      vendor_products: { id: p.product_id, name: `Product ${p.product_id}` },
    })),
    vendors: { name: 'Test Vendor' },
    users: { organizations: { fiscal_year_start_month: 1 } },
  } as unknown as Contract;
}

// Same mode as the spend-chart pipeline (lib/v2/core/pricing.ts).
function generate(spec: ContractSpec) {
  return generatePriceHistory(makeContract(spec), 1, 'minimal');
}

const fiscalYearInfo = {
  currentFiscalYear: 2026,
  currentFiscalYearStart: new Date(2026, 0, 1),
  nextFiscalYearStart: new Date(2027, 0, 1),
};

function monthValues(data: { key: string; value: number }[]) {
  return Object.fromEntries(data.map((d) => [d.key, d.value]));
}

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['performance'] });
  jest.setSystemTime(new Date(2026, 6, 15));
});

afterAll(() => {
  jest.useRealTimers();
});

describe('extractActualCostData — psk-1850 year-slice billing', () => {
  // ICE Data Indices contract 3047 shape: 3-year initial term split into
  // 12-month year slices, each carrying that year's fee. subscription_term=36
  // made getTermLength report 36 months for a 12-month slice, spreading one
  // year's fee across three years (each quarterly bill showed 1/3 of actual).
  const iceShape: ContractSpec = {
    termStart: '2024-01-01',
    termEnd: '2026-12-31',
    subscriptionTerm: 36,
    renewalPeriod: 12,
    billingFrequency: 'Quarterly',
    products: [
      { product_id: 100, year: 1, fees: 51044 },
      { product_id: 100, year: 2, fees: 56044 },
      { product_id: 100, year: 3, fees: 56044 },
    ],
  };

  it('bills the full year-slice fee across its own year, not the whole term', () => {
    const ph = generate(iceShape);
    const { data } = extractActualCostData([ph], 'current', fiscalYearInfo);
    const values = monthValues(data);

    // 56,044 (year-3 fee) / 12 months × 3-month billing = 14,011 per quarter
    expect(values['2026-01']).toBe(14011);
    expect(values['2026-04']).toBe(14011);
    expect(values['2026-07']).toBe(14011);
    expect(values['2026-10']).toBe(14011);
    expect(values['2026-02']).toBe(0);
    expect(values['2026-12']).toBe(0);

    const totalBilled = data.reduce((sum, d) => sum + d.value, 0);
    expect(totalBilled).toBe(56044);
  });

  it('leaves the amortized view unchanged (fee/12 per month)', () => {
    const ph = generate(iceShape);
    const { data } = extractAmortizedData([ph], 'current', fiscalYearInfo);
    const values = monthValues(data);

    expect(values['2026-07']).toBeCloseTo(56044 / 12, 2);
    const total = data.reduce((sum, d) => sum + d.value, 0);
    expect(total).toBeCloseTo(56044, 0);
  });

  it('still re-bills a per-cycle fee when the period spans multiple cycles', () => {
    // Opposite data shape: a single period whose dates span 3 years but whose
    // fee is per 12-month cycle (subscription_term=12, year-1 products only).
    // getTermLength's downward override to 12 must survive the fix, so the
    // annual fee is billed in full every year, not divided by 36.
    const ph = generate({
      termStart: '2025-01-01',
      termEnd: '2027-12-31',
      subscriptionTerm: 12,
      billingFrequency: 'Annually',
      products: [{ product_id: 100, year: 1, fees: 12000 }],
    });
    const { data } = extractActualCostData([ph], 'current', fiscalYearInfo);
    const values = monthValues(data);

    expect(values['2026-01']).toBe(12000);
  });
});
