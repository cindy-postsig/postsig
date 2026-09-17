import { describe, expect, it } from '@jest/globals';
import {
  buildRemovedProductKeys,
  cancelledProductNames,
  contractsToChainContracts,
  excludeRemovedProductsForYear,
  getEffectiveStartDate,
  getOrderingDate,
  resolveRemovedProductEndDates,
  resolveRemovedProductEndDatesAcrossChains,
  resolveRemovedProductIds,
  resolveRemovedProductIdsAcrossChains,
  type ChainContractInput,
  type ProductLineageEventInput,
} from '@/lib/contracts/productLineageResolution';

/**
 * The Berenberg chain: an MSA with three sibling addenda underneath it.
 * Add 3 declares that it replaces the entire product schedule.
 *
 *   MSA   (K3040) 2020-01-01  products 1, 2
 *   Add 1 (K3037) 2021-01-01  product  3
 *   Add 2 (K3038) 2022-01-01  product  4
 *   Add 3 (K3039) 2023-01-01  products 5, 6
 */
const MSA = 3040;
const ADD1 = 3037;
const ADD2 = 3038;
const ADD3 = 3039;

const dated = (date: string) => [{ date }];

const berenbergChain = (): ChainContractInput[] => [
  { contractId: MSA, termStartDate: dated('2020-01-01'), productIds: [1, 2] },
  { contractId: ADD1, termStartDate: dated('2021-01-01'), productIds: [3] },
  { contractId: ADD2, termStartDate: dated('2022-01-01'), productIds: [4] },
  { contractId: ADD3, termStartDate: dated('2023-01-01'), productIds: [5, 6] },
];

const blanketEvent = (contractId: number): ProductLineageEventInput => ({
  contract_id: contractId,
  product_id: null,
  action: 'replace_all_prior',
  status: 'confirmed',
});

const cancelEvent = (
  contractId: number,
  productId: number,
): ProductLineageEventInput => ({
  contract_id: contractId,
  product_id: productId,
  action: 'cancel_product',
  status: 'confirmed',
});

describe('getOrderingDate', () => {
  it('uses the LAST array element, matching the hierarchy child sort', () => {
    // term_start_date is newest-first; the last entry is the original term.
    // Using [0] here would order the chain differently than the sidebar.
    const result = getOrderingDate([
      { date: '2023-06-01' },
      { date: '2020-01-01' },
    ]);

    expect(result?.toISOString()).toBe(new Date('2020-01-01').toISOString());
  });

  it('accepts a bare string date', () => {
    expect(getOrderingDate('2021-03-04')?.toISOString()).toBe(
      new Date('2021-03-04').toISOString(),
    );
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty array', []],
    ['an empty string', ''],
    ['an entry with no date', [{ notADate: 'x' }]],
    ['an unparseable date', 'not-a-date'],
    ['a number', 12345],
  ])('returns null for %s', (_label, input) => {
    expect(getOrderingDate(input)).toBeNull();
  });
});

describe('resolveRemovedProductIds — blanket replace_all_prior', () => {
  it('strikes every product of every earlier chain contract, siblings included', () => {
    // The heart of PSK-1830. Add 1 and Add 2 are SIBLINGS of Add 3, not
    // ancestors — ancestor-only logic would leave their products rendering
    // as live.
    const removed = resolveRemovedProductIds(
      [blanketEvent(ADD3)],
      berenbergChain(),
    );

    expect(removed.get(MSA)).toEqual(new Set([1, 2]));
    expect(removed.get(ADD1)).toEqual(new Set([3]));
    expect(removed.get(ADD2)).toEqual(new Set([4]));
  });

  it('leaves the declaring contract untouched', () => {
    const removed = resolveRemovedProductIds(
      [blanketEvent(ADD3)],
      berenbergChain(),
    );

    expect(removed.has(ADD3)).toBe(false);
  });

  it('leaves later contracts untouched', () => {
    // A blanket declaration by Add 1 must not reach forward to Add 2/Add 3.
    const removed = resolveRemovedProductIds(
      [blanketEvent(ADD1)],
      berenbergChain(),
    );

    expect(removed.get(MSA)).toEqual(new Set([1, 2]));
    expect(removed.has(ADD2)).toBe(false);
    expect(removed.has(ADD3)).toBe(false);
  });

  it('leaves same-dated contracts untouched', () => {
    // "Precedes" is strict; a contract sharing the declaring date is not prior.
    const chain: ChainContractInput[] = [
      { contractId: 1, termStartDate: dated('2022-01-01'), productIds: [10] },
      { contractId: 2, termStartDate: dated('2022-01-01'), productIds: [20] },
    ];

    const removed = resolveRemovedProductIds([blanketEvent(2)], chain);

    expect(removed.size).toBe(0);
  });

  it('strikes nothing on a chain contract that has no products', () => {
    const chain: ChainContractInput[] = [
      { contractId: MSA, termStartDate: dated('2020-01-01'), productIds: [] },
      { contractId: ADD3, termStartDate: dated('2023-01-01'), productIds: [5] },
    ];

    const removed = resolveRemovedProductIds([blanketEvent(ADD3)], chain);

    expect(removed.has(MSA)).toBe(false);
  });
});

