import type { ContractWithPricing } from '@/lib/v2/core/types';
import {
  allocationShares,
  querySpend,
  EMPTY_LINEAGE,
  type SpendContractInput,
  type SpendLineItem,
  type SpendQuery,
} from '@/lib/v2/spend';
import { buildSpendByShares } from '@/lib/v2/reports/monthly-report/transforms';
import type { MonthlyValues } from '@/lib/v2/reports/monthly-report/engine';
import {
  allocationsFromLegacyFixture,
  type LegacyRawContract,
} from './allocation-harness';

/**
 * The backfill equality gates (docs/cost-allocation-design.md §Backfill): the
 * ACL backfill — replayed here through its shared TS mirror
 * (deriveLegacyGroupBackfill, via allocationsFromLegacyFixture) — must
 * reproduce the legacy spend-by-business-group output exactly, before the
 * legacy path is deleted.
 *
 * The legacy derivation lives on in this file as verbatim copies of the
 * removed code: parseGroups (grouping.ts) for the keys, and the engine's old
 * 'group' branch — which was literally the sponsor branch fed different keys —
 * reconstructed by cloning each contract with its legacy group names as
 * sponsors.
 *
 * Fixture note: legacy multi-group key order followed the ACL rows' fetch
 * order, which the DB never defined; the backfill orders lines by node id
 * (normalized-name creation order), which is deterministic. The fixture lists
 * its groups in normalized-name order so the two agree — the gate judges the
 * derivation and the split, not the legacy path's unstable tie order.
 */

const isDefined = <T>(value: T | null | undefined): value is T => value != null;

// Verbatim copy of extractBusinessGroups as the legacy spend path read it
// (lib/v2/core/groups.ts, since renamed extractSharedGroups and confined to
// sharing/visibility): direct contract_acl_group plus the contract's own
// folders' folder_acl_group, deduped by group id.
function legacyExtractBusinessGroups(
  contract: LegacyRawContract,
): Array<{ id: number; name: string }> {
  const direct = (contract.contract_acl_group ?? [])
    .map((acl) => acl.groups)
    .filter(isDefined);
  const folder = (contract.folder_contracts ?? [])
    .flatMap((fc) => fc.folders?.folder_acl_group ?? [])
    .map((acl) => acl.groups)
    .filter(isDefined);
  const byId = new Map<number, { id: number; name: string }>();
  for (const group of [...direct, ...folder]) {
    byId.set(group.id, { id: group.id, name: group.name });
  }
  return [...byId.values()];
}

// Verbatim copy of the removed parseGroups (lib/v2/spend/grouping.ts).
function legacyParseGroups(source: LegacyRawContract): string[] {
  const groups = legacyExtractBusinessGroups(source);
  if (groups.length > 0) return groups.map((g) => g.name);
  const scalar = source.business_group?.trim();
  return scalar ? [scalar] : ['unassigned'];
}

interface FixtureSpec {
  id: number;
  vendor: string;
  fees: number;
  businessGroup?: string;
  aclGroups?: Array<{ id: number; name: string }>;
  folderGroups?: Array<{ id: number; name: string }>;
}

// The four §Backfill populations — direct-ACL, folder-inherited, scalar-only,
// unassigned — plus the compound cases the derivation must not distort:
// a three-way split with an odd cent, ACL suppressing the scalar, and one
// group reachable both directly and through a folder (deduped by id).
const FIXTURES: FixtureSpec[] = [
  {
    id: 1,
    vendor: 'DirectAcl',
    fees: 12000,
    aclGroups: [{ id: 11, name: 'Trading' }],
  },
  {
    id: 2,
    vendor: 'FolderInherited',
    fees: 6000,
    folderGroups: [{ id: 12, name: 'Ops' }],
  },
  { id: 3, vendor: 'ScalarOnly', fees: 24000, businessGroup: 'Research' },
  { id: 4, vendor: 'Unassigned', fees: 7000 },
  {
    id: 5,
    vendor: 'ThreeWaySplit',
    fees: 10001,
    aclGroups: [
      { id: 21, name: 'Alpha' },
      { id: 22, name: 'Beta' },
    ],
    folderGroups: [{ id: 23, name: 'Gamma' }],
  },
  {
    id: 6,
    vendor: 'AclOverScalar',
    fees: 5000,
    businessGroup: 'Scalar',
    aclGroups: [{ id: 11, name: 'Trading' }],
  },
  {
    id: 7,
    vendor: 'DirectAndFolderSame',
    fees: 9000,
    aclGroups: [{ id: 11, name: 'Trading' }],
    folderGroups: [{ id: 11, name: 'Trading' }],
  },
];

function makeRaw(spec: FixtureSpec): SpendContractInput & LegacyRawContract {
  return {
    id: spec.id,
    vendor_id: spec.id * 10,
    status: 'active',
    currency: 'usd',
    subscription_term: 12,
    renewal_type: 'One-Time',
    billing_frequency: 'Quarterly',
    will_not_renew: false,
    term_start_date: [{ date: '2026-01-01' }],
    term_end_date: [{ date: '2026-12-31' }],
    cancel_by_date: null,
    business_group: spec.businessGroup ?? null,
    contract_acl_group: (spec.aclGroups ?? []).map((group) => ({
      groups: { ...group, public_uuid: `uuid-${group.id}` },
    })),
    folder_contracts: (spec.folderGroups ?? []).map((group) => ({
      folders: {
        folder_acl_group: [
          { groups: { ...group, public_uuid: `uuid-${group.id}` } },
        ],
      },
    })),
    vendor_products_details: [
      {
        product_id: spec.id * 100,
        year: 1,
        fees: spec.fees,
        vendor_products: { id: spec.id * 100, name: `${spec.vendor} Product` },
      },
    ],
  } as unknown as SpendContractInput & LegacyRawContract;
}

