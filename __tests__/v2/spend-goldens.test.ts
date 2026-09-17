import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { generatePriceHistory } from '@/app/lib/budget/priceHistoryCalculator';
import {
  extractChartData,
  extractRenewalsData,
  extractActualCostData,
  extractAmortizedData,
} from '@/app/lib/budget/priceHistoryChartUtils';
import { enrichWithEffectiveFees } from '@/lib/v2/core/pricing';
import type { Contract, PriceHistory } from '@/app/lib/budget/types';
import type { ContractWithPricing } from '@/lib/v2/core/types';

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

const fiscalYearInfo = {
  currentFiscalYear: 2026,
  currentFiscalYearStart: new Date(2026, 0, 1),
  nextFiscalYearStart: new Date(2027, 0, 1),
};

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
  eighteenMonth: {
    id: 18,
    termStart: '2025-01-01',
    termEnd: '2026-06-30',
    subscriptionTerm: 18,
    billingFrequency: 'Quarterly',
    products: [{ product_id: 100, year: 1, fees: 5000 }],
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
  annualIncrease: {
    id: 902,
    termStart: '2024-01-01',
    termEnd: '2024-12-31',
    subscriptionTerm: 12,
    renewalPeriod: 12,
    annualIncrease: 10,
    billingFrequency: 'Annually',
    products: [{ product_id: 100, year: 1, fees: 1000 }],
  },
  // PR #2039 shape: multi-year rows + annual_increase + 12-month renewals.
  // A renewal earns increases per its CYCLE length (renewal_period first),
  // not per the row count — under the frozen clock the 2026 cycle is
  // renewalCount 2, so the divergence the fix removes is pinned in-window.
  annualIncreaseRenewalCycle: {
    id: 2039,
    termStart: '2022-01-01',
    termEnd: '2024-12-31',
    subscriptionTerm: 36,
    renewalPeriod: 12,
    annualIncrease: 4,
    billingFrequency: 'Annually',
    products: [
      { product_id: 100, year: 1, fees: 10000 },
      { product_id: 100, year: 2, fees: 10000 },
      { product_id: 100, year: 3, fees: 10000 },
    ],
  },
};

function periodView(ph: PriceHistory) {
  return ph.periods.map((p) => ({
    startDate: p.startDate,
    endDate: p.endDate,
    termType: p.termType,
    yearWithinTerm: p.yearWithinTerm,
    renewalCount: p.renewalCount,
    status: p.status,
    isCurrentTerm: p.isCurrentTerm,
    isActivePeriod: p.isActivePeriod,
    fees: p.fees,
    feesUSD: p.feesUSD,
  }));
}

function chartView(data: { key: string; value: number }[]) {
  return data
    .filter((d) => d.value !== 0)
    .map((d) => ({ key: d.key, value: d.value }));
}

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['performance'] });
  jest.setSystemTime(new Date(2026, 6, 15));
});
afterAll(() => jest.useRealTimers());

