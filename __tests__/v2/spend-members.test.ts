import {
  buildLineageMembers,
  buildParentTerms,
  buildSpendLineageFromEnriched,
  lineageFor,
  type RelationshipEdge,
} from '@/lib/v2/spend';
import { resolveFeeSegments } from '@/lib/v2/spend/resolver';
import { INFERENCE_REASONS } from '@/lib/v2/spend/resolver/shapes';
import type { ContractWithLineage } from '@/lib/v2/core/types';
import type { Contract } from '@/app/lib/budget/types';
import type { CurrencyPolicy } from '@/lib/v2/spend';

const CURRENCY: CurrencyPolicy = { mode: 'preconverted-usd' };
const AS_OF = new Date('2026-07-15T00:00:00.000Z');
const HORIZON = new Date('2029-01-01T00:00:00.000Z');
const HORIZON_START = new Date(0);

interface ProductSpec {
  product_id: number;
  fees?: number;
  sourceContractId?: number;
  isSuperseding?: boolean;
}

interface EnrichedSpec {
  id: number;
  termStarts?: string[];
  termEnd?: string | null;
  subscriptionTerm?: number | null;
  isLinkedChildInvoice?: boolean;
  products?: ProductSpec[];
}

function makeEnriched(spec: EnrichedSpec): ContractWithLineage {
  return {
    id: spec.id,
    vendor_id: 1,
    vendor_name: 'Test Vendor',
    contract: {
      id: spec.id,
      term_start_date: (spec.termStarts ?? []).map((date) => ({ date })),
      term_end_date: spec.termEnd ? [{ date: spec.termEnd }] : [],
      subscription_term: spec.subscriptionTerm ?? null,
    },
    products: (spec.products ?? []).map((p) => ({
      product_id: p.product_id,
      name: `Product ${p.product_id}`,
      fees: p.fees ?? 1000,
      year: 1,
      sourceContractId: p.sourceContractId ?? spec.id,
      isSuperseded: false,
      isSuperseding: p.isSuperseding ?? false,
    })),
    isLinkedChildInvoice: spec.isLinkedChildInvoice ?? false,
  };
}

function makeContract(spec: {
  id: number;
  termStart: string;
  termEnd?: string | null;
  subscriptionTerm?: number | null;
  products: Array<{ product_id: number; fees: number }>;
}): Contract {
  return {
    id: spec.id,
    vendor_id: 1,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: null,
    subscription_term: spec.subscriptionTerm ?? null,
    renewal_period: null,
    renewal_type: 'Auto',
    billing_frequency: 'Annually',
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: spec.termEnd ? [{ date: spec.termEnd }] : [],
    cancel_date: [],
    vendor_products_details: spec.products.map((p) => ({
      product_id: p.product_id,
      year: 1,
      fees: p.fees,
      vendor_products: { id: p.product_id, name: `Product ${p.product_id}` },
    })),
    vendors: { name: 'Test Vendor' },
    users: { organizations: { fiscal_year_start_month: 1 } },
  } as unknown as Contract;
}

const edge = (parent: number, child: number): RelationshipEdge => ({
  parent_contract_id: parent,
  child_contract_id: child,
});

