import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { enrichWithLineage } from '@/lib/v2/core/lineage';
import { generatePriceHistory } from '@/app/lib/budget/priceHistoryCalculator';
import {
  buildVendorPriceSummaries,
  type PriceHistoryCostMethod,
} from '@/lib/v2/reports/price-history/summary';
import type { ContractWithPricing } from '@/lib/v2/core/types';

// The engine's legacy USD policy: fixtures carry pre-converted USD stamps.
const USD_POLICY = { mode: 'preconverted-usd' } as const;

// Pins the price-history rollup (page + MCP get_price_history) ahead of its
// engine port. Fixtures are RAW rows through the REAL lineage enrichment, so
// the post-port regeneration diff shows exactly what the engine changes:
// straddling-amendment truncate+day-scale, decision-#9 per-cycle repeat,
// fiscal-year bucketing — and nothing else. Regenerate deliberately with
// UPDATE_GOLDENS=1; never hand-edit the JSON.
const GOLDEN_PATH = path.join(
  __dirname,
  '__goldens__',
  'price-history-goldens.json',
);

// Same frozen clock as the other spend goldens; targetYear caps projections
// at next year, mirroring the page's `currentYear + 1`.
const CLOCK = new Date(2026, 6, 15);
const TARGET_YEAR = 2027;

interface ProductSpec {
  product_id: number;
  year?: number;
  fees: number;
  name: string;
}

interface FixtureSpec {
  id: number;
  vendorId: number;
  vendor: string;
  typeId?: number;
  typeName?: string;
  status?: string;
  termStart: string;
  termEnd: string;
  subscriptionTerm?: number;
  renewalPeriod?: number | null;
  annualIncrease?: number;
  billingFrequency?: string;
  products: ProductSpec[];
}

function makeRaw(spec: FixtureSpec) {
  return {
    id: spec.id,
    vendor_id: spec.vendorId,
    type_id: spec.typeId ?? 2,
    status: spec.status ?? 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: spec.annualIncrease ?? null,
    annual_increase_months: null,
    subscription_term: spec.subscriptionTerm ?? 12,
    renewal_period: spec.renewalPeriod ?? null,
    renewal_type: 'Auto',
    billing_frequency: spec.billingFrequency ?? 'Annually',
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_date: [],
    cancel_by_date: null,
    business_sponsor: [],
    contract_tags: [],
    contract_acl_group: [],
    folder_contracts: [],
    contract_types: { name: spec.typeName ?? 'Order Form' },
    vendor_products_details: spec.products.map((p) => ({
      id: spec.id * 1000 + p.product_id,
      product_id: p.product_id,
      contract_id: spec.id,
      year: p.year ?? 1,
      fees: p.fees,
      vendor_products: { id: p.product_id, name: p.name },
    })),
    vendors: { name: spec.vendor },
  };
}

