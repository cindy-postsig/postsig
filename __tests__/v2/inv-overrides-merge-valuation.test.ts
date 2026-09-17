// __tests__/v2/inv-overrides-merge-valuation.test.ts
//
// Regression tests for override-aware recompute of the computed valuation
// metrics (my_fmv, multiple/MOIC, aggregate_cost, realized proceeds, entry
// and last transaction data). Each registered input field is covered with
// the baseline / with-override / after-revert triple.

import {
  CII_ENTRY_COST,
  CII_POSITION_ROWS,
  CII_REALIZED_PROCEEDS,
} from '@/__tests__/fixtures/cii-ledger';
import type { ValueOverrideRow } from '@/lib/v2/inv/overrides/applyOverrides';
import {
  computeTransactionAggregates,
  mergeValuationOverrides,
  type MergeValuationInput,
  type PositionTransactionRow,
  type ValuationSnapshotRow,
} from '@/lib/v2/inv/overrides/mergeValuation';
import { transformInvToPortfolioCompany } from '@/lib/v2/inv/transforms';
import type {
  InvCapTableSnapshot,
  InvCompany,
  InvCompanyValuation,
  InvInvestorStatusResult,
} from '@/lib/v2/inv/types';

// Source rows mirroring a simple position:
//   purchases of 400k + 600k (cost 1,000,000), one secondary sale of 250k,
//   latest snapshot: 10M post-money at 10% FD → my_fmv 1,000,000, MOIC 1.0
const SNAPSHOT: ValuationSnapshotRow = {
  id: 10,
  implied_valuation: 10_000_000,
  share_price: 5,
  our_fd_ownership_percent: 0.1,
  our_total_shares: 200_000,
};

const TRANSACTIONS: PositionTransactionRow[] = [
  {
    id: 1,
    fund_id: 1,
    security_id: 1,
    currency: 'USD',
    transaction_type: 'purchase',
    transaction_date: '2024-01-15',
    units: 100_000,
    amount: -400_000,
  },
  {
    id: 2,
    fund_id: 1,
    security_id: 1,
    currency: 'USD',
    transaction_type: 'purchase',
    transaction_date: '2025-03-01',
    units: 100_000,
    amount: -600_000,
  },
  {
    id: 3,
    fund_id: 1,
    security_id: 1,
    currency: 'USD',
    transaction_type: 'secondary_sale',
    transaction_date: '2025-06-01',
    units: -50_000,
    amount: 250_000,
  },
];

// The matching v_inv_company_valuation row (what the view would compute).
const BASE_VALUATION: InvCompanyValuation = {
  companyId: 7,
  globalCompanyId: 70,
  organizationId: 'org-1',
  companyName: 'Acme',
  companyDomain: null,
  sector: null,
  industry: null,
  headquarters: null,
  status: 'active',
  myFmv: 1_000_000,
  multiple: 1,
  aggregateCost: 1_000_000,
  realizedProceeds: 250_000,
  ownershipPct: 0.1,
  myFdPct: 0.1,
  myUnits: 200_000,
  postMoneyValuation: 10_000_000,
  currentPriceUnit: 5,
  fullyDilutedTotal: 2_000_000,
  totalEquityFinancing: null,
  lastTransactionDate: '2025-06-01',
  snapshotDate: '2025-05-01',
  entryDate: '2024-01-15',
  entryAmount: -400_000,
  entryStageCode: null,
  entryStageDisplayName: null,
  currentStageCode: null,
  currentStageDisplayName: null,
  fundIds: null,
  fundNames: null,
  fundShortNames: null,
  primaryFundName: null,
  primaryFundShortName: null,
  maExcludedShare: null,
  maCarriedCost: null,
  maEventDate: null,
};

let overrideId = 0;
function makeOverride(partial: Partial<ValueOverrideRow>): ValueOverrideRow {
  overrideId += 1;
  return {
    id: `ov-${overrideId}`,
    organization_id: 'org-1',
    entity_type: 'inv_transaction',
    entity_id: 1,
    field_key: 'amount',
    original_value: null,
    override_value: 0,
    reason: 'correction',
    created_by: 'user-1',
    created_at: '2026-06-01T00:00:00Z',
    reverted_at: null,
    reverted_by: null,
    ...partial,
  };
}