describe('resolveRemovedProductIds — cancel_product', () => {
  it('strikes only the named product in earlier contracts', () => {
    const chain: ChainContractInput[] = [
      {
        contractId: MSA,
        termStartDate: dated('2020-01-01'),
        productIds: [1, 2],
      },
      { contractId: ADD3, termStartDate: dated('2023-01-01'), productIds: [5] },
    ];

    const removed = resolveRemovedProductIds([cancelEvent(ADD3, 1)], chain);

    expect(removed.get(MSA)).toEqual(new Set([1]));
  });

  it('strikes the product across every earlier contract that licenses it', () => {
    const chain: ChainContractInput[] = [
      { contractId: MSA, termStartDate: dated('2020-01-01'), productIds: [1] },
      { contractId: ADD1, termStartDate: dated('2021-01-01'), productIds: [1] },
      { contractId: ADD3, termStartDate: dated('2023-01-01'), productIds: [9] },
    ];

    const removed = resolveRemovedProductIds([cancelEvent(ADD3, 1)], chain);

    expect(removed.get(MSA)).toEqual(new Set([1]));
    expect(removed.get(ADD1)).toEqual(new Set([1]));
  });

  it('does not record a contract that never licensed the product', () => {
    const chain: ChainContractInput[] = [
      { contractId: MSA, termStartDate: dated('2020-01-01'), productIds: [2] },
      { contractId: ADD3, termStartDate: dated('2023-01-01'), productIds: [5] },
    ];

    const removed = resolveRemovedProductIds([cancelEvent(ADD3, 1)], chain);

    expect(removed.size).toBe(0);
  });

  it('ignores a cancel_product event with no product id', () => {
    const malformed: ProductLineageEventInput = {
      contract_id: ADD3,
      product_id: null,
      action: 'cancel_product',
      status: 'confirmed',
    };

    const removed = resolveRemovedProductIds([malformed], berenbergChain());

    expect(removed.size).toBe(0);
  });
});

describe('resolveRemovedProductIds — undated contracts', () => {
  it('never strikes a candidate with no usable date', () => {
    const chain: ChainContractInput[] = [
      { contractId: MSA, termStartDate: undefined, productIds: [1] },
      { contractId: ADD3, termStartDate: dated('2023-01-01'), productIds: [5] },
    ];

    const removed = resolveRemovedProductIds([blanketEvent(ADD3)], chain);

    expect(removed.size).toBe(0);
  });

  it('strikes nothing when the declaring contract has no usable date', () => {
    // Without an ordering date there is no "prior" to resolve against, so the
    // safe answer is to strike nothing rather than the whole chain.
    const chain: ChainContractInput[] = [
      { contractId: MSA, termStartDate: dated('2020-01-01'), productIds: [1] },
      { contractId: ADD3, termStartDate: [], productIds: [5] },
    ];

    const removed = resolveRemovedProductIds([blanketEvent(ADD3)], chain);

    expect(removed.size).toBe(0);
  });
});