// Shapes chosen for the diffs the port will surface:
// - amendedParent/amendment: mid-cycle amendment — legacy keeps the parent's
//   straddling 2025 cycle at FULL fee (cutoff zeroes only periods STARTING at
//   or after it); the engine truncates + day-scales that cycle
// - decision9: 24-month span, single year-1 row — legacy max prices the whole
//   span once (12k in 2025, gap 2026); the engine repeats per 12-month cycle
// - multiYear: standard 36-month year-1/2/3 — parity + projections to the cap
// - archived: inactive contract — projections capped at the recorded end,
//   isArchived flag on the drill-down row
// - renewalPct: 10% auto-increase — active vs next cycle = +10% at all levels
// - stub18mo: non-12-multiple span — whole-span pricing, unchanged either side
// - standaloneInvoice: type_id 6 — dropped by the builder on both sides
const FIXTURES: FixtureSpec[] = [
  {
    id: 11,
    vendorId: 1,
    vendor: 'Amended Corp',
    termStart: '2024-01-01',
    termEnd: '2024-12-31',
    products: [{ product_id: 500, fees: 10000, name: 'Data Feed' }],
  },
  {
    id: 12,
    vendorId: 1,
    vendor: 'Amended Corp',
    typeName: 'Amendment',
    termStart: '2025-07-01',
    termEnd: '2026-06-30',
    products: [{ product_id: 500, fees: 15000, name: 'Data Feed' }],
  },
  {
    id: 21,
    vendorId: 2,
    vendor: 'MultiSpan GmbH',
    termStart: '2025-01-01',
    termEnd: '2026-12-31',
    subscriptionTerm: 24,
    products: [{ product_id: 600, fees: 12000, name: 'Terminal' }],
  },
  {
    id: 31,
    vendorId: 3,
    vendor: 'MultiYear Inc',
    termStart: '2024-01-01',
    termEnd: '2026-12-31',
    subscriptionTerm: 36,
    renewalPeriod: 12,
    billingFrequency: 'Quarterly',
    products: [
      { product_id: 700, year: 1, fees: 10000, name: 'Index A' },
      { product_id: 700, year: 2, fees: 11000, name: 'Index A' },
      { product_id: 700, year: 3, fees: 12000, name: 'Index A' },
    ],
  },
  {
    id: 41,
    vendorId: 4,
    vendor: 'Archived Ltd',
    status: 'inactive',
    termStart: '2024-03-01',
    termEnd: '2025-02-28',
    products: [{ product_id: 800, fees: 8000, name: 'Legacy Tool' }],
  },
  {
    id: 51,
    vendorId: 5,
    vendor: 'Increase Co',
    termStart: '2025-08-01',
    termEnd: '2026-07-31',
    annualIncrease: 10,
    products: [{ product_id: 900, fees: 5000, name: 'Ratings' }],
  },
  {
    id: 61,
    vendorId: 6,
    vendor: 'Stub PLC',
    termStart: '2025-01-01',
    termEnd: '2026-06-30',
    subscriptionTerm: 18,
    products: [{ product_id: 950, fees: 9000, name: 'Research' }],
  },
  {
    id: 71,
    vendorId: 7,
    vendor: 'Invoice Vendor',
    typeId: 6,
    typeName: 'Invoice',
    termStart: '2026-01-01',
    termEnd: '2026-06-30',
    subscriptionTerm: 6,
    products: [{ product_id: 990, fees: 4000, name: 'One Off' }],
  },
];

const RELATIONSHIPS = [{ parent_contract_id: 11, child_contract_id: 12 }];

describe('price-history goldens (pre-port pin)', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: CLOCK });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('matches the pinned vendor summaries', () => {
    const raw = FIXTURES.map(makeRaw);
    const enriched = enrichWithLineage(raw, RELATIONSHIPS).map((ec) => ({
      ...ec,
      // The cached minimal-mode history the page's enriched set carries; the
      // rollup reads it only for ACV, but pinning it keeps the ACV source
      // comparable across the port.
      priceHistory: generatePriceHistory(ec.contract, 1, 'minimal', {}),
    })) as unknown as ContractWithPricing[];

    const forMethod = (method: PriceHistoryCostMethod) =>
      buildVendorPriceSummaries(
        enriched,
        1,
        TARGET_YEAR,
        RELATIONSHIPS,
        CLOCK,
        method,
        undefined,
        USD_POLICY,
      );
    const capture = JSON.parse(
      JSON.stringify({
        committed: forMethod('committed'),
        amortized: forMethod('amortized'),
        actual: forMethod('actual'),
      }),
    );

    if (process.env.UPDATE_GOLDENS) {
      writeFileSync(GOLDEN_PATH, JSON.stringify(capture, null, 2) + '\n');
    }
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
    expect(capture).toEqual(golden);
  });

  it('excludes Exchange Agreement invoices like regular invoices (psk-1890)', () => {
    const eaInvoice = makeRaw({
      id: 81,
      vendorId: 8,
      vendor: 'EA Invoice Vendor',
      typeId: 13,
      typeName: 'EA Invoice',
      termStart: '2026-01-01',
      termEnd: '2026-06-30',
      subscriptionTerm: 6,
      products: [{ product_id: 995, fees: 4000, name: 'Exchange Feed' }],
    });
    const enriched = enrichWithLineage(
      [eaInvoice],
      [],
    ) as unknown as ContractWithPricing[];

    const { vendors } = buildVendorPriceSummaries(
      enriched,
      1,
      TARGET_YEAR,
      [],
      CLOCK,
      'committed',
      undefined,
      USD_POLICY,
    );

    expect(vendors).toHaveLength(0);
  });
});