describe('buildLineageMembers: enrichWithLineage output → LineageMember[]', () => {
  it('emits one member per product with lineage metadata carried through', () => {
    const members = buildLineageMembers([
      makeEnriched({
        id: 657,
        termStarts: ['2024-01-01'],
        products: [
          { product_id: 71, sourceContractId: 646, isSuperseding: true },
          { product_id: 72 },
        ],
      }),
    ]);

    expect(members).toEqual([
      {
        contractId: 657,
        productId: 71,
        sourceContractId: 646,
        isSuperseding: true,
        originalStart: '2024-01-01',
      },
      {
        contractId: 657,
        productId: 72,
        sourceContractId: 657,
        isSuperseding: false,
        originalStart: '2024-01-01',
      },
    ]);
  });

  it('uses the EARLIEST recorded term_start_date as originalStart', () => {
    const members = buildLineageMembers([
      makeEnriched({
        id: 646,
        termStarts: ['2025-01-01', '2023-06-01', '2024-01-01'],
        products: [{ product_id: 71 }],
      }),
    ]);
    expect(members[0].originalStart).toBe('2023-06-01');
  });

  it('recovers non-ISO manual dates leniently', () => {
    const members = buildLineageMembers([
      makeEnriched({
        id: 646,
        termStarts: ['01/31/2022'],
        products: [{ product_id: 71 }],
      }),
    ]);
    expect(members[0].originalStart).toBe('2022-01-31');
  });

  it('excludes linked child invoices (they would spuriously cut the parent)', () => {
    const members = buildLineageMembers([
      makeEnriched({
        id: 646,
        termStarts: ['2023-01-01'],
        products: [{ product_id: 71 }],
      }),
      makeEnriched({
        id: 900,
        termStarts: ['2023-07-01'],
        isLinkedChildInvoice: true,
        products: [{ product_id: 71, sourceContractId: 646 }],
      }),
    ]);
    expect(members.map((m) => m.contractId)).toEqual([646]);
  });

  it('keeps standalone invoices — they are cutoff-neutral singleton families', () => {
    const members = buildLineageMembers([
      makeEnriched({
        id: 901,
        termStarts: ['2024-03-01'],
        isLinkedChildInvoice: false,
        products: [{ product_id: 80 }],
      }),
    ]);
    expect(members).toHaveLength(1);
  });

  it('skips contracts with no parseable start date', () => {
    const members = buildLineageMembers([
      makeEnriched({
        id: 646,
        termStarts: ['not-a-date'],
        products: [{ product_id: 71 }],
      }),
      makeEnriched({ id: 647, products: [{ product_id: 71 }] }),
    ]);
    expect(members).toHaveLength(0);
  });
});

describe('buildParentTerms: parent subscription_term facts per child', () => {
  const parent = makeEnriched({
    id: 100,
    termStarts: ['2024-01-01'],
    termEnd: '2026-12-31',
    subscriptionTerm: 36,
    products: [{ product_id: 1 }],
  });

  it('records the direct parent term for a child contract', () => {
    const child = makeEnriched({
      id: 200,
      termStarts: ['2024-04-16'],
      products: [{ product_id: 2 }],
    });
    const terms = buildParentTerms([parent, child], [edge(100, 200)]);
    expect(terms.get(200)).toBe(36);
  });

  it('skips linked child invoices', () => {
    const invoice = makeEnriched({
      id: 201,
      termStarts: ['2024-04-16'],
      isLinkedChildInvoice: true,
      products: [{ product_id: 2 }],
    });
    const terms = buildParentTerms([parent, invoice], [edge(100, 201)]);
    expect(terms.size).toBe(0);
  });

  it('skips edges whose parent is not in the loaded set', () => {
    const child = makeEnriched({
      id: 200,
      termStarts: ['2024-04-16'],
      products: [{ product_id: 2 }],
    });
    const terms = buildParentTerms([child], [edge(999, 200)]);
    expect(terms.size).toBe(0);
  });

  it('records nothing when the parent has no positive subscription_term', () => {
    const termlessParent = makeEnriched({
      id: 101,
      termStarts: ['2024-01-01'],
      products: [{ product_id: 1 }],
    });
    const child = makeEnriched({
      id: 200,
      termStarts: ['2024-04-16'],
      products: [{ product_id: 2 }],
    });
    const terms = buildParentTerms([termlessParent, child], [edge(101, 200)]);
    expect(terms.size).toBe(0);
  });

  it('with several parents, the lowest-numbered parent recording a term wins', () => {
    const termlessParent = makeEnriched({
      id: 101,
      termStarts: ['2024-01-01'],
      products: [{ product_id: 1 }],
    });
    const otherParent = makeEnriched({
      id: 102,
      termStarts: ['2024-01-01'],
      subscriptionTerm: 24,
      products: [{ product_id: 1 }],
    });
    const child = makeEnriched({
      id: 200,
      termStarts: ['2024-04-16'],
      products: [{ product_id: 2 }],
    });
    // 101 records no term, so it never claims the child; 100 outranks 102.
    const terms = buildParentTerms(
      [termlessParent, otherParent, parent, child],
      [edge(101, 200), edge(102, 200), edge(100, 200)],
    );
    expect(terms.get(200)).toBe(36);
  });

  // The fetch issues no ORDER BY, so the same edges can arrive in any sequence.
  // Both builders must land on the same winner regardless.
  it('resolves the same parent term whatever order the edges arrive in', () => {
    const otherParent = makeEnriched({
      id: 102,
      termStarts: ['2024-01-01'],
      termEnd: '2026-12-31',
      subscriptionTerm: 24,
      products: [{ product_id: 1 }],
    });
    const child = makeEnriched({
      id: 200,
      termStarts: ['2024-04-16'],
      products: [{ product_id: 2 }],
    });
    const enriched = [parent, otherParent, child];
    const edges = [edge(100, 200), edge(102, 200)];

    const forward = buildParentTerms(enriched, edges);
    const reversed = buildParentTerms(enriched, [...edges].reverse());

    expect(forward.get(200)).toBe(36);
    expect(reversed.get(200)).toBe(forward.get(200));
  });

  it('ignores edges with null endpoints', () => {
    const child = makeEnriched({
      id: 200,
      termStarts: ['2024-04-16'],
      products: [{ product_id: 2 }],
    });
    const terms = buildParentTerms(
      [parent, child],
      [
        { parent_contract_id: null, child_contract_id: 200 },
        { parent_contract_id: 100, child_contract_id: null },
      ],
    );
    expect(terms.size).toBe(0);
  });
});

