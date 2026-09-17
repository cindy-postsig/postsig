import { generatePriceHistory } from '@/app/lib/budget/priceHistoryCalculator';
import {
  extractChartData,
  extractActualCostData,
  extractAmortizedData,
} from '@/app/lib/budget/priceHistoryChartUtils';
import type { Contract } from '@/app/lib/budget/types';

/**
 * PSK-1796 display rule on the budget chart: a bar and its popover header are
 * aggregates across contracts, so they read in the org base currency; the
 * per-contract rows inside the popover are single contracts, so they read in
 * the contract's own currency and are never converted.
 *
 * The chart carries both figures per contract (`calculatedValue` base,
 * `calculatedValueNative`), so these pin that the two stay distinct under
 * conversion and collapse to the same number when there is none.
 */

// USD→EUR, i.e. what a EUR-base org applies to a USD contract.
const RATE = 0.92;

interface ContractSpec {
  termStart: string;
  termEnd: string;
  billingFrequency?: string | null;
  fees: number;
  /** Omitted for a contract already in the org's base currency. */
  convertedFees?: number;
}

function makeContract(spec: ContractSpec): Contract {
  return {
    id: 1,
    vendor_id: 1,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: 12,
    renewal_period: 12,
    renewal_type: 'Auto',
    billing_frequency: spec.billingFrequency ?? null,
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_date: [],
    vendor_products_details: [
      {
        product_id: 100,
        year: 1,
        fees: spec.fees,
        // The base-currency stamp enrichWithPricing writes (lib/v2/core/pricing.ts).
        ...(spec.convertedFees === undefined
          ? {}
          : { convertedFees: spec.convertedFees }),
        vendor_products: { id: 100, name: 'Product 100' },
      },
    ],
    vendors: { name: 'Test Vendor' },
    users: { organizations: { fiscal_year_start_month: 1 } },
  } as unknown as Contract;
}

function generate(spec: ContractSpec) {
  return generatePriceHistory(makeContract(spec), 1, 'minimal');
}

const fiscalYearInfo = {
  currentFiscalYear: 2026,
  currentFiscalYearStart: new Date(2026, 0, 1),
  nextFiscalYearStart: new Date(2027, 0, 1),
};

/** The single contract entry a bar carries for the popover. */
function contractIn(
  data: Array<{ key: string; contracts: unknown[] }>,
  monthKey: string,
) {
  const point = data.find((d) => d.key === monthKey);
  expect(point).toBeDefined();
  const [contract] = point!.contracts as Array<{
    calculatedValue: number;
    calculatedValueNative: number;
    currency: string;
  }>;
  expect(contract).toBeDefined();
  return contract;
}

const converted: ContractSpec = {
  termStart: '2026-01-01',
  termEnd: '2026-12-31',
  billingFrequency: 'Annually',
  fees: 12000,
  convertedFees: 12000 * RATE,
};

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['performance'] });
  jest.setSystemTime(new Date(2026, 6, 15));
});

afterAll(() => {
  jest.useRealTimers();
});

describe('budget chart currency split (psk-1796)', () => {
  it('amortized: the bar sums base while its contract row keeps source currency', () => {
    const { data } = extractAmortizedData(
      [generate(converted)],
      'current',
      fiscalYearInfo,
    );

    // The bar is the aggregate, so it reads in base: 11,040 / 12 months.
    const july = data.find((d) => d.key === '2026-07');
    expect(july!.value).toBeCloseTo((12000 * RATE) / 12, 2);

    // The popover row is one contract, so it reads unconverted: 12,000 / 12.
    const contract = contractIn(data, '2026-07');
    expect(contract.calculatedValueNative).toBeCloseTo(12000 / 12, 2);
    expect(contract.calculatedValue).toBeCloseTo((12000 * RATE) / 12, 2);
    // And it carries the currency the row formats with.
    expect(contract.currency.toLowerCase()).toBe('usd');
  });

  it('actual cost: the billed row keeps source currency', () => {
    const { data } = extractActualCostData(
      [generate(converted)],
      'current',
      fiscalYearInfo,
    );

    const january = data.find((d) => d.key === '2026-01');
    expect(january!.value).toBeCloseTo(12000 * RATE, 2);

    const contract = contractIn(data, '2026-01');
    expect(contract.calculatedValueNative).toBeCloseTo(12000, 2);
    expect(contract.calculatedValue).toBeCloseTo(12000 * RATE, 2);
  });

  it('tcv: the contract row keeps source currency', () => {
    const { data } = extractChartData(
      [generate(converted)],
      'renewals',
      'tcv',
      fiscalYearInfo,
      new Date(2026, 6, 15),
    );

    const contract = contractIn(data, '2026-12');
    expect(contract.calculatedValueNative).toBeGreaterThan(0);
    expect(
      contract.calculatedValue / contract.calculatedValueNative,
    ).toBeCloseTo(RATE, 4);
  });

  it('leaves a base-currency contract identical in both figures', () => {
    // No convertedFees stamp: nothing to convert, so the popover row and the
    // bar report the same number. This is the single-currency org today.
    const { data } = extractAmortizedData(
      [generate({ ...converted, convertedFees: undefined })],
      'current',
      fiscalYearInfo,
    );

    const contract = contractIn(data, '2026-07');
    expect(contract.calculatedValueNative).toBeCloseTo(12000 / 12, 2);
    expect(contract.calculatedValue).toBe(contract.calculatedValueNative);
  });
});