it('capture', () => {
  const out: any = {};

  // 1. generatePriceHistory in all three modes
  out.generate = {};
  for (const [name, spec] of Object.entries(shapes)) {
    const c = makeContract(spec);
    out.generate[name] = {
      minimal: periodView(generatePriceHistory(c, 1, 'minimal')),
      full: periodView(generatePriceHistory(c, 1, 'full')),
      max: periodView(generatePriceHistory(c, 1, 'max', { targetYear: 2028 })),
      tcv: {
        totalContractValue: generatePriceHistory(c, 1, 'minimal')
          .totalContractValue,
        annualContractValue: generatePriceHistory(c, 1, 'minimal')
          .annualContractValue,
      },
    };
  }

  // 2. extractors over minimal-mode price history
  out.extractors = {};
  for (const [name, spec] of Object.entries(shapes)) {
    const ph = generatePriceHistory(makeContract(spec), 1, 'minimal');
    out.extractors[name] = {
      amortizedCurrent: chartView(
        extractAmortizedData([ph], 'current', fiscalYearInfo).data,
      ),
      amortizedProjected: chartView(
        extractAmortizedData([ph], 'projected', fiscalYearInfo).data,
      ),
      actualCurrent: chartView(
        extractActualCostData([ph], 'current', fiscalYearInfo).data,
      ),
      actualProjected: chartView(
        extractActualCostData([ph], 'projected', fiscalYearInfo).data,
      ),
      renewalsCurrent: chartView(
        extractRenewalsData([ph], 'current', fiscalYearInfo).data,
      ),
      renewalsProjected: chartView(
        extractRenewalsData([ph], 'projected', fiscalYearInfo).data,
      ),
      tcv: extractChartData([ph], 'renewals', 'tcv', fiscalYearInfo).data.map(
        (d) => ({ key: d.key, value: d.value }),
      ),
    };
  }

  // 3. (deleted with the monthly-report port: the duplicate billing walk
  // extractActualCostPriceChanges / legacy transformToPriceChanges is gone;
  // the report's price changes are pinned by monthly-report-goldens.)

  // 4. (deleted with the price-history port: distributeFeeAcrossYears and the
  // page's private rollup are gone; sliceCommitted generalizes the convention
  // and price-history-goldens pins the full rollup.)

  // Amended shape: parent superseded by child, calendar-year aligned.
  const parentContract = makeContract({
    id: 646,
    termStart: '2023-01-01',
    termEnd: '2023-12-31',
    subscriptionTerm: 12,
    renewalPeriod: 12,
    billingFrequency: 'Annually',
    products: [{ product_id: 71, year: 1, fees: 10000 }],
  });
  const childContract = makeContract({
    id: 657,
    termStart: '2024-01-01',
    termEnd: '2024-12-31',
    subscriptionTerm: 12,
    renewalPeriod: 12,
    billingFrequency: 'Annually',
    products: [{ product_id: 71, year: 1, fees: 12000 }],
  });

  const buildCWP = (contract: Contract, lineage: any): ContractWithPricing => {
    const ph = generatePriceHistory(contract, 1, 'minimal');
    for (const period of ph.periods) {
      for (const pf of period.productFees) {
        (pf as any).isSuperseded = lineage.isSuperseded;
      }
    }
    return {
      id: contract.id as number,
      contract,
      products: [
        {
          product_id: 71,
          name: 'Product 71',
          year: 1,
          fees: lineage.fees,
          currentFee: lineage.fees,
          currentFeeUSD: lineage.fees,
          currency: 'USD',
          effectiveFeeUSD: lineage.fees,
          isSuperseded: lineage.isSuperseded,
          isSuperseding: lineage.isSuperseding,
          supersededByContractId: lineage.supersededByContractId,
          supersedesProductInContractId: lineage.supersedesProductInContractId,
          sourceContractId: lineage.sourceContractId,
        },
      ],
      priceHistory: ph,
      isLinkedChildInvoice: false,
    } as unknown as ContractWithPricing;
  };

  const parentCWP = buildCWP(parentContract, {
    fees: 10000,
    isSuperseded: true,
    isSuperseding: false,
    supersededByContractId: 657,
    supersedesProductInContractId: undefined,
    sourceContractId: 646,
  });
  const childCWP = buildCWP(childContract, {
    fees: 12000,
    isSuperseded: false,
    isSuperseding: true,
    supersededByContractId: undefined,
    supersedesProductInContractId: 646,
    // Same family source as the parent so the cutoff walk pairs them.
    sourceContractId: 646,
  });

  // enrichWithEffectiveFees lineage model (date-aware replacement)
  const enriched = enrichWithEffectiveFees([parentCWP, childCWP]);
  out.enrichWithEffectiveFees = enriched.map((c) => ({
    id: c.id,
    effectiveTotalContractValueUSD:
      c.priceHistory?.effectiveTotalContractValueUSD,
    isFullySuperseded: (c.priceHistory as any)?.isFullySuperseded,
    isFullySuperseding: (c.priceHistory as any)?.isFullySuperseding,
    periods: (c.priceHistory?.periods ?? []).map((p: any) => ({
      startDate: p.startDate,
      endDate: p.endDate,
      fees: p.fees,
      feesUSD: p.feesUSD,
      effectiveFees: p.effectiveFees,
      effectiveFeesUSD: p.effectiveFeesUSD,
      productFees: p.productFees.map((pf: any) => ({
        productId: pf.productId,
        fees: pf.fees,
        feesUSD: pf.feesUSD,
        isSuperseded: pf.isSuperseded,
        isAmended: pf.isAmended,
        isSuperseding: pf.isSuperseding,
        isEffectivelySuperseded: pf.isEffectivelySuperseded,
      })),
    })),
  }));

  // (buildVendorPriceSummaries capture deleted with the price-history port;
  // the zero-at-cutoff lineage model is pinned by price-history-goldens and
  // the boundary pin in spend-lineage.test.ts.)

  const goldenPath = join(__dirname, '__goldens__', 'spend-goldens.json');
  // Math.pow rounds differently across V8 versions (1000 * 1.1 ** 4 ends in
  // ...004 on Node 26, ...006 on Node 22), so the golden pins values to
  // micro-precision rather than raw double bits.
  const serialized = JSON.stringify(
    out,
    (_key, value) =>
      typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value,
    2,
  );

  if (process.env.UPDATE_GOLDENS) {
    writeFileSync(goldenPath, serialized);
    return;
  }

  const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
  expect(JSON.parse(serialized)).toEqual(golden);
});
