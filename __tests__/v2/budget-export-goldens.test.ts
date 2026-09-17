import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { generatePriceHistory } from '@/app/lib/budget/priceHistoryCalculator';
import {
  buildBudgetExportValues,
  BUDGET_EXPORT_METHODS,
} from '@/lib/v2/reports/budget-export/engine';
import type { Contract } from '@/app/lib/budget/types';
import type { ContractWithPricing } from '@/lib/v2/core/types';

// The engine's legacy USD policy: fixtures carry pre-converted USD stamps.
const USD_POLICY = { mode: 'preconverted-usd' } as const;

// Pins the budget-chart export's per-contract monthly value assembly — the
// only spend surface with no test before the exports port. The pre-port
// version of this file pinned the action's legacy pipeline (generatePriceHistories
// FULL mode → extractChartData over both fiscal years); this version pins the
// engine builder the ported action calls. The regeneration diff at the port
// commit is the review artifact: amortized fills the minimal-mode leading gap,
// actual/amortized stop annualizing the invoice fixture (decision #11), and
// the legacy Renewals sheet is replaced by Contract Term (recognized
// commitments, cancel-by dated — including initial terms).
// Regenerate deliberately with UPDATE_GOLDENS=1; never hand-edit the JSON.
const GOLDEN_PATH = path.join(
  __dirname,
  '__goldens__',
  'budget-export-goldens.json',
);

// Same frozen clock as spend-goldens: 2026-07-15, January fiscal year.
const CLOCK = new Date(2026, 6, 15);

interface ProductSpec {
  product_id: number;
  year?: number;
  fees: number;
}

interface ContractSpec {
  id: number;
  vendor: string;
  termStart: string;
  termEnd: string;
  typeId?: number;
  subscriptionTerm?: number | null;
  renewalPeriod?: number | null;
  renewalType?: string | null;
  billingFrequency?: string | null;
  annualIncrease?: number | null;
  willNotRenew?: boolean;
  cancelByOffsetDays?: number | null;
  products: ProductSpec[];
}

function makeContract(spec: ContractSpec): Contract {
  return {
    id: spec.id,
    vendor_id: spec.id * 10,
    type_id: spec.typeId ?? 2,
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
    cancel_date: [],
    cancel_by_date: spec.cancelByOffsetDays ?? null,
    vendor_products_details: spec.products.map((p) => ({
      product_id: p.product_id,
      year: p.year ?? 1,
      fees: p.fees,
      vendor_products: { id: p.product_id, name: `Product ${p.product_id}` },
    })),
    vendors: { name: spec.vendor },
    users: { organizations: { fiscal_year_start_month: 1 } },
  } as unknown as Contract;
}

function makeEnriched(spec: ContractSpec): ContractWithPricing {
  const raw = makeContract(spec);
  const priceHistory = generatePriceHistory(raw, 1, 'minimal');
  return {
    id: spec.id,
    vendor_id: spec.id * 10,
    vendor_name: spec.vendor,
    contract: raw,
    products: spec.products.map((p) => ({
      product_id: p.product_id,
      name: `Product ${p.product_id}`,
      isSuperseded: false,
      isSuperseding: false,
      sourceContractId: spec.id,
      year: p.year ?? 1,
      fees: p.fees,
      currentFee: p.fees,
      currentFeeUSD: p.fees,
      effectiveFeeUSD: p.fees,
      currency: 'USD',
    })),
    priceHistory,
    isLinkedChildInvoice: false,
  } as unknown as ContractWithPricing;
}

// Shapes chosen for the diffs the port surfaces:
// - standardMultiYear: quarterly billing, mid-term — stable across the port
// - yearRenewalHint: #1594 — committed value moves to projected renewals
// - annualIncrease: renewal compounding across both fiscal years
// - willNotRenew: projections stop at the recorded end
// - oneTime: no projections at all
// - cancelByOffset: 90-day offset — Contract Term recognizes the renewal at
//   its deadline, a month the legacy Renewals sheet never used
// - invoice: type_id 6 — decision #11, the engine projects no renewals where
//   legacy annualized it forward
const FIXTURES: ContractSpec[] = [
  {
    id: 3047,
    vendor: 'Standard MultiYear',
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
  {
    id: 1594,
    vendor: 'Renewal Hint',
    termStart: '2025-01-01',
    termEnd: '2025-12-31',
    subscriptionTerm: 12,
    billingFrequency: 'Annually',
    products: [
      { product_id: 100, year: 1, fees: 1000 },
      { product_id: 100, year: 2, fees: 1100 },
    ],
  },
  {
    id: 902,
    vendor: 'Annual Increase',
    termStart: '2024-01-01',
    termEnd: '2024-12-31',
    subscriptionTerm: 12,
    renewalPeriod: 12,
    annualIncrease: 10,
    billingFrequency: 'Annually',
    products: [{ product_id: 100, year: 1, fees: 1000 }],
  },
  {
    id: 901,
    vendor: 'Will Not Renew',
    termStart: '2026-06-01',
    termEnd: '2027-05-31',
    subscriptionTerm: 12,
    willNotRenew: true,
    billingFrequency: 'Annually',
    products: [{ product_id: 100, year: 1, fees: 9000 }],
  },
  {
    id: 900,
    vendor: 'One Time',
    termStart: '2026-01-01',
    termEnd: '2026-12-31',
    subscriptionTerm: 12,
    renewalType: 'One-Time',
    billingFrequency: 'Annually',
    products: [{ product_id: 100, year: 1, fees: 8000 }],
  },
  {
    id: 903,
    vendor: 'CancelBy Offset',
    termStart: '2026-04-01',
    termEnd: '2027-03-31',
    subscriptionTerm: 12,
    renewalPeriod: 12,
    billingFrequency: 'Annually',
    cancelByOffsetDays: 90,
    products: [{ product_id: 100, year: 1, fees: 12000 }],
  },
  {
    id: 906,
    vendor: 'Invoice Vendor',
    termStart: '2026-01-01',
    termEnd: '2026-06-30',
    typeId: 6,
    subscriptionTerm: 6,
    billingFrequency: null,
    products: [{ product_id: 100, year: 1, fees: 44000 }],
  },
];

function toGoldenShape(
  values: Map<number, Record<string, number>>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const id of [...values.keys()].sort((a, b) => a - b)) {
    const months = values.get(id)!;
    const nonZero = Object.fromEntries(
      Object.entries(months)
        .filter(([, value]) => value !== 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    if (Object.keys(nonZero).length > 0) out[String(id)] = nonZero;
  }
  return out;
}

describe('budget-export goldens', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: CLOCK });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('matches the pinned per-contract monthly export values', () => {
    const enriched = FIXTURES.map(makeEnriched);
    const { kept, months, values } = buildBudgetExportValues(
      enriched,
      [],
      { startMonth: 1 },
      CLOCK,
      USD_POLICY,
    );
    expect(kept.map((ec) => ec.id)).toHaveLength(FIXTURES.length);

    const capture: Record<string, unknown> = { months };
    for (const method of BUDGET_EXPORT_METHODS) {
      capture[method] = toGoldenShape(values[method]);
    }

    if (process.env.UPDATE_GOLDENS) {
      writeFileSync(GOLDEN_PATH, JSON.stringify(capture, null, 2) + '\n');
    }
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    expect(capture).toEqual(golden);
  });
});