describe('resolveRemovedProductIds — status filtering', () => {
  it.each(['pending', 'rejected'])('ignores %s events', (status) => {
    const removed = resolveRemovedProductIds(
      [{ ...blanketEvent(ADD3), status }],
      berenbergChain(),
    );

    expect(removed.size).toBe(0);
  });

  it('applies events with no status field, which callers pre-filter', () => {
    const { status: _status, ...noStatus } = blanketEvent(ADD3);

    const removed = resolveRemovedProductIds([noStatus], berenbergChain());

    expect(removed.get(MSA)).toEqual(new Set([1, 2]));
  });

  it('applies only the confirmed events in a mixed batch', () => {
    const removed = resolveRemovedProductIds(
      [{ ...cancelEvent(ADD2, 1), status: 'pending' }, cancelEvent(ADD3, 2)],
      berenbergChain(),
    );

    expect(removed.get(MSA)).toEqual(new Set([2]));
  });
});

describe('resolveRemovedProductIds — multiple events', () => {
  it('unions the products struck by several events on one contract', () => {
    const removed = resolveRemovedProductIds(
      [cancelEvent(ADD3, 1), cancelEvent(ADD2, 2)],
      berenbergChain(),
    );

    expect(removed.get(MSA)).toEqual(new Set([1, 2]));
  });

  it('composes a blanket and a per-product event without losing either', () => {
    const removed = resolveRemovedProductIds(
      [blanketEvent(ADD2), cancelEvent(ADD3, 4)],
      berenbergChain(),
    );

    // ADD2's blanket strikes everything before it...
    expect(removed.get(MSA)).toEqual(new Set([1, 2]));
    expect(removed.get(ADD1)).toEqual(new Set([3]));
    // ...and ADD3 separately cancels ADD2's own product.
    expect(removed.get(ADD2)).toEqual(new Set([4]));
  });

  it('is order-independent', () => {
    const events = [blanketEvent(ADD2), cancelEvent(ADD3, 4)];

    const forward = resolveRemovedProductIds(events, berenbergChain());
    const reversed = resolveRemovedProductIds(
      [...events].reverse(),
      berenbergChain(),
    );

    expect(forward).toEqual(reversed);
  });
});

describe('resolveRemovedProductIds — empty and purity', () => {
  it('returns an empty map for no events', () => {
    expect(resolveRemovedProductIds([], berenbergChain()).size).toBe(0);
  });

  it('returns an empty map for an empty chain', () => {
    expect(resolveRemovedProductIds([blanketEvent(ADD3)], []).size).toBe(0);
  });

  it('omits contracts with nothing struck rather than mapping empty sets', () => {
    const removed = resolveRemovedProductIds(
      [blanketEvent(ADD1)],
      berenbergChain(),
    );

    expect([...removed.keys()]).toEqual([MSA]);
  });

  it('does not mutate its inputs', () => {
    const events = [blanketEvent(ADD3)];
    const chain = berenbergChain();
    const eventsSnapshot = JSON.stringify(events);
    const chainSnapshot = JSON.stringify(chain);

    resolveRemovedProductIds(events, chain);

    expect(JSON.stringify(events)).toBe(eventsSnapshot);
    expect(JSON.stringify(chain)).toBe(chainSnapshot);
  });

  it('does not alias a chain contract productIds array into the result', () => {
    // The blanket path strikes `candidate.productIds` wholesale; returning that
    // same array by reference would let a caller's mutation leak backwards.
    const chain = berenbergChain();
    const removed = resolveRemovedProductIds([blanketEvent(ADD3)], chain);

    removed.get(MSA)!.add(999);

    expect(chain[0].productIds).toEqual([1, 2]);
  });
});