function makeEnriched(spec: FixtureSpec): ContractWithPricing {
  const raw = {
    ...makeRaw(spec),
    contract_tags: [],
    vendors: { name: spec.vendor },
  };
  return {
    id: spec.id,
    vendor_id: spec.id * 10,
    vendor_name: spec.vendor,
    vendor_domain: undefined,
    contract: raw,
    products: [
      {
        product_id: spec.id * 100,
        name: `${spec.vendor} Product`,
        isSuperseded: false,
        isSuperseding: false,
        sourceContractId: spec.id,
        year: 1,
        fees: spec.fees,
      },
    ],
    priceHistory: { billingFrequency: 'Quarterly' },
    isLinkedChildInvoice: false,
  } as unknown as ContractWithPricing;
}

const raws = FIXTURES.map(makeRaw);
const enriched = FIXTURES.map(makeEnriched);
const allocations = allocationsFromLegacyFixture(raws);

const mv = (currentMonth: number, nextMonth: number): MonthlyValues => ({
  currentMonth,
  nextMonth,
  change: nextMonth - currentMonth,
});

// Odd-cent months on the split contracts, so the gate judges cent placement.
const VALUES = new Map<number, MonthlyValues>([
  [1, mv(1000, 1100)],
  [2, mv(500.01, 500.02)],
  [3, mv(2000, 2000)],
  [4, mv(583.33, 583.33)],
  [5, mv(100.01, 33.35)],
  [6, mv(416.67, 416.66)],
  [7, mv(750.55, 750.55)],
]);

describe('primary gate: spend by business group, legacy vs backfill-derived', () => {
  it('produces identical rows', () => {
    const legacyRows = buildSpendByShares(
      enriched,
      VALUES,
      (ec) => [
        {
          productId: null,
          shares: legacyParseGroups(ec.contract).map(
            (name) => [name, 1] as [string, number],
          ),
        },
      ],
      'group',
    );

    // The allocation-keyed scopes the report builder itself carried until it
    // moved to owner rows (psk-1975); the gate judges the backfill derivation,
    // so it keeps the derivation the backfill produces.
    const allocationRows = buildSpendByShares(
      enriched,
      VALUES,
      (ec) => [
        {
          productId: null,
          shares: allocationShares(
            allocations.resolved
              .get(ec.id)
              ?.scopes.find((scope) => scope.productId === null)?.lines ?? [],
            'business_group',
            allocations.unitsById,
            (target) => target.name,
          ),
        },
      ],
      'group',
    );

    expect(allocationRows).toEqual(legacyRows);
    // Guard against a trivially green gate: the fixture must produce real
    // rows for all four §Backfill populations.
    expect(legacyRows.map((row) => row.name).sort()).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
      'Ops',
      'Research',
      'Trading',
      'Unassigned',
    ]);
  });
});

describe("secondary gate: engine legacy 'group' vs allocation dimension", () => {
  // The old engine's 'group' branch was the sponsor branch fed parseGroups
  // keys (one shared splitEvenly path), so feeding each contract's legacy
  // group names in as sponsors reconstructs it exactly.
  const sponsorClones: SpendContractInput[] = raws.map((raw) => ({
    ...raw,
    contract_owners: legacyParseGroups(raw).map((label, index) => ({
      id: index + 1,
      role: 'sponsor',
      user_id: null,
      org_employee_id: null,
      label,
      org_unit_id: null,
    })),
  }));

  const keyTotals = (
    items: SpendLineItem[],
    nameOf: (groupKey: string) => string,
  ): Map<string, number> => {
    const totals = new Map<string, number>();
    for (const item of items) {
      const key = `${item.period} ${nameOf(item.groupKey)}`;
      totals.set(
        key,
        Math.round(((totals.get(key) ?? 0) + item.value) * 100) / 100,
      );
    }
    return totals;
  };

  const allocationName = (groupKey: string): string => {
    if (!groupKey.startsWith('unit:')) return groupKey;
    const unit = allocations.unitsById.get(Number(groupKey.slice(5)));
    if (!unit) throw new Error(`no unit for ${groupKey}`);
    return unit.name;
  };

  it.each([
    ['committed', 'year'],
    ['amortized', 'month'],
  ] as const)(
    'identical per-period, per-key totals (%s, %s)',
    (basis, granularity) => {
      const shared = {
        basis,
        source: 'expected',
        window: { from: '2026-01-01', to: '2027-01-01' },
        granularity,
        currency: { mode: 'preconverted-usd' },
        fiscalConfig: { startMonth: 1 },
        asOf: new Date('2026-07-01T00:00:00Z'),
      } as const;

      const legacy = querySpend(sponsorClones, {
        ...shared,
        groupBy: 'sponsor',
      } as SpendQuery);
      const viaAllocation = querySpend(
        raws,
        {
          ...shared,
          groupBy: { kind: 'allocation', level: 'business_group' },
        } as SpendQuery,
        EMPTY_LINEAGE,
        { allocations },
      );

      const legacyTotals = keyTotals(legacy.items, (key) => key);
      const allocationTotals = keyTotals(viaAllocation.items, allocationName);
      expect(allocationTotals).toEqual(legacyTotals);
      expect(legacyTotals.size).toBeGreaterThan(0);
    },
  );
});
