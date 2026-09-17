import {
  buildSpendByBusinessSponsor,
  buildSpendByBusinessGroup,
  transformToTopVendorsBySpend,
  transformToPriceChanges,
  summarizeRowDenomination,
  refilterParentRow,
} from '@/lib/v2/reports/monthly-report/transforms';
import {
  buildMonthlyValuesByContract,
  type MonthlyValues,
} from '@/lib/v2/reports/monthly-report/engine';
import { ContractWithPricing } from '@/lib/v2/core/types';
import type { RawContractOwnerRow } from '@/lib/v2/owners';
import type { RelationshipEdge } from '@/lib/v2/spend';

// The engine's legacy USD policy: fixtures carry pre-converted USD stamps.
const USD_POLICY = { mode: 'preconverted-usd' } as const;

const ASOF = new Date(2026, 6, 15);

function mv(currentMonth: number, nextMonth: number): MonthlyValues {
  return { currentMonth, nextMonth, change: nextMonth - currentMonth };
}

function values(
  entries: Array<[number, MonthlyValues]>,
): Map<number, MonthlyValues> {
  return new Map(entries);
}

interface UnitSpec {
  id: number;
  name: string;
  level: string;
  parent_id: number | null;
}

const unit = (
  id: number,
  name: string,
  level = 'business_group',
  parent_id: number | null = null,
): UnitSpec => ({ id, name, level, parent_id });

/** The contract_owners embed rows a saved Owner tab would leave behind. */
function ownerRows(
  sponsors: string[],
  groups: UnitSpec[],
): RawContractOwnerRow[] {
  let rowId = 0;
  const blank = {
    user_id: null,
    org_employee_id: null,
    label: null,
    org_unit_id: null,
    users: null,
    org_employees: null,
    org_units: null,
  };
  return [
    ...sponsors.map((label) => ({
      ...blank,
      id: ++rowId,
      role: 'sponsor',
      label,
    })),
    ...groups.map((group) => ({
      ...blank,
      id: ++rowId,
      role: 'group',
      org_unit_id: group.id,
      org_units: {
        name: group.name,
        level: group.level,
        parent_id: group.parent_id,
      },
    })),
  ];
}

interface FixtureOverrides {
  id: number;
  vendorName?: string;
  sponsors?: string[];
  groups?: UnitSpec[];
  willNotRenew?: boolean;
  termEnd?: string;
  tags?: string[];
  currency?: string;
}

function makeContract(over: FixtureOverrides): ContractWithPricing {
  return {
    id: over.id,
    vendor_id: over.id * 10,
    vendor_name: over.vendorName ?? `Vendor ${over.id}`,
    vendor_domain: undefined,
    contract: {
      id: over.id,
      currency: over.currency ?? 'USD',
      contract_owners: ownerRows(over.sponsors ?? [], over.groups ?? []),
      contract_tags: (over.tags ?? []).map((name) => ({
        user_tags: { name },
      })),
      vendor_products_details: [
        {
          id: over.id * 1000,
          product_id: over.id * 100,
          contract_id: over.id,
          year: 1,
          fees: 1200,
          vendor_products: { id: over.id * 100, name: `Product ${over.id}` },
        },
      ],
      will_not_renew: over.willNotRenew ?? false,
      term_end_date: over.termEnd ? [{ date: over.termEnd }] : null,
    },
    products: [
      {
        product_id: over.id * 100,
        name: `Product ${over.id}`,
        isSuperseded: false,
        isSuperseding: false,
        sourceContractId: over.id,
        year: 1,
        fees: 1200,
        currentFee: 1200,
        currentFeeUSD: 1200,
        effectiveFeeUSD: 1200,
        currency: 'USD',
      },
    ],
    priceHistory: { billingFrequency: 'Quarterly' },
    isLinkedChildInvoice: false,
  } as unknown as ContractWithPricing;
}