describe('buildRemovedProductKeys', () => {
  const productsByYear = {
    '1': [
      { product_id: 5, vendor_products: { id: 5, name: 'Feed A' } },
      { product_id: 7, vendor_products: { id: 7, name: 'Feed B' } },
    ],
    '2': [{ product_id: 5, vendor_products: { id: 5, name: 'Feed A' } }],
  };

  it('expands each removed product across every year it appears in', () => {
    const keys = buildRemovedProductKeys(new Set([5]), productsByYear);

    expect(keys).toEqual(new Set(['5-1', '5-2']));
  });

  it('returns undefined when nothing is removed, so callers pass no comparisonData', () => {
    expect(buildRemovedProductKeys(new Set(), productsByYear)).toBeUndefined();
    expect(buildRemovedProductKeys(undefined, productsByYear)).toBeUndefined();
  });

  it('returns undefined when no removed id is present in the table', () => {
    expect(
      buildRemovedProductKeys(new Set([99]), productsByYear),
    ).toBeUndefined();
  });

  it('falls back to product_id when the vendor_products relation is missing', () => {
    const keys = buildRemovedProductKeys(new Set([7]), {
      '1': [{ product_id: 7 }],
    });

    expect(keys).toEqual(new Set(['7-1']));
  });

  it('tolerates malformed buckets and rows', () => {
    expect(
      buildRemovedProductKeys(new Set([5]), {
        '1': [null, { product_id: 'not-a-number' }],
      } as never),
    ).toBeUndefined();
    expect(buildRemovedProductKeys(new Set([5]), undefined)).toBeUndefined();
  });
});

describe('excludeRemovedProductsForYear', () => {
  const feedA = { product_id: 5, vendor_products: { id: 5, name: 'Feed A' } };
  const feedB = { product_id: 7, vendor_products: { id: 7, name: 'Feed B' } };

  it('drops cancelled products so their fees stay out of the year total', () => {
    const kept = excludeRemovedProductsForYear(
      [feedA, feedB],
      '1',
      new Set(['5-1']),
    );

    expect(kept).toEqual([feedB]);
  });

  it('only strikes the year the key names', () => {
    const kept = excludeRemovedProductsForYear(
      [feedA, feedB],
      '2',
      new Set(['5-1']),
    );

    expect(kept).toEqual([feedA, feedB]);
  });

  it('returns the rows untouched when nothing is removed', () => {
    expect(excludeRemovedProductsForYear([feedA], '1', undefined)).toEqual([
      feedA,
    ]);
    expect(excludeRemovedProductsForYear([feedA], '1', new Set())).toEqual([
      feedA,
    ]);
  });

  it('matches on the same keys buildRemovedProductKeys produces', () => {
    const productsByYear = { '1': [feedA, feedB], '2': [feedA] };
    const removed = buildRemovedProductKeys(new Set([5]), productsByYear);

    expect(
      excludeRemovedProductsForYear(productsByYear['1'], '1', removed),
    ).toEqual([feedB]);
    expect(
      excludeRemovedProductsForYear(productsByYear['2'], '2', removed),
    ).toEqual([]);
  });

  it('keeps rows without a numeric id — an unidentifiable row cannot be struck', () => {
    const malformed = { product_id: 'not-a-number' } as never;

    expect(
      excludeRemovedProductsForYear([malformed], '1', new Set(['5-1'])),
    ).toEqual([malformed]);
  });
});

describe('resolveRemovedProductEndDates', () => {
  it('records the declaring contract ordering date for each struck product', () => {
    const ends = resolveRemovedProductEndDates(
      [blanketEvent(ADD3)],
      berenbergChain(),
    );

    expect(ends.get(MSA)?.get(1)).toEqual(new Date('2023-01-01'));
    expect(ends.get(MSA)?.get(2)).toEqual(new Date('2023-01-01'));
    expect(ends.get(ADD1)?.get(3)).toEqual(new Date('2023-01-01'));
    expect(ends.get(ADD2)?.get(4)).toEqual(new Date('2023-01-01'));
    expect(ends.has(ADD3)).toBe(false);
  });

  it('keeps the earliest end date when multiple declarations strike the same product', () => {
    // Add 1 cancels product 1 in 2021; Add 3 blankets everything in 2023.
    // The product stopped being licensed in 2021 — accrual must not run to 2023.
    const ends = resolveRemovedProductEndDates(
      [cancelEvent(ADD1, 1), blanketEvent(ADD3)],
      berenbergChain(),
    );

    expect(ends.get(MSA)?.get(1)).toEqual(new Date('2021-01-01'));
    expect(ends.get(MSA)?.get(2)).toEqual(new Date('2023-01-01'));
  });

  it('is empty exactly when resolveRemovedProductIds is empty', () => {
    const pending: ProductLineageEventInput = {
      ...blanketEvent(ADD3),
      status: 'pending',
    };

    expect(
      resolveRemovedProductEndDates([pending], berenbergChain()).size,
    ).toBe(0);
    expect(resolveRemovedProductEndDates([], berenbergChain()).size).toBe(0);
    expect(resolveRemovedProductEndDates([blanketEvent(ADD3)], []).size).toBe(
      0,
    );
  });

  it('strikes the same contract/product pairs as resolveRemovedProductIds', () => {
    const events = [cancelEvent(ADD3, 1), blanketEvent(ADD2)];
    const chain = berenbergChain();

    const ids = resolveRemovedProductIds(events, chain);
    const ends = resolveRemovedProductEndDates(events, chain);

    expect([...ends.keys()].sort()).toEqual([...ids.keys()].sort());
    ids.forEach((productIds, contractId) => {
      expect(new Set(ends.get(contractId)?.keys())).toEqual(productIds);
    });
  });
});