function merge(
  overrides: ValueOverrideRow[],
  input?: Partial<MergeValuationInput>,
) {
  return mergeValuationOverrides({
    valuation: BASE_VALUATION,
    snapshot: SNAPSHOT,
    transactions: TRANSACTIONS,
    overrides,
    ...input,
  });
}

describe('mergeValuationOverrides', () => {
  it('baseline: no overrides leaves the view values untouched', () => {
    const { valuation, overridden } = merge([]);

    expect(valuation).toEqual(BASE_VALUATION);
    expect(overridden.fields).toEqual({});
    expect(overridden.recomputed).toEqual([]);
  });

  it('after revert: reverted overrides restore the baseline exactly', () => {
    const reverted = [
      makeOverride({
        entity_type: 'inv_cap_table_snapshot',
        entity_id: 10,
        field_key: 'implied_valuation',
        override_value: 20_000_000,
        reverted_at: '2026-06-02T00:00:00Z',
      }),
      makeOverride({
        entity_id: 2,
        field_key: 'amount',
        override_value: -800_000,
        reverted_at: '2026-06-02T00:00:00Z',
      }),
    ];

    const { valuation, overridden } = merge(reverted);

    expect(valuation).toEqual(BASE_VALUATION);
    expect(overridden.fields).toEqual({});
    expect(overridden.recomputed).toEqual([]);
  });

  it('implied_valuation override recomputes my_fmv and MOIC consistently', () => {
    const { valuation, overridden } = merge([
      makeOverride({
        entity_type: 'inv_cap_table_snapshot',
        entity_id: 10,
        field_key: 'implied_valuation',
        override_value: 20_000_000,
      }),
    ]);

    expect(valuation.postMoneyValuation).toBe(20_000_000);
    expect(valuation.myFmv).toBe(2_000_000);
    expect(valuation.multiple).toBe(2);
    // untouched figures keep the view values
    expect(valuation.aggregateCost).toBe(1_000_000);
    expect(valuation.realizedProceeds).toBe(250_000);
    expect(overridden.fields.postMoneyValuation?.overrideValue).toBe(
      20_000_000,
    );
    expect(new Set(overridden.recomputed)).toEqual(
      new Set(['myFmv', 'multiple']),
    );
  });

  it('our_fd_ownership_percent override recomputes FD%, my_fmv and MOIC', () => {
    const { valuation, overridden } = merge([
      makeOverride({
        entity_type: 'inv_cap_table_snapshot',
        entity_id: 10,
        field_key: 'our_fd_ownership_percent',
        override_value: 0.2,
      }),
    ]);

    expect(valuation.myFdPct).toBe(0.2);
    expect(valuation.ownershipPct).toBe(0.2);
    expect(valuation.myFmv).toBe(2_000_000);
    expect(valuation.multiple).toBe(2);
    expect(overridden.fields.myFdPct?.overrideValue).toBe(0.2);
    expect(overridden.fields.ownershipPct?.overrideValue).toBe(0.2);
    expect(new Set(overridden.recomputed)).toEqual(
      new Set(['myFmv', 'multiple']),
    );
  });

  it('share_price / our_total_shares overrides patch pass-through fields only', () => {
    const { valuation, overridden } = merge([
      makeOverride({
        entity_type: 'inv_cap_table_snapshot',
        entity_id: 10,
        field_key: 'share_price',
        override_value: 7.5,
      }),
      makeOverride({
        entity_type: 'inv_cap_table_snapshot',
        entity_id: 10,
        field_key: 'our_total_shares',
        override_value: 250_000,
      }),
    ]);

    expect(valuation.currentPriceUnit).toBe(7.5);
    expect(valuation.myUnits).toBe(250_000);
    expect(valuation.myFmv).toBe(1_000_000);
    expect(valuation.multiple).toBe(1);
    expect(overridden.recomputed).toEqual([]);
  });

  it('amount override recomputes aggregate cost, proceeds and MOIC', () => {
    const { valuation, overridden } = merge([
      makeOverride({
        entity_id: 2,
        field_key: 'amount',
        override_value: -800_000,
      }),
    ]);

    expect(valuation.aggregateCost).toBe(1_200_000);
    expect(valuation.realizedProceeds).toBe(250_000);
    expect(valuation.multiple).toBeCloseTo(1_000_000 / 1_200_000, 12);
    expect(valuation.myFmv).toBe(1_000_000);
    // entry transaction (id 1) was not the overridden one
    expect(valuation.entryAmount).toBe(-400_000);
    expect(new Set(overridden.recomputed)).toEqual(
      new Set(['aggregateCost', 'realizedProceeds', 'multiple']),
    );
  });

  it('amount override on the entry purchase updates entry cost too', () => {
    const { valuation, overridden } = merge([
      makeOverride({
        entity_id: 1,
        field_key: 'amount',
        override_value: -500_000,
      }),
    ]);

    expect(valuation.aggregateCost).toBe(1_100_000);
    expect(valuation.entryAmount).toBe(-500_000);
    expect(overridden.recomputed).toContain('entryAmount');
  });

  it('combined snapshot + transaction overrides stay mutually consistent', () => {
    const { valuation } = merge([
      makeOverride({
        entity_type: 'inv_cap_table_snapshot',
        entity_id: 10,
        field_key: 'implied_valuation',
        override_value: 20_000_000,
      }),
      makeOverride({
        entity_id: 2,
        field_key: 'amount',
        override_value: -800_000,
      }),
    ]);

    expect(valuation.myFmv).toBe(2_000_000);
    expect(valuation.aggregateCost).toBe(1_200_000);
    expect(valuation.multiple).toBeCloseTo(2_000_000 / 1_200_000, 12);
  });

  it('units override does not change aggregates', () => {
    // net units become 100k - 200k - 50k = -150k. The view no longer drops a
    // group on a negative unit sum (cost is gross capital deployed), so units
    // feed no aggregate at all.
    const { valuation, overridden } = merge([
      makeOverride({
        entity_id: 2,
        field_key: 'units',
        override_value: -200_000,
      }),
    ]);

    expect(valuation.aggregateCost).toBe(1_000_000);
    expect(valuation.realizedProceeds).toBe(250_000);
    expect(valuation.lastTransactionDate).toBe('2025-06-01');
    expect(valuation.multiple).toBe(1);
    expect(overridden.recomputed).toEqual([]);
  });

  it('zeroes aggregate cost and MOIC for a non-active company', () => {
    // Mirrors v_inv_company_valuation's CASE: aggregate_cost is 0 and
    // multiple NULL once inv_company.status is anything but 'active'.
    const { valuation, overridden } = merge(
      [
        makeOverride({
          entity_id: 2,
          field_key: 'amount',
          override_value: -800_000,
        }),
      ],
      {
        valuation: {
          ...BASE_VALUATION,
          status: 'exited_acquisition',
          aggregateCost: 0,
          multiple: null,
        },
      },
    );

    expect(valuation.aggregateCost).toBe(0);
    expect(valuation.multiple).toBeNull();
    // proceeds are not suppressed by the exit, only cost is
    expect(valuation.realizedProceeds).toBe(250_000);
    expect(overridden.recomputed).toContain('aggregateCost');
  });

  it('keeps recomputed cost for an active company', () => {
    const { valuation } = merge(
      [
        makeOverride({
          entity_id: 2,
          field_key: 'amount',
          override_value: -800_000,
        }),
      ],
      { valuation: { ...BASE_VALUATION, status: 'active' } },
    );

    expect(valuation.aggregateCost).toBe(1_200_000);
    expect(valuation.multiple).toBeCloseTo(1_000_000 / 1_200_000, 12);
  });

  it("treats a null status as non-active, like ic.status = 'active' in SQL", () => {
    const { valuation } = merge(
      [
        makeOverride({
          entity_id: 2,
          field_key: 'amount',
          override_value: -800_000,
        }),
      ],
      { valuation: { ...BASE_VALUATION, status: null } },
    );

    expect(valuation.aggregateCost).toBe(0);
    expect(valuation.multiple).toBeNull();
  });

  it('transaction_date override moves the last transaction date', () => {
    const { valuation, overridden } = merge([
      makeOverride({
        entity_id: 3,
        field_key: 'transaction_date',
        override_value: '2026-01-10',
      }),
    ]);

    expect(valuation.lastTransactionDate).toBe('2026-01-10');
    expect(valuation.entryDate).toBe('2024-01-15');
    expect(overridden.recomputed).toContain('lastTransactionDate');
    expect(overridden.recomputed).not.toContain('entryDate');
  });

  it('transaction_date override can change which purchase is the entry', () => {
    const { valuation, overridden } = merge([
      makeOverride({
        entity_id: 2,
        field_key: 'transaction_date',
        override_value: '2023-12-01',
      }),
    ]);

    expect(valuation.entryDate).toBe('2023-12-01');
    expect(valuation.entryAmount).toBe(-600_000);
    expect(valuation.lastTransactionDate).toBe('2025-06-01');
    expect(overridden.recomputed).toContain('entryDate');
    expect(overridden.recomputed).toContain('entryAmount');
  });

  it('ignores overrides carrying values that violate the registry rule', () => {
    const { valuation, overridden } = merge([
      makeOverride({
        entity_id: 2,
        field_key: 'amount',
        override_value: 'lots',
      }),
    ]);

    expect(valuation).toEqual(BASE_VALUATION);
    expect(overridden.recomputed).toEqual([]);
  });

  it('ignores snapshot overrides targeting a different snapshot row', () => {
    const { valuation, overridden } = merge([
      makeOverride({
        entity_type: 'inv_cap_table_snapshot',
        entity_id: 99,
        field_key: 'implied_valuation',
        override_value: 20_000_000,
      }),
    ]);

    expect(valuation).toEqual(BASE_VALUATION);
    expect(overridden.fields).toEqual({});
  });

  it('handles missing snapshot / transactions inputs gracefully', () => {
    const { valuation, overridden } = merge(
      [
        makeOverride({
          entity_type: 'inv_cap_table_snapshot',
          entity_id: 10,
          field_key: 'implied_valuation',
          override_value: 20_000_000,
        }),
        makeOverride({
          entity_id: 2,
          field_key: 'amount',
          override_value: -800_000,
        }),
      ],
      { snapshot: null, transactions: null },
    );

    expect(valuation).toEqual(BASE_VALUATION);
    expect(overridden.recomputed).toEqual([]);
  });
});