describe('buildSpendLineageFromEnriched: composed lineage input', () => {
  it('builds cutoffs from invoice-filtered members and carries parent terms', () => {
    const parent = makeEnriched({
      id: 646,
      termStarts: ['2023-01-01'],
      termEnd: '2023-12-31',
      subscriptionTerm: 12,
      products: [{ product_id: 71 }],
    });
    const amendment = makeEnriched({
      id: 657,
      termStarts: ['2024-01-01'],
      products: [
        { product_id: 71, sourceContractId: 646, isSuperseding: true },
      ],
    });
    const linkedInvoice = makeEnriched({
      id: 900,
      termStarts: ['2023-07-01'],
      isLinkedChildInvoice: true,
      products: [{ product_id: 71, sourceContractId: 646 }],
    });

    const lineage = buildSpendLineageFromEnriched(
      [parent, amendment, linkedInvoice],
      [edge(646, 657), edge(646, 900)],
    );

    // The amendment cuts the parent at its own start — NOT at the linked
    // invoice's 2023-07-01, which would have sliced a real term spuriously.
    expect(lineage.cutoffs.get(646)?.get(71)).toBe('2024-01-01');
    expect(lineage.parentTerms.get(657)).toBe(12);
    expect(lineage.parentTerms.has(900)).toBe(false);
  });

  it('lineageFor surfaces a parent term even without cutoffs (new-product addendum)', () => {
    const msa = makeEnriched({
      id: 100,
      termStarts: ['2024-01-01'],
      termEnd: '2026-12-31',
      subscriptionTerm: 36,
      products: [{ product_id: 1 }],
    });
    const addendum = makeEnriched({
      id: 200,
      termStarts: ['2024-04-16'],
      products: [{ product_id: 2 }],
    });

    const lineage = buildSpendLineageFromEnriched(
      [msa, addendum],
      [edge(100, 200)],
    );

    expect(lineage.cutoffs.size).toBe(0);
    expect(lineageFor(lineage, 200)?.parentSubscriptionTerm).toBe(36);
    expect(lineageFor(lineage, 100)).toBeUndefined();
  });
});