describe('buildSpendByBusinessSponsor', () => {
  it('groups contracts by sponsor and totals their values', () => {
    const contracts = [
      makeContract({ id: 1, sponsors: ['Alice'] }),
      makeContract({ id: 2, sponsors: ['Alice'] }),
    ];
    const result = buildSpendByBusinessSponsor(
      contracts,
      values([
        [1, mv(100, 110)],
        [2, mv(200, 220)],
      ]),
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
    expect(result[0].currentMonth).toBe(300);
    expect(result[0].nextMonth).toBe(330);
    expect(result[0].change).toBeCloseTo(30, 10);
    expect(result[0].subRows).toHaveLength(2);
    expect(result[0].vendors).toBe(2);
  });

  it('splits multi-sponsor contracts cents-preservingly', () => {
    const contracts = [makeContract({ id: 1, sponsors: ['Alice', 'Bob'] })];
    const result = buildSpendByBusinessSponsor(
      contracts,
      values([[1, mv(100.01, 200.01)]]),
    );

    const alice = result.find((s) => s.name === 'Alice');
    const bob = result.find((s) => s.name === 'Bob');
    expect(alice?.currentMonth).toBe(50.01);
    expect(bob?.currentMonth).toBe(50);
    const cents = (n: number) => Math.round(n * 100);
    expect(cents(alice!.currentMonth) + cents(bob!.currentMonth)).toBe(10001);
    expect(cents(alice!.nextMonth) + cents(bob!.nextMonth)).toBe(20001);
    expect(alice?.subRows[0].isSplit).toBe(true);
    expect(alice?.subRows[0].sponsorCount).toBe(2);
    expect(alice?.subRows[0].businessSponsors).toEqual(['Alice', 'Bob']);
  });

  it("maps the engine's 'unassigned' key to the display label", () => {
    const contracts = [makeContract({ id: 1, sponsors: [] })];
    const result = buildSpendByBusinessSponsor(
      contracts,
      values([[1, mv(50, 50)]]),
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Unassigned');
  });

  it('skips zero-value contracts and drops empty sponsors', () => {
    const contracts = [
      makeContract({ id: 1, sponsors: ['Alice'] }),
      makeContract({ id: 2, sponsors: ['Zero Only'] }),
      makeContract({ id: 3, sponsors: ['Alice'] }),
    ];
    const result = buildSpendByBusinessSponsor(
      contracts,
      values([
        [1, mv(100, 100)],
        [2, mv(0, 0)],
      ]),
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
    // contract 3 has no engine values at all -> treated as zero, skipped
    expect(result[0].subRows).toHaveLength(1);
  });

  it('sorts sponsors by current month descending, then name', () => {
    const contracts = [
      makeContract({ id: 1, sponsors: ['Small'] }),
      makeContract({ id: 2, sponsors: ['Big'] }),
      makeContract({ id: 3, sponsors: ['Also Small'] }),
    ];
    const result = buildSpendByBusinessSponsor(
      contracts,
      values([
        [1, mv(10, 10)],
        [2, mv(500, 500)],
        [3, mv(10, 10)],
      ]),
    );

    expect(result.map((s) => s.name)).toEqual(['Big', 'Also Small', 'Small']);
  });

  it('carries display metadata onto subRows', () => {
    const contracts = [
      makeContract({ id: 1, sponsors: ['Alice'], tags: ['critical'] }),
    ];
    const result = buildSpendByBusinessSponsor(
      contracts,
      values([[1, mv(100, 100)]]),
    );

    const row = result[0].subRows[0];
    expect(row.vendor).toBe('Vendor 1');
    expect(row.product).toBe('Product 1');
    expect(row.tags).toEqual(['critical']);
    expect(row.billingFrequency).toBe('Quarterly');
    expect(row.contractId).toBe(1);
  });
});

const TRADING = unit(1, 'Trading');
const RESEARCH = unit(2, 'Research');
const EQUITY_SALES = unit(3, 'Equity Sales', 'department', 1);

const edge = (parentId: number, childId: number): RelationshipEdge => ({
  parent_contract_id: parentId,
  child_contract_id: childId,
  relationship_type: null,
});

describe('buildSpendByBusinessGroup', () => {
  it("keys rows by the owner group's own name, at whatever level it sits", () => {
    const contracts = [makeContract({ id: 1, groups: [EQUITY_SALES] })];
    const result = buildSpendByBusinessGroup(
      contracts,
      values([[1, mv(100, 100)]]),
      [],
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Equity Sales');
    expect(result[0].currentMonth).toBe(100);
  });

  it('splits a two-group contract evenly, cents preserved, with group metadata', () => {
    const contracts = [makeContract({ id: 1, groups: [TRADING, RESEARCH] })];
    const result = buildSpendByBusinessGroup(
      contracts,
      values([[1, mv(100.01, 200.01)]]),
      [],
    );

    const trading = result.find((g) => g.name === 'Trading')!;
    const research = result.find((g) => g.name === 'Research')!;
    expect(trading.currentMonth).toBe(50.01);
    expect(research.currentMonth).toBe(50);
    const cents = (n: number) => Math.round(n * 100);
    expect(cents(trading.currentMonth) + cents(research.currentMonth)).toBe(
      10001,
    );
    expect(cents(trading.nextMonth) + cents(research.nextMonth)).toBe(20001);
    expect(trading.subRows[0].isSplit).toBe(true);
    expect(trading.subRows[0].groupCount).toBe(2);
    expect(trading.subRows[0].businessGroups).toEqual(['Trading', 'Research']);
  });

  it("routes a contract with no owner group anywhere above it to 'Unassigned'", () => {
    const contracts = [makeContract({ id: 1 })];
    const result = buildSpendByBusinessGroup(
      contracts,
      values([[1, mv(100, 100)]]),
      [],
    );

    expect(result[0].name).toBe('Unassigned');
  });

  it("attributes an ownerless child invoice to its parent's groups", () => {
    const contracts = [
      makeContract({ id: 1, groups: [TRADING] }),
      makeContract({ id: 2 }),
    ];
    const result = buildSpendByBusinessGroup(
      contracts,
      values([
        [1, mv(100, 100)],
        [2, mv(40, 40)],
      ]),
      [edge(1, 2)],
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Trading');
    expect(result[0].currentMonth).toBe(140);
    expect(result[0].subRows.map((r) => r.contractId)).toEqual([1, 2]);
  });

  it('walks past an unowned parent to an owned grandparent', () => {
    const contracts = [
      makeContract({ id: 1, groups: [RESEARCH] }),
      makeContract({ id: 2 }),
      makeContract({ id: 3 }),
    ];
    const result = buildSpendByBusinessGroup(
      contracts,
      values([
        [1, mv(100, 100)],
        [2, mv(0, 0)],
        [3, mv(25, 25)],
      ]),
      [edge(1, 2), edge(2, 3)],
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Research');
    expect(result[0].currentMonth).toBe(125);
  });

  it("keeps a child's own groups instead of inheriting its parent's", () => {
    const contracts = [
      makeContract({ id: 1, groups: [TRADING] }),
      makeContract({ id: 2, groups: [RESEARCH] }),
    ];
    const result = buildSpendByBusinessGroup(
      contracts,
      values([
        [1, mv(100, 100)],
        [2, mv(40, 40)],
      ]),
      [edge(1, 2)],
    );

    expect(result.map((g) => [g.name, g.currentMonth])).toEqual([
      ['Trading', 100],
      ['Research', 40],
    ]);
  });

  it('tells two same-named groups apart by the parent path', () => {
    const emea = unit(10, 'EMEA', 'entity');
    const americas = unit(11, 'Americas', 'entity');
    const emeaSales = unit(12, 'Sales', 'business_group', 10);
    const americasSales = unit(13, 'Sales', 'business_group', 11);
    const contracts = [
      makeContract({ id: 1, groups: [emea, emeaSales] }),
      makeContract({ id: 2, groups: [americas, americasSales] }),
    ];
    const result = buildSpendByBusinessGroup(
      contracts,
      values([
        [1, mv(100, 100)],
        [2, mv(60, 60)],
      ]),
      [],
    );

    expect(result.map((g) => g.name).sort()).toEqual([
      'Americas',
      'EMEA',
      'Sales (Americas)',
      'Sales (EMEA)',
    ]);
  });
});

describe('buildSpendByBusinessSponsor inheritance', () => {
  it('does not inherit: an ownerless child stays Unassigned under a sponsored parent', () => {
    const contracts = [
      makeContract({ id: 1, sponsors: ['Alice'] }),
      makeContract({ id: 2 }),
    ];
    const result = buildSpendByBusinessSponsor(
      contracts,
      values([
        [1, mv(100, 100)],
        [2, mv(40, 40)],
      ]),
    );

    expect(result.map((s) => [s.name, s.currentMonth])).toEqual([
      ['Alice', 100],
      ['Unassigned', 40],
    ]);
  });
});

describe('transformToTopVendorsBySpend', () => {
  it('sums current-month spend per vendor and sorts descending', () => {
    const contracts = [
      makeContract({ id: 1, vendorName: 'Acme' }),
      makeContract({ id: 2, vendorName: 'Acme' }),
      makeContract({ id: 3, vendorName: 'Globex' }),
    ];
    const result = transformToTopVendorsBySpend(
      contracts,
      values([
        [1, mv(100, 100)],
        [2, mv(50, 50)],
        [3, mv(400, 400)],
      ]),
    );

    expect(result).toEqual([
      { name: 'Globex', spend: 400 },
      { name: 'Acme', spend: 150 },
    ]);
  });

  it('limits to the top 10 vendors', () => {
    const contracts = Array.from({ length: 12 }, (_, i) =>
      makeContract({ id: i + 1, vendorName: `Vendor ${i + 1}` }),
    );
    const result = transformToTopVendorsBySpend(
      contracts,
      new Map(contracts.map((c, i) => [c.id, mv(i + 1, i + 1)])),
    );

    expect(result).toHaveLength(10);
    expect(result[0].spend).toBe(12);
  });
});

describe('sponsor/group tree denomination (psk-1796)', () => {
  it('keeps child rows in source currency and flips the parent when they agree', () => {
    // Both children USD under a EUR base: nothing about this group ever left
    // USD, so translating it into EUR would only add rate noise.
    const contracts = [
      makeContract({ id: 1, sponsors: ['Alice'], currency: 'USD' }),
      makeContract({ id: 2, sponsors: ['Alice'], currency: 'USD' }),
    ];

    const [row] = buildSpendByBusinessSponsor(
      contracts,
      // Base (EUR).
      values([
        [1, mv(92, 101.2)],
        [2, mv(184, 202.4)],
      ]),
      {
        // Native (USD).
        nativeValues: values([
          [1, mv(100, 110)],
          [2, mv(200, 220)],
        ]),
        baseCurrency: 'EUR',
      },
    );

    expect(row.subRows.map((r) => r.currency)).toEqual(['USD', 'USD']);
    expect(row.subRows[0].displayCurrentMonth).toBe(100);
    expect(row.subRows[1].displayCurrentMonth).toBe(200);

    // Parent reports in the shared currency...
    expect(row.currency).toBe('USD');
    expect(row.displayCurrentMonth).toBe(300);
    expect(row.displayNextMonth).toBe(330);

    // ...while the fields the tiles sum and the table sorts on stay base.
    expect(row.currentMonth).toBe(276);
    expect(row.nextMonth).toBeCloseTo(303.6, 10);
  });

  it('falls back to base on the parent when children disagree', () => {
    const contracts = [
      makeContract({ id: 1, sponsors: ['Alice'], currency: 'USD' }),
      makeContract({ id: 2, sponsors: ['Alice'], currency: 'GBP' }),
    ];

    const [row] = buildSpendByBusinessSponsor(
      contracts,
      values([
        [1, mv(92, 101.2)],
        [2, mv(120, 132)],
      ]),
      {
        nativeValues: values([
          [1, mv(100, 110)],
          [2, mv(105, 115.5)],
        ]),
        baseCurrency: 'EUR',
      },
    );

    // Children still each read in their own currency.
    expect(row.subRows.map((r) => r.currency)).toEqual(['USD', 'GBP']);
    expect(row.subRows[1].displayCurrentMonth).toBe(105);

    // A sum across two denominations only means anything translated.
    expect(row.currency).toBe('EUR');
    expect(row.displayCurrentMonth).toBe(212);
    expect(row.displayCurrentMonth).toBe(row.currentMonth);
  });

  it('splits a shared contract cents-preservingly in both denominations', () => {
    // One USD contract split across two sponsors, odd cent in BOTH
    // denominations: splitEvenly gives the extra cent to the first key by
    // index, so the same sponsor absorbs it in base and native alike.
    const contracts = [
      makeContract({ id: 1, sponsors: ['Alice', 'Bob'], currency: 'USD' }),
    ];

    const rows = buildSpendByBusinessSponsor(
      contracts,
      values([[1, mv(92.01, 92.01)]]),
      { nativeValues: values([[1, mv(100.01, 100.01)]]), baseCurrency: 'EUR' },
    );

    const alice = rows.find((r) => r.name === 'Alice')!;
    const bob = rows.find((r) => r.name === 'Bob')!;

    // Base: 92.01 -> 46.01 + 46.00, native: 100.01 -> 50.01 + 50.00 — the
    // odd cent lands on the same sponsor in both.
    expect(alice.currentMonth).toBe(46.01);
    expect(bob.currentMonth).toBe(46);
    expect(alice.subRows[0].displayCurrentMonth).toBe(50.01);
    expect(bob.subRows[0].displayCurrentMonth).toBe(50);

    // Each denomination reassembles exactly (compared in cents, so the
    // assertion's own float addition cannot fail the test).
    const cents = (n: number) => Math.round(n * 100);
    expect(cents(alice.currentMonth) + cents(bob.currentMonth)).toBe(9201);
    expect(
      cents(alice.subRows[0].displayCurrentMonth) +
        cents(bob.subRows[0].displayCurrentMonth),
    ).toBe(10001);
  });

  it('treats a group already in the base currency as its own common currency', () => {
    const contracts = [
      makeContract({ id: 1, sponsors: ['Bob'], currency: 'EUR' }),
    ];

    // A base-denominated contract never enters the native map.
    const [row] = buildSpendByBusinessSponsor(
      contracts,
      values([[1, mv(100, 150)]]),
      { nativeValues: values([]), baseCurrency: 'EUR' },
    );

    expect(row.currency).toBe('EUR');
    expect(row.subRows[0].currency).toBe('EUR');
    expect(row.displayCurrentMonth).toBe(100);
    expect(row.subRows[0].displayCurrentMonth).toBe(100);
  });
});

describe('summarizeRowDenomination', () => {
  const child = (currency: string, base: number, native: number) => ({
    currency,
    currentMonth: base,
    nextMonth: base,
    displayCurrentMonth: native,
    displayNextMonth: native,
    displayChange: 0,
  });

  it('re-derives a parent that filtering left single-currency', () => {
    // The unfiltered group was mixed and read in EUR; with only the USD child
    // left it must read in USD, not carry the stale EUR figure over.
    const result = summarizeRowDenomination([child('USD', 92, 100)], 'EUR');

    expect(result.currency).toBe('USD');
    expect(result.displayCurrentMonth).toBe(100);
  });

  it('stays in base while the remaining children still disagree', () => {
    const result = summarizeRowDenomination(
      [child('USD', 92, 100), child('GBP', 120, 105)],
      'EUR',
    );

    expect(result.currency).toBe('EUR');
    expect(result.displayCurrentMonth).toBe(212);
  });

  it('returns the base currency and zero amounts for no children', () => {
    // The tag filter empties a parent before dropping it; the helper is
    // called on that empty set, so the boundary is reachable, not academic.
    expect(summarizeRowDenomination([], 'EUR')).toEqual({
      currency: 'EUR',
      displayCurrentMonth: 0,
      displayNextMonth: 0,
      displayChange: 0,
    });
  });
});

describe('refilterParentRow', () => {
  const parent = {
    id: 1,
    name: 'Alice',
    vendors: 2,
    currentMonth: 300,
    nextMonth: 300,
    change: 0,
    currency: 'EUR',
    displayCurrentMonth: 300,
    displayNextMonth: 300,
    displayChange: 0,
    subRows: [
      {
        id: '1-1',
        contractId: 1,
        name: 'Acme',
        vendor: 'Acme',
        product: 'Feed A',
        currentMonth: 100,
        nextMonth: 100,
        change: 0,
        currency: 'USD',
        displayCurrentMonth: 109,
        displayNextMonth: 109,
        displayChange: 0,
        tags: ['finance'],
        supersededProducts: [],
        currentYearProducts: [],
      },
      {
        id: '1-2',
        contractId: 2,
        name: 'Acme',
        vendor: 'Acme',
        product: 'Feed B',
        currentMonth: 100,
        nextMonth: 100,
        change: 0,
        currency: 'USD',
        displayCurrentMonth: 109,
        displayNextMonth: 109,
        displayChange: 0,
        tags: ['finance'],
        supersededProducts: [],
        currentYearProducts: [],
      },
      {
        id: '1-3',
        contractId: 3,
        name: 'Globex',
        vendor: 'Globex',
        product: 'Terminal',
        currentMonth: 100,
        nextMonth: 100,
        change: 0,
        currency: 'GBP',
        displayCurrentMonth: 85,
        displayNextMonth: 85,
        displayChange: 0,
        tags: ['research'],
        supersededProducts: [],
        currentYearProducts: [],
      },
    ],
  };

  it('counts distinct vendors, not surviving rows', () => {
    // Two 'finance' contracts share one vendor: the filtered parent reports
    // 1 vendor, matching the builder's validVendorIds semantics.
    const filtered = refilterParentRow(parent, 'finance', 'EUR');

    expect(filtered.subRows).toHaveLength(2);
    expect(filtered.vendors).toBe(1);
  });

  it('re-derives the denomination from the surviving children', () => {
    // The unfiltered parent was mixed (USD+GBP) and read in EUR; filtering to
    // 'finance' leaves only USD children, so the parent flips to USD while
    // the base totals stay base.
    const filtered = refilterParentRow(parent, 'finance', 'EUR');

    expect(filtered.currency).toBe('USD');
    expect(filtered.displayCurrentMonth).toBe(218);
    expect(filtered.currentMonth).toBe(200);
  });
});

describe('transformToPriceChanges', () => {
  it('includes only contracts with a change and a non-zero current month', () => {
    const contracts = [
      makeContract({ id: 1 }),
      makeContract({ id: 2 }),
      makeContract({ id: 3 }),
    ];
    const result = transformToPriceChanges(
      contracts,
      values([
        [1, mv(100, 150)],
        [2, mv(100, 100)],
        [3, mv(0, 100)],
      ]),
      ASOF,
    );

    expect(result).toHaveLength(1);
    expect(result[0].contractId).toBe(1);
    expect(result[0].previousPrice).toBe(100);
    expect(result[0].newPrice).toBe(150);
    expect(result[0].reasonForChange).toBe('Price increase');
  });

  // PSK-1796: base figures convert each month at that month's average rate, so
  // subtracting them turns FX drift into a phantom "Price increase" the vendor
  // never made. Selection reads the contract's own currency instead.
  it('excludes a flat foreign contract whose base figures only moved on FX', () => {
    const contracts = [makeContract({ id: 1, currency: 'USD' })];

    const result = transformToPriceChanges(
      contracts,
      // Base (EUR): 1000 → 1020 purely because the rate moved.
      values([[1, mv(1000, 1020)]]),
      ASOF,
      // Native (USD): the fee never changed.
      values([[1, mv(1000, 1000)]]),
    );

    expect(result).toEqual([]);
  });

  it('reports a real foreign change in source currency, with a base figure for the summary', () => {
    const contracts = [makeContract({ id: 1, currency: 'USD' })];

    const result = transformToPriceChanges(
      contracts,
      values([[1, mv(920, 1058)]]),
      ASOF,
      values([[1, mv(1000, 1150)]]),
    );

    expect(result).toHaveLength(1);
    // Row amounts are the contract's own currency, unconverted.
    expect(result[0].previousPrice).toBe(1000);
    expect(result[0].newPrice).toBe(1150);
    expect(result[0].change).toBe(150);
    expect(result[0].currency).toBe('USD');
    // The one cross-row figure stays base.
    expect(result[0].changeBase).toBeCloseTo(138, 10);
  });

  it('falls back to the base values for a contract already in the base currency', () => {
    // A base-denominated contract is absent from the native map entirely,
    // because `mode: 'base'` already left its amounts untouched.
    const contracts = [makeContract({ id: 1, currency: 'EUR' })];

    const result = transformToPriceChanges(
      contracts,
      values([[1, mv(100, 150)]]),
      ASOF,
      values([]),
    );

    expect(result).toHaveLength(1);
    expect(result[0].previousPrice).toBe(100);
    expect(result[0].change).toBe(50);
    expect(result[0].currency).toBe('EUR');
    expect(result[0].changeBase).toBe(50);
  });

  it('sorts by absolute change descending', () => {
    const contracts = [makeContract({ id: 1 }), makeContract({ id: 2 })];
    const result = transformToPriceChanges(
      contracts,
      values([
        [1, mv(100, 110)],
        [2, mv(100, 50)],
      ]),
      ASOF,
    );

    expect(result.map((c) => c.contractId)).toEqual([2, 1]);
    expect(result[1].reasonForChange).toBe('Price increase');
    expect(result[0].reasonForChange).toBe('Price decrease');
  });

  it('orders mixed-currency rows on the base change, not the native one', () => {
    // The JPY row's native change (+1500¥) dwarfs the USD row's (+150$) as a
    // raw number, but translated it is the smaller movement (~€9 vs ~€138).
    // Rows display native, so ranking must use the one comparable figure.
    const contracts = [
      makeContract({ id: 1, currency: 'JPY' }),
      makeContract({ id: 2, currency: 'USD' }),
    ];

    const result = transformToPriceChanges(
      contracts,
      // Base (EUR).
      values([
        [1, mv(600, 609)],
        [2, mv(920, 1058)],
      ]),
      ASOF,
      // Native.
      values([
        [1, mv(100000, 101500)],
        [2, mv(1000, 1150)],
      ]),
    );

    expect(result.map((c) => c.contractId)).toEqual([2, 1]);
    // Each row still reports its own native figures.
    expect(result[0].change).toBe(150);
    expect(result[1].change).toBe(1500);
  });

  it('flags will-not-renew contracts ending in the asOf month', () => {
    const contracts = [
      makeContract({ id: 1, willNotRenew: true, termEnd: '2026-07-31' }),
    ];
    const result = transformToPriceChanges(
      contracts,
      values([[1, mv(100, 0)]]),
      ASOF,
    );

    expect(result[0].reasonForChange).toBe('Contract will not renew');
  });

  it('anchors the will-not-renew check on asOf, not the wall clock', () => {
    const contracts = [
      makeContract({ id: 1, willNotRenew: true, termEnd: '2026-07-31' }),
    ];
    const result = transformToPriceChanges(
      contracts,
      values([[1, mv(100, 0)]]),
      new Date(2026, 2, 15),
    );

    // From March, a July end date is neither current nor next month.
    expect(result[0].reasonForChange).toBe('Price decrease');
  });
});

describe('buildMonthlyValuesByContract', () => {
  function makeRawEnriched(spec: {
    id: number;
    termStart: string;
    termEnd: string;
    fees: number;
    billingFrequency: string;
  }): ContractWithPricing {
    return {
      id: spec.id,
      vendor_id: spec.id * 10,
      vendor_name: `Vendor ${spec.id}`,
      contract: {
        id: spec.id,
        vendor_id: spec.id * 10,
        type_id: 2,
        status: 'active',
        currency: 'usd',
        annual_increase: null,
        annual_increase_months: null,
        subscription_term: 12,
        renewal_period: null,
        renewal_type: 'Auto',
        billing_frequency: spec.billingFrequency,
        will_not_renew: false,
        term_start_date: [{ date: spec.termStart }],
        term_end_date: [{ date: spec.termEnd }],
        cancel_date: [],
        business_sponsor: [],
        contract_tags: [],
        vendor_products_details: [
          {
            id: spec.id * 1000,
            product_id: spec.id * 100,
            contract_id: spec.id,
            year: 1,
            fees: spec.fees,
            vendor_products: { id: spec.id * 100, name: `P${spec.id}` },
          },
        ],
      },
      products: [],
      priceHistory: undefined,
      isLinkedChildInvoice: false,
    } as unknown as ContractWithPricing;
  }

  const fixture = makeRawEnriched({
    id: 1,
    termStart: '2026-01-01',
    termEnd: '2026-12-31',
    fees: 12000,
    billingFrequency: 'Quarterly',
  });

  it('returns both bases over the current->next month window', () => {
    const result = buildMonthlyValuesByContract(
      [fixture],
      [],
      { startMonth: 1 },
      ASOF,
      { currency: USD_POLICY },
    );

    expect(result.currentMonthKey).toBe('2026-07');
    expect(result.nextMonthKey).toBe('2026-08');
    // Amortized: 12000 over 12 months = 1000/month.
    expect(result.amortized.get(1)).toEqual(mv(1000, 1000));
    // Actual: quarterly billing from Jan 1 -> Jul bills 3000, Aug nothing.
    expect(result.actual.get(1)).toEqual(mv(3000, 0));
    // Legacy policy carries no stamps, so the native maps mirror the base
    // ones — "no conversion happened" and every value is already native.
    expect(result.amortizedNative.get(1)).toEqual(result.amortized.get(1));
    expect(result.actualNative.get(1)).toEqual(result.actual.get(1));
  });

  it('reads native months off the engine stamps in one pass (psk-1796)', () => {
    // A USD contract under a EUR base at a flat 0.9 monthly rate: the base
    // maps convert, the native maps carry the recorded amounts — from the
    // SAME query, not a second native-mode pass.
    const rates = { monthRate: () => 0.9, dateRate: () => 0.8 };
    const result = buildMonthlyValuesByContract(
      [fixture],
      [],
      { startMonth: 1 },
      ASOF,
      { currency: { mode: 'base', target: 'eur', rates } },
    );

    expect(result.amortized.get(1)).toEqual(mv(900, 900));
    expect(result.amortizedNative.get(1)).toEqual(mv(1000, 1000));
    expect(result.actual.get(1)).toEqual(mv(2700, 0));
    expect(result.actualNative.get(1)).toEqual(mv(3000, 0));
  });

  it('is a pure function of asOf, not the wall clock', () => {
    jest.useFakeTimers({ now: new Date(2027, 3, 1) });
    const late = buildMonthlyValuesByContract(
      [fixture],
      [],
      { startMonth: 1 },
      ASOF,
      { currency: USD_POLICY },
    );
    jest.setSystemTime(new Date(2025, 0, 1));
    const early = buildMonthlyValuesByContract(
      [fixture],
      [],
      { startMonth: 1 },
      ASOF,
      { currency: USD_POLICY },
    );
    jest.useRealTimers();

    expect(early.amortized).toEqual(late.amortized);
    expect(early.actual).toEqual(late.actual);
    expect(early.currentMonthKey).toBe(late.currentMonthKey);
  });

  // The month's window anchors at its FY start, exactly like the budget
  // chart's, so the two surfaces give one answer per month (QA 2026-08-05,
  // contract 3120). Invoices without a recorded end now book single-month
  // (product decision 2026-08-05), so the smear these tests originally used
  // comes from an explicit billing period instead.
  function makeInvoice(spec: {
    id: number;
    executed: string;
    fees: number;
    termEnd?: string;
  }): ContractWithPricing {
    return {
      id: spec.id,
      vendor_id: spec.id * 10,
      vendor_name: `Vendor ${spec.id}`,
      contract: {
        id: spec.id,
        vendor_id: spec.id * 10,
        type_id: 6,
        status: 'active',
        currency: 'usd',
        execution_date: spec.executed,
        annual_increase: null,
        annual_increase_months: null,
        subscription_term: null,
        renewal_period: null,
        renewal_type: null,
        billing_frequency: '',
        will_not_renew: false,
        term_start_date: [{ date: spec.executed }],
        term_end_date: spec.termEnd ? [{ date: spec.termEnd }] : [],
        cancel_date: [],
        business_sponsor: [],
        contract_tags: [],
        vendor_products_details: [
          {
            id: spec.id * 1000,
            product_id: spec.id * 100,
            contract_id: spec.id,
            year: 1,
            fees: spec.fees,
            vendor_products: { id: spec.id * 100, name: `P${spec.id}` },
          },
        ],
      },
      products: [],
      priceHistory: undefined,
      isLinkedChildInvoice: false,
    } as unknown as ContractWithPricing;
  }

  it("keeps an earlier-FY invoice's amortized share, matching the chart", () => {
    // A recorded 12-month billing period from March: ~322/12 a month through
    // the current and next month, exactly as the FY-anchored chart shows it.
    const invoice = makeInvoice({
      id: 9,
      executed: '2026-03-11',
      termEnd: '2027-03-10',
      fees: 322,
    });
    const result = buildMonthlyValuesByContract(
      [invoice],
      [],
      { startMonth: 1 },
      ASOF,
      { currency: USD_POLICY },
    );

    expect(result.amortized.get(9)?.currentMonth).toBeCloseTo(322 / 12, 1);
    expect(result.amortized.get(9)?.nextMonth).toBeCloseTo(322 / 12, 1);
  });

  it('books a no-end-date invoice fully in its start month (2026-08-05)', () => {
    // Contract 3120's shape: no recorded end, no term. The full amount lands
    // in the invoice month; later months carry nothing — no 12-month smear.
    const invoice = makeInvoice({ id: 9, executed: '2026-11-10', fees: 322 });
    const inMonth = buildMonthlyValuesByContract(
      [invoice],
      [],
      { startMonth: 1 },
      new Date(2026, 10, 15),
      { currency: USD_POLICY },
    );
    expect(inMonth.currentMonthKey).toBe('2026-11');
    expect(inMonth.amortized.get(9)?.currentMonth).toBeCloseTo(322, 2);
    expect(inMonth.amortized.get(9)?.nextMonth).toBe(0);

    const after = buildMonthlyValuesByContract(
      [invoice],
      [],
      { startMonth: 1 },
      new Date(2026, 11, 15),
      { currency: USD_POLICY },
    );
    expect(after.amortized.get(9)).toBeUndefined();
  });

  it('lineageSource lets an excluded family member shape a kept contract', () => {
    // The service queries only the chart's kept set but builds lineage over
    // the full enriched set (QA: monthly report must not diverge from the
    // chart). Here the parent is outside the query set — a zero-fee row the
    // budget filter drops — yet still donates its 6-month term: the child
    // runs 6-month cycles at the recorded annual price (2000/month) instead
    // of the 12-month default's 1000/month.
    const child = {
      id: 91,
      vendor_id: 910,
      vendor_name: 'Vendor 91',
      contract: {
        id: 91,
        vendor_id: 910,
        type_id: 2,
        status: 'active',
        currency: 'usd',
        annual_increase: null,
        annual_increase_months: null,
        subscription_term: null,
        renewal_period: null,
        renewal_type: 'Auto',
        billing_frequency: 'Annually',
        will_not_renew: false,
        term_start_date: [{ date: '2026-01-01' }],
        term_end_date: [],
        cancel_date: [],
        business_sponsor: [],
        contract_tags: [],
        vendor_products_details: [
          {
            id: 9100,
            product_id: 9101,
            contract_id: 91,
            year: 1,
            fees: 12000,
            vendor_products: { id: 9101, name: 'P91' },
          },
        ],
      },
      products: [],
      priceHistory: undefined,
      isLinkedChildInvoice: false,
    } as unknown as ContractWithPricing;
    const parent = {
      id: 90,
      vendor_id: 910,
      vendor_name: 'Vendor 91',
      contract: {
        id: 90,
        vendor_id: 910,
        type_id: 1,
        status: 'active',
        subscription_term: 6,
        term_start_date: [{ date: '2024-01-01' }],
        term_end_date: [],
        vendor_products_details: [],
      },
      products: [],
      priceHistory: undefined,
      isLinkedChildInvoice: false,
    } as unknown as ContractWithPricing;
    const rels = [{ parent_contract_id: 90, child_contract_id: 91 }];

    const withLineage = buildMonthlyValuesByContract(
      [child],
      rels,
      { startMonth: 1 },
      ASOF,
      { currency: USD_POLICY, lineageSource: [parent, child] },
    );
    // 12000 per inherited 6-month cycle = 2000/month.
    expect(withLineage.amortized.get(91)?.currentMonth).toBe(2000);

    const withoutParent = buildMonthlyValuesByContract(
      [child],
      rels,
      { startMonth: 1 },
      ASOF,
      { currency: USD_POLICY },
    );
    // Parent absent from the lineage set: the 12-month default applies.
    expect(withoutParent.amortized.get(91)?.currentMonth).toBe(1000);
  });
});