describe('computeTransactionAggregates', () => {
  it('returns nulls when no position qualifies (view LEFT JOIN semantics)', () => {
    expect(computeTransactionAggregates([])).toEqual({
      aggregateCost: null,
      realizedProceeds: null,
      lastTransactionDate: null,
      entryDate: null,
      entryAmount: null,
    });
  });

  it('matches the view baseline for the shared fixture', () => {
    expect(computeTransactionAggregates(TRANSACTIONS)).toEqual({
      aggregateCost: 1_000_000,
      realizedProceeds: 250_000,
      lastTransactionDate: '2025-06-01',
      entryDate: '2024-01-15',
      entryAmount: -400_000,
    });
  });

  // Overriding inv_transaction.amount must preserve the column's sign convention
  // (purchases negative, sales positive). applyOverrides patches row.amount with
  // override_value verbatim, and the aggregate sums it SIGNED — so a stored
  // override must carry the source sign, not the abs magnitude the UI displays.
  it('keeps aggregateCost correct when a purchase amount override preserves its (negative) sign', () => {
    // Override tx 1 from -400k to magnitude 500k → must be stored as -500k.
    const rows: PositionTransactionRow[] = TRANSACTIONS.map((t) =>
      t.id === 1 ? { ...t, amount: -500_000 } : t,
    );

    const aggregates = computeTransactionAggregates(rows);

    // -((-500k) + (-600k)) = 1.1M. A naive positive override (+500k) would give
    // -((500k) + (-600k)) = 100k — the sign-flip corruption this guards against.
    expect(aggregates.aggregateCost).toBe(1_100_000);
    expect(aggregates.realizedProceeds).toBe(250_000);
  });

  it('keeps realizedProceeds correct when a sale amount override preserves its (positive) sign', () => {
    // Override tx 3 (secondary_sale) from 250k to magnitude 300k → stored as +300k.
    const rows: PositionTransactionRow[] = TRANSACTIONS.map((t) =>
      t.id === 3 ? { ...t, amount: 300_000 } : t,
    );

    const aggregates = computeTransactionAggregates(rows);

    expect(aggregates.realizedProceeds).toBe(300_000);
    expect(aggregates.aggregateCost).toBe(1_000_000);
  });

  it('excludes fund-less transactions from positions but not from entry data', () => {
    const rows: PositionTransactionRow[] = [
      ...TRANSACTIONS,
      {
        id: 4,
        fund_id: null,
        security_id: null,
        currency: 'USD',
        transaction_type: 'purchase',
        transaction_date: '2023-01-01',
        units: 10_000,
        amount: -100_000,
      },
    ];

    const aggregates = computeTransactionAggregates(rows);

    // v_inv_position INNER JOINs fund/security → id 4 is not a position row
    expect(aggregates.aggregateCost).toBe(1_000_000);
    // entry_tx has no fund/security requirement → id 4 is the entry
    expect(aggregates.entryDate).toBe('2023-01-01');
    expect(aggregates.entryAmount).toBe(-100_000);
  });

  it('keeps a group whose units net negative — cost is gross deployed', () => {
    // A position fully transferred out still consumed its purchase capital;
    // v_inv_position no longer drops it, so neither does the mirror. No
    // unit-sum tolerance is needed: units are never compared.
    const rows: PositionTransactionRow[] = [
      {
        id: 1,
        fund_id: 1,
        security_id: 1,
        currency: 'USD',
        transaction_type: 'purchase',
        transaction_date: '2024-01-01',
        units: 100_000,
        amount: -500_000,
      },
      {
        id: 2,
        fund_id: 1,
        security_id: 1,
        currency: 'USD',
        transaction_type: 'transfer_out',
        transaction_date: '2024-06-01',
        units: -150_000,
        amount: -120_000,
      },
    ];

    const aggregates = computeTransactionAggregates(rows);

    expect(aggregates.aggregateCost).toBe(500_000);
    expect(aggregates.realizedProceeds).toBe(0);
    expect(aggregates.lastTransactionDate).toBe('2024-06-01');
  });

  it('books the purchase alone when a write_off follows it', () => {
    const rows: PositionTransactionRow[] = [
      {
        id: 1,
        fund_id: 1,
        security_id: 1,
        currency: 'USD',
        transaction_type: 'purchase',
        transaction_date: '2024-01-01',
        units: 100_000,
        amount: -500_000,
      },
      {
        id: 2,
        fund_id: 1,
        security_id: 1,
        currency: 'USD',
        transaction_type: 'write_off',
        transaction_date: '2024-09-01',
        units: -100_000,
        amount: -500_000,
      },
    ];

    const aggregates = computeTransactionAggregates(rows);

    expect(aggregates.aggregateCost).toBe(
      computeTransactionAggregates([rows[0]]).aggregateCost,
    );
    expect(aggregates.realizedProceeds).toBe(0);
  });

  it('matches the CII ledger: full entry cost and exit proceeds', () => {
    // Security 1387's units net -60,000; the old HAVING clause dropped that
    // group and with it 385,221.99 of deployed capital.
    const aggregates = computeTransactionAggregates(CII_POSITION_ROWS);

    expect(aggregates.aggregateCost).toBeCloseTo(CII_ENTRY_COST, 2);
    expect(aggregates.realizedProceeds).toBeCloseTo(CII_REALIZED_PROCEEDS, 2);
    expect(aggregates.lastTransactionDate).toBe('2025-10-31');
  });

  it('aggregates positions independently per fund/security/currency group', () => {
    const rows: PositionTransactionRow[] = [
      ...TRANSACTIONS,
      // separate fund, and its units net negative → still counted in full
      {
        id: 5,
        fund_id: 2,
        security_id: 1,
        currency: 'USD',
        transaction_type: 'purchase',
        transaction_date: '2024-06-01',
        units: -10_000,
        amount: -50_000,
      },
    ];

    expect(computeTransactionAggregates(rows).aggregateCost).toBe(1_050_000);
  });
});