describe('resolver: addendum term inheritance', () => {
  const addendum = makeContract({
    id: 200,
    termStart: '2024-04-16',
    products: [{ product_id: 2, fees: 12000 }],
  });

  it('a no-end-date, no-term child adopts the parent term instead of 12 months', () => {
    const segments = resolveFeeSegments(
      addendum,
      {
        cutoffByProduct: new Map(),
        amendsByProduct: new Map(),
        parentSubscriptionTerm: 36,
      },
      {
        asOf: AS_OF,
        horizonStart: HORIZON_START,
        horizonEnd: HORIZON,
        currency: CURRENCY,
      },
    );

    // 36 months with a single-year fee row = an annual price repeated per
    // cycle (decision #9): three 12-month segments, then renewals after the
    // full inherited term — not after the silent 12-month default.
    const initial = segments.filter((s) => s.source === 'year-entry');
    expect(initial.map((s) => [s.from, s.to])).toEqual([
      ['2024-04-16', '2025-04-16'],
      ['2025-04-16', '2026-04-16'],
      ['2026-04-16', '2027-04-16'],
    ]);
    expect(initial.every((s) => s.fee === 12000)).toBe(true);
    const renewals = segments.filter((s) => s.source === 'renewal-projection');
    expect(renewals.length).toBeGreaterThan(0);
    expect(renewals.every((s) => s.from >= '2027-04-16')).toBe(true);
  });

  it('a non-12-multiple inherited term prices the whole span, marked inferred with the inheritance reason', () => {
    const segments = resolveFeeSegments(
      addendum,
      {
        cutoffByProduct: new Map(),
        amendsByProduct: new Map(),
        parentSubscriptionTerm: 18,
      },
      {
        asOf: AS_OF,
        horizonStart: HORIZON_START,
        horizonEnd: HORIZON,
        currency: CURRENCY,
      },
    );

    const initial = segments.filter((s) => s.source === 'year-entry');
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({
      from: '2024-04-16',
      to: '2025-10-16',
      fee: 12000,
      confidence: 'inferred',
      reason: INFERENCE_REASONS.parentTermInherited,
    });
  });

  it("the child's own subscription_term wins over the parent's", () => {
    const withOwnTerm = makeContract({
      id: 201,
      termStart: '2024-04-16',
      subscriptionTerm: 12,
      products: [{ product_id: 2, fees: 12000 }],
    });
    const segments = resolveFeeSegments(
      withOwnTerm,
      {
        cutoffByProduct: new Map(),
        amendsByProduct: new Map(),
        parentSubscriptionTerm: 36,
      },
      {
        asOf: AS_OF,
        horizonStart: HORIZON_START,
        horizonEnd: HORIZON,
        currency: CURRENCY,
      },
    );

    const initial = segments.filter((s) => s.source === 'year-entry');
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({
      from: '2024-04-16',
      to: '2025-04-16',
      confidence: 'explicit',
    });
  });

  it('a recorded end date wins over the parent term', () => {
    const withEnd = makeContract({
      id: 202,
      termStart: '2024-04-16',
      termEnd: '2025-04-15',
      products: [{ product_id: 2, fees: 12000 }],
    });
    const segments = resolveFeeSegments(
      withEnd,
      {
        cutoffByProduct: new Map(),
        amendsByProduct: new Map(),
        parentSubscriptionTerm: 36,
      },
      {
        asOf: AS_OF,
        horizonStart: HORIZON_START,
        horizonEnd: HORIZON,
        currency: CURRENCY,
      },
    );

    const initial = segments.filter((s) => s.source === 'year-entry');
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({
      from: '2024-04-16',
      to: '2025-04-16',
      confidence: 'explicit',
    });
  });

  it('without lineage the 12-month default still applies (shadow behavior unchanged)', () => {
    const segments = resolveFeeSegments(addendum, undefined, {
      asOf: AS_OF,
      horizonStart: HORIZON_START,
      horizonEnd: HORIZON,
      currency: CURRENCY,
    });
    const initial = segments.filter((s) => s.source === 'year-entry');
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({
      from: '2024-04-16',
      to: '2025-04-16',
      confidence: 'explicit',
    });
  });
});
