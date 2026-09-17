import {
  generatePriceHistories,
  generatePriceHistory,
} from '@/app/lib/budget/priceHistoryCalculator';
import type { Contract } from '@/app/lib/budget/types';
import { buildSpendLineageFromEnriched } from '@/lib/v2/spend/members';

/**
 * Effective end dates for cancelled products (PSK-1830): a product struck by
 * a confirmed declaration keeps its rows but stops accruing cost from the
 * declaring contract's date. A product cancelled in year 3 still costs money
 * in years 1-2.
 */

function makeContract(
  overrides: Partial<Record<string, unknown>> = {},
): Contract {
  return {
    id: 1,
    vendor_id: 1,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: null,
    annual_increase_months: null,
    subscription_term: null,
    renewal_period: 12,
    renewal_type: 'Auto-Renew',
    billing_frequency: null,
    will_not_renew: false,
    term_start_date: [{ date: '2020-01-01' }],
    term_end_date: [{ date: '2020-12-31' }],
    cancel_date: [],
    vendor_products_details: [
      {
        product_id: 1,
        year: 1,
        fees: 1200,
        vendor_products: { id: 1, name: 'Product 1' },
      },
      {
        product_id: 2,
        year: 1,
        fees: 600,
        vendor_products: { id: 2, name: 'Product 2' },
      },
    ],
    vendors: { name: 'Test Vendor' },
    users: { organizations: { fiscal_year_start_month: 1 } },
    ...overrides,
  } as unknown as Contract;
}

function cutoffs(productId: number, date: string): Map<number, Date> {
  return new Map([[productId, new Date(date)]]);
}

describe('generatePriceHistory — product fee cutoffs', () => {
  it('zeroes a cancelled product only from the cutoff date forward', () => {
    const history = generatePriceHistory(makeContract(), 1, 'full', {
      productFeeCutoffs: cutoffs(1, '2022-01-01'),
    });

    const before = history.periods.filter(
      (p) => new Date(p.startDate) < new Date('2022-01-01'),
    );
    const after = history.periods.filter(
      (p) => new Date(p.startDate) >= new Date('2022-01-01'),
    );

    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);

    // Pre-cutoff periods accrue both products: 1200 + 600.
    before.forEach((p) => expect(p.fees).toBe(1800));
    // Post-cutoff periods accrue only the surviving product.
    after.forEach((p) => {
      expect(p.fees).toBe(600);
      const struck = p.productFees.find((pf) => pf.productId === 1);
      expect(struck).toBeDefined();
      expect(struck?.fees).toBe(0);
      expect(struck?.feesUSD).toBe(0);
    });
  });

  it('keeps the struck product row present (full record, zero accrual)', () => {
    const history = generatePriceHistory(makeContract(), 1, 'full', {
      productFeeCutoffs: cutoffs(1, '2021-01-01'),
    });

    history.periods.forEach((p) => {
      expect(p.productFees.map((pf) => pf.productId).sort()).toEqual([1, 2]);
    });
  });

  it('produces identical output when no cutoffs are supplied', () => {
    const withUndefined = generatePriceHistory(makeContract(), 1, 'full');
    const withEmpty = generatePriceHistory(makeContract(), 1, 'full', {
      productFeeCutoffs: new Map(),
    });

    expect(withEmpty).toEqual(withUndefined);
  });

  it('reflects the cutoff in derived contract values', () => {
    const unaffected = generatePriceHistory(makeContract(), 1, 'full');
    const cut = generatePriceHistory(makeContract(), 1, 'full', {
      // Cutoff before the whole history: product 1 never accrues.
      productFeeCutoffs: cutoffs(1, '2019-01-01'),
    });

    expect(unaffected.totalContractValue).toBeGreaterThan(0);
    // Product 1 contributed 1200 of every 1800; only product 2's share remains.
    expect(cut.totalContractValue).toBe(unaffected.totalContractValue / 3);
  });
});

describe('generatePriceHistories — per-contract cutoffs', () => {
  it('applies each contract its own cutoff map', () => {
    const contractA = makeContract({ id: 1 });
    const contractB = makeContract({ id: 2 });
    const cutoffsByContract = new Map([[1, cutoffs(1, '2019-01-01')]]);

    const [historyA, historyB] = generatePriceHistories(
      [contractA, contractB],
      1,
      'full',
      cutoffsByContract,
    );

    historyA.periods.forEach((p) => expect(p.fees).toBe(600));
    historyB.periods.forEach((p) => expect(p.fees).toBe(1800));
  });

  it('changes nothing when the map is absent', () => {
    const plain = generatePriceHistories([makeContract()], 1, 'full');
    const withParam = generatePriceHistories(
      [makeContract()],
      1,
      'full',
      undefined,
    );

    expect(withParam).toEqual(plain);
  });
});

describe('buildSpendLineageFromEnriched — event cutoffs (PSK-1830)', () => {
  // MSA 1 licenses product 10; ADD 2 re-lists it (supersession cutoff at its
  // start). Event cutoffs merge into that graph earliest-wins.
  const enriched = [
    {
      id: 1,
      contract: { term_start_date: [{ date: '2020-01-01' }] },
      products: [
        {
          product_id: 10,
          sourceContractId: 1,
          isSuperseding: false,
          isSuperseded: true,
          supersededByContractId: 2,
        },
      ],
    },
    {
      id: 2,
      contract: { term_start_date: [{ date: '2022-01-01' }] },
      products: [
        {
          product_id: 10,
          sourceContractId: 1,
          isSuperseding: true,
          isSuperseded: false,
        },
      ],
    },
  ] as never[];

  it('adds event cutoffs for products no supersession touches', () => {
    const lineage = buildSpendLineageFromEnriched(
      enriched,
      [],
      new Map([[1, new Map([[99, new Date('2023-05-01')]])]]),
    );

    expect(lineage.cutoffs.get(1)?.get(99)).toBe('2023-05-01');
  });

  it('keeps the earlier date when both mechanisms strike the same product', () => {
    const withSupersession = buildSpendLineageFromEnriched(enriched, []);
    const supersessionCutoff = withSupersession.cutoffs.get(1)?.get(10);
    expect(supersessionCutoff).toBe('2022-01-01');

    const earlierEvent = buildSpendLineageFromEnriched(
      enriched,
      [],
      new Map([[1, new Map([[10, new Date('2021-06-01')]])]]),
    );
    expect(earlierEvent.cutoffs.get(1)?.get(10)).toBe('2021-06-01');

    const laterEvent = buildSpendLineageFromEnriched(
      enriched,
      [],
      new Map([[1, new Map([[10, new Date('2023-06-01')]])]]),
    );
    expect(laterEvent.cutoffs.get(1)?.get(10)).toBe('2022-01-01');
  });

  it('leaves the graph unchanged when no event cutoffs are passed', () => {
    const plain = buildSpendLineageFromEnriched(enriched, []);
    const withEmpty = buildSpendLineageFromEnriched(enriched, [], new Map());

    expect(withEmpty).toEqual(plain);
  });
});