const COMPANY: InvCompany = {
  id: 7,
  publicId: 'company-7',
  organizationId: 'org-1',
  companyId: 70,
  status: 'active',
  sector: null,
  tags: null,
  notes: null,
  investmentThesis: null,
  contactPerson: null,
  contactEmail: null,
  externalId: null,
  metadata: {},
  createdAt: '2023-01-01',
  updatedAt: '2024-01-01',
  name: 'Acme',
  nameOverride: null,
  domain: null,
  industry: null,
  headquarters: null,
  description: null,
  foundedYear: null,
  legalName: null,
  legalJurisdiction: null,
  entityType: null,
  stageCode: null,
  stageDisplayName: null,
  entryStageCode: null,
  entryStageDisplayName: null,
};

// Snapshot whose cap_table_detail JSON carries its own FMV / realized
// proceeds baselines (Aumni portfolio imports do this).
const SNAPSHOT_WITH_DETAIL: InvCapTableSnapshot = {
  id: 10,
  companyId: 7,
  organizationId: 'org-1',
  snapshotDate: '2025-05-01',
  snapshotTypeId: null,
  snapshotTypeCode: 'portfolio_import',
  financingRoundId: null,
  fullyDilutedTotal: 2_000_000,
  totalOutstanding: null,
  impliedValuation: 10_000_000,
  sharePrice: 5,
  commonAuthorized: null,
  commonOutstanding: null,
  preferredAuthorized: null,
  preferredOutstanding: null,
  optionPoolAuthorized: null,
  optionPoolOutstanding: null,
  optionPoolAvailable: null,
  optionPoolFdPercent: null,
  ourTotalShares: 200_000,
  ourCommonShares: null,
  ourPreferredShares: null,
  ourPreferredPct: null,
  ourOwnershipPercent: null,
  ourFdOwnershipPercent: 0.1,
  ourVotingPct: null,
  stageCode: null,
  stageName: null,
  capTableDetail: {
    our_implied_value: 7_777_777,
    investment_position: { realized_proceeds: 111_111 },
  },
};