describe('contractsToChainContracts', () => {
  it('projects raw contract rows onto the resolver input shape', () => {
    const chain = contractsToChainContracts([
      {
        id: 1,
        term_start_date: [{ date: '2020-01-01' }],
        vendor_products_details: [
          { product_id: 5, vendor_products: { id: 5 } },
          { product_id: null, vendor_products: { id: 6 } },
          { product_id: 'bad' },
          null,
        ],
      },
      { id: 2, term_start_date: null, vendor_products_details: null },
    ] as never);

    expect(chain).toEqual([
      {
        contractId: 1,
        termStartDate: [{ date: '2020-01-01' }],
        productIds: [5, 6],
      },
      { contractId: 2, termStartDate: null, productIds: [] },
    ]);
  });
});

describe('resolveRemovedProductIdsAcrossChains', () => {
  const edge = (parent: number, child: number) => ({
    parent_contract_id: parent,
    child_contract_id: child,
  });

  it('never lets a blanket declaration strike a different chain', () => {
    // Chain A: MSA(1, 2020) <- Add(2, 2023, blanket). Chain B: MSA(3, 2019).
    // Contract 3 predates the declaration but shares no chain with it.
    const chain: ChainContractInput[] = [
      { contractId: 1, termStartDate: dated('2020-01-01'), productIds: [10] },
      { contractId: 2, termStartDate: dated('2023-01-01'), productIds: [20] },
      { contractId: 3, termStartDate: dated('2019-01-01'), productIds: [30] },
    ];

    const removed = resolveRemovedProductIdsAcrossChains(
      [blanketEvent(2)],
      chain,
      [edge(1, 2)],
    );

    expect(removed.get(1)).toEqual(new Set([10]));
    expect(removed.has(3)).toBe(false);
  });

  it('keeps chain membership through relationship contracts absent from the input', () => {
    // 1 <- 99 <- 2, but 99 is not in chainContracts (e.g. filtered out).
    // 1 and 2 are still the same component via the edges alone.
    const chain: ChainContractInput[] = [
      { contractId: 1, termStartDate: dated('2020-01-01'), productIds: [10] },
      { contractId: 2, termStartDate: dated('2023-01-01'), productIds: [20] },
    ];

    const removed = resolveRemovedProductIdsAcrossChains(
      [blanketEvent(2)],
      chain,
      [edge(1, 99), edge(99, 2)],
    );

    expect(removed.get(1)).toEqual(new Set([10]));
  });

  it('matches single-chain resolution when everything is one component', () => {
    const edges = [edge(MSA, ADD1), edge(MSA, ADD2), edge(MSA, ADD3)];
    const events = [blanketEvent(ADD3), cancelEvent(ADD1, 1)];

    const single = resolveRemovedProductIds(events, berenbergChain());
    const partitioned = resolveRemovedProductIdsAcrossChains(
      events,
      berenbergChain(),
      edges,
    );

    expect(partitioned).toEqual(single);
  });

  it('resolves each component independently', () => {
    // Two chains, each with its own blanket declaration.
    const chain: ChainContractInput[] = [
      { contractId: 1, termStartDate: dated('2020-01-01'), productIds: [10] },
      { contractId: 2, termStartDate: dated('2023-01-01'), productIds: [20] },
      { contractId: 3, termStartDate: dated('2019-01-01'), productIds: [30] },
      { contractId: 4, termStartDate: dated('2022-01-01'), productIds: [40] },
    ];

    const removed = resolveRemovedProductIdsAcrossChains(
      [blanketEvent(2), blanketEvent(4)],
      chain,
      [edge(1, 2), edge(3, 4)],
    );

    expect(removed.get(1)).toEqual(new Set([10]));
    expect(removed.get(3)).toEqual(new Set([30]));
    expect(removed.size).toBe(2);
  });

  it('a standalone declaring contract strikes nothing', () => {
    const chain: ChainContractInput[] = [
      { contractId: 1, termStartDate: dated('2020-01-01'), productIds: [10] },
      { contractId: 2, termStartDate: dated('2023-01-01'), productIds: [20] },
    ];

    const removed = resolveRemovedProductIdsAcrossChains(
      [blanketEvent(2)],
      chain,
      [],
    );

    expect(removed.size).toBe(0);
  });
});

