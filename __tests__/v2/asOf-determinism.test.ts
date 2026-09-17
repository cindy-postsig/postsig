import { generatePriceHistory } from '@/app/lib/budget/priceHistoryCalculator';
import {
  extractChartData,
  extractActualCostData,
  extractAmortizedData,
} from '@/app/lib/budget/priceHistoryChartUtils';
import { getFiscalYearInfo } from '@/app/lib/budget/dateUtils';
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
  renewalType?: string | null;
  billingFrequency?: string | null;
  annualIncrease?: number | null;
  willNotRenew?: boolean;
  cancelDate?: string | null;
  products: ProductSpec[];
}

function makeContract(spec: ContractSpec): Contract {
  return {
    id: spec.id ?? 1,
    vendor_id: 1,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: spec.annualIncrease ?? null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: spec.renewalType ?? 'Auto',
    billing_frequency: spec.billingFrequency ?? null,
    will_not_renew: spec.willNotRenew ?? false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_date: spec.cancelDate ? [{ date: spec.cancelDate }] : [],
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

const shapes: Record<string, ContractSpec> = {
  standardMultiYear: {
    id: 3047,
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
  },
  yearRenewalHint: {
    id: 1594,
    termStart: '2025-01-01',
    termEnd: '2025-12-31',
    subscriptionTerm: 12,
    billingFrequency: 'Annually',
    products: [
      { product_id: 100, year: 1, fees: 1000 },
      { product_id: 100, year: 2, fees: 1100 },
    ],
  },
  gartnerStub: {
    id: 1504,
    termStart: '2025-10-01',
    termEnd: '2027-12-31',
    subscriptionTerm: 27,
    products: [
      { product_id: 100, year: 1, fees: 0 },
      { product_id: 100, year: 2, fees: 36900 },
      { product_id: 100, year: 3, fees: 38374 },
      { product_id: 200, year: 1, fees: 0 },
      { product_id: 200, year: 2, fees: 147600 },
      { product_id: 200, year: 3, fees: 153496 },
    ],
  },
  oneTime: {
    id: 900,
    termStart: '2026-01-01',
    termEnd: '2026-12-31',
    subscriptionTerm: 12,
    renewalType: 'One-Time',
    billingFrequency: 'Annually',
    products: [{ product_id: 100, year: 1, fees: 8000 }],
  },
  willNotRenew: {
    id: 901,
    termStart: '2026-06-01',
    termEnd: '2027-05-31',
    subscriptionTerm: 12,
    willNotRenew: true,
    billingFrequency: 'Annually',
    products: [{ product_id: 100, year: 1, fees: 9000 }],
  },
};

// Passing `asOf` undefined exercises the defaulted `new Date()` boundary at
// every entry point, so the same helper drives both the wall-clock path and
// the explicit-asOf path.
function runPipeline(asOf?: Date) {
  const fiscalYearInfo = getFiscalYearInfo(1, asOf);
  const out: Record<string, unknown> = {};

  const generate: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(shapes)) {
    const c = makeContract(spec);
    generate[name] = {
      minimal: generatePriceHistory(c, 1, 'minimal', { asOf }),
      full: generatePriceHistory(c, 1, 'full', { asOf }),
      max: generatePriceHistory(c, 1, 'max', { targetYear: 2028, asOf }),
    };
  }
  out.generate = generate;

  const ph = generatePriceHistory(
    makeContract(shapes.standardMultiYear),
    1,
    'minimal',
    { asOf },
  );
  out.extractors = {
    amortizedCurrent: extractAmortizedData([ph], 'current', fiscalYearInfo)
      .data,
    actualCurrent: extractActualCostData([ph], 'current', fiscalYearInfo).data,
    tcv: extractChartData([ph], 'renewals', 'tcv', fiscalYearInfo, asOf).data,
  };

  return out;
}

const AS_OF = new Date(2026, 6, 15);

it('explicit asOf fully replaces the wall clock', () => {
  jest.useFakeTimers({ doNotFake: ['performance'] });
  jest.setSystemTime(AS_OF);
  const clockOutput = runPipeline();
  jest.useRealTimers();

  const asOfOutput = runPipeline(AS_OF);

  expect(asOfOutput).toEqual(clockOutput);
});