const INVESTOR_STATUS: InvInvestorStatusResult = {
  hasBoardSeat: false,
  isMajorInvestor: false,
  hasProRataRights: false,
  hasInformationRights: false,
};

function transform(
  overriddenValuationFields?: ReadonlySet<string>,
  company: InvCompany = COMPANY,
  valuation: InvCompanyValuation = BASE_VALUATION,
) {
  return transformInvToPortfolioCompany(
    company,
    valuation,
    [],
    [],
    INVESTOR_STATUS,
    undefined, // securities
    [SNAPSHOT_WITH_DETAIL],
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    overriddenValuationFields,
  );
}

describe('transformInvToPortfolioCompany with overridden valuation fields', () => {
  it('prefers the snapshot-detail JSON baselines when nothing is overridden', () => {
    const result = transform();

    expect(result.myTotalFMV).toBe(7_777_777);
    expect(result.moic).toBeCloseTo((7_777_777 + 111_111) / 1_000_000, 12);
  });

  it('bypasses the JSON baselines for override-recomputed figures', () => {
    const result = transform(new Set(['myFmv', 'realizedProceeds']));

    // BASE_VALUATION.myFmv / .realizedProceeds carry the override-merged
    // values; the stale JSON baselines must not mask the edit.
    expect(result.myTotalFMV).toBe(1_000_000);
    expect(result.moic).toBeCloseTo((1_000_000 + 250_000) / 1_000_000, 12);
  });

  // Deliberate consequence of the exited-cost rule, pinned here rather than
  // inherited silently: with aggregate_cost 0 an exited company reports no
  // cost and no MOIC anywhere downstream (company page, MCP tools, exports),
  // and its cost leaves the portfolio-level totalPortfolioCostUSD rollup.
  it('reports zero cost and no MOIC for an exited company', () => {
    const result = transform(
      undefined,
      { ...COMPANY, status: 'exited_ipo' },
      {
        ...BASE_VALUATION,
        status: 'exited_ipo',
        aggregateCost: 0,
        multiple: null,
      },
    );

    expect(result.investmentStatus).toBe('Exited');
    expect(result.myAggregateCost).toBe(0);
    expect(result.myTotalFMV).toBe(0);
    expect(result.moic).toBeNull();
    expect(result.multiple).toBe(0);
    // realized proceeds survive the exit — only cost is suppressed
    expect(result.realizedProceeds).toBe(111_111);
  });
});