describe('resolveRemovedProductEndDatesAcrossChains', () => {
  it('carries cutoff dates within a chain and never across chains', () => {
    const chain: ChainContractInput[] = [
      { contractId: 1, termStartDate: dated('2020-01-01'), productIds: [10] },
      { contractId: 2, termStartDate: dated('2023-01-01'), productIds: [20] },
      { contractId: 3, termStartDate: dated('2019-01-01'), productIds: [30] },
    ];

    const ends = resolveRemovedProductEndDatesAcrossChains(
      [blanketEvent(2)],
      chain,
      [{ parent_contract_id: 1, child_contract_id: 2 }],
    );

    expect(ends.get(1)?.get(10)).toEqual(new Date('2023-01-01'));
    expect(ends.has(3)).toBe(false);
  });
});

describe('resolveRemovedProductEndDates — amended declaring start', () => {
  it('cuts accrual at the EFFECTIVE start while ordering by the original', () => {
    // The declaring addendum originally started 2023-01-01 but was amended to
    // 2023-06-01 (newest-first history). Chain ordering must keep the
    // original date (matches the sidebar); the accrual cutoff must use the
    // amended date — products stayed licensed until the addendum actually
    // took effect.
    const chain: ChainContractInput[] = [
      { contractId: MSA, termStartDate: dated('2020-01-01'), productIds: [1] },
      {
        contractId: ADD3,
        termStartDate: [{ date: '2023-06-01' }, { date: '2023-01-01' }],
        productIds: [5],
      },
    ];

    const ids = resolveRemovedProductIds([blanketEvent(ADD3)], chain);
    const ends = resolveRemovedProductEndDates([blanketEvent(ADD3)], chain);

    expect(ids.get(MSA)).toEqual(new Set([1]));
    expect(ends.get(MSA)?.get(1)).toEqual(new Date('2023-06-01'));
  });

  it('getEffectiveStartDate picks the latest date regardless of array order', () => {
    expect(
      getEffectiveStartDate([{ date: '2023-01-01' }, { date: '2023-06-01' }]),
    ).toEqual(new Date('2023-06-01'));
    expect(getEffectiveStartDate('2021-03-04')).toEqual(new Date('2021-03-04'));
    expect(getEffectiveStartDate([])).toBeNull();
    expect(getEffectiveStartDate([{ date: 'nope' }])).toBeNull();
  });
});

describe('cancelledProductNames', () => {
  it('joins the names of products with cutoffs, per contract', () => {
    const contracts = [
      {
        id: 1,
        vendor_products_details: [
          { product_id: 5, vendor_products: { id: 5, name: 'Feed A' } },
          { product_id: 5, vendor_products: { id: 5, name: 'Feed A' } },
          { product_id: 6, vendor_products: { id: 6, name: 'Feed B' } },
        ],
      },
      { id: 2, vendor_products_details: [] },
    ];
    const cutoffs = new Map([[1, new Map([[5, new Date('2023-01-01')]])]]);

    const names = cancelledProductNames(contracts as never, cutoffs);

    expect(names.get(1)).toBe('Feed A');
    expect(names.has(2)).toBe(false);
  });
});
