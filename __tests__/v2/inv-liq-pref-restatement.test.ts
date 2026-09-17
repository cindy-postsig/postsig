import {
  pickRestatedSnapshot,
  snapshotClassNames,
  transformInvToLiqPrefData,
} from '@/lib/v2/inv/transforms';
import type {
  InvCapTableSnapshot,
  InvSecurity,
  InvSecurityTerms,
  InvTransaction,
} from '@/lib/v2/inv/types';

function makeTerms(
  overrides: Partial<InvSecurityTerms> = {},
): InvSecurityTerms {
  return {
    id: 1,
    securityId: 1,
    effectiveDate: '2023-01-01',
    supersededDate: null,
    originalIssuePrice: 1.0,
    authorizedShares: null,
    issuedShares: null,
    outstandingShares: 1000,
    parValue: null,
    conversionPrice: null,
    conversionRatio: null,
    antiDilutionType: null,
    aggregateLiqPref: 1000,
    liquidationMultiplier: 1.0,
    liquidationSeniority: 1,
    participationType: null,
    participationCap: null,
    dividendRate: null,
    dividendCumulative: null,
    dividendAccruing: null,
    dividendSeniority: null,
    valuationCap: null,
    discountRate: null,
    interestRate: null,
    interestType: null,
    maturityDate: null,
    qualifiedFinancingThreshold: null,
    ...overrides,
  };
}

function makeSecurity(
  id: number,
  name: string,
  seniority: number,
): InvSecurity {
  return {
    id,
    publicId: `sec-${id}`,
    companyId: 1,
    organizationId: 'org-1',
    name,
    securityType: 'preferred',
    seriesName: null,
    isValuationReference: false,
    metadata: {},
    terms: makeTerms({ id, securityId: id, liquidationSeniority: seniority }),
  };
}

function makeSnapshot(
  overrides: Partial<InvCapTableSnapshot> = {},
): InvCapTableSnapshot {
  return {
    id: 1,
    companyId: 1,
    organizationId: 'org-1',
    snapshotDate: '2024-01-01',
    snapshotTypeId: null,
    snapshotTypeCode: null,
    financingRoundId: null,
    fullyDilutedTotal: 10000,
    totalOutstanding: null,
    impliedValuation: null,
    sharePrice: null,
    commonAuthorized: null,
    commonOutstanding: null,
    preferredAuthorized: null,
    preferredOutstanding: null,
    optionPoolAuthorized: null,
    optionPoolOutstanding: null,
    optionPoolAvailable: null,
    optionPoolFdPercent: null,
    ourTotalShares: null,
    ourCommonShares: null,
    ourPreferredShares: null,
    ourPreferredPct: null,
    ourOwnershipPercent: null,
    ourFdOwnershipPercent: null,
    ourVotingPct: null,
    capTableDetail: null,
    stageCode: null,
    stageName: null,
    ...overrides,
  };
}

function detailRows(names: string[]) {
  return names.map((name, i) => ({
    id: `row-${i}`,
    name,
    securityType: 'preferred',
    units: 100,
    fdPercent: 10,
  }));
}

// Series A Preferred is reclassified into Series A-1 Preferred; Series Seed
// survives untouched and is still listed in the restated snapshot.
const seriesSeed = makeSecurity(1, 'Series Seed Preferred', 1);
const seriesA = makeSecurity(2, 'Series A Preferred', 2);
const seriesA1 = makeSecurity(3, 'Series A-1 Preferred', 2);
const securities = [seriesSeed, seriesA, seriesA1];
const transactions: InvTransaction[] = [];

const recapSnapshot = makeSnapshot({
  id: 2,
  snapshotDate: '2025-01-01',
  stageCode: 'reclassification',
  stageName: 'Reclassification',
  capTableDetail: detailRows(['Series Seed Preferred', 'Series A-1 Preferred']),
});

describe('pickRestatedSnapshot', () => {
  it('returns null when no snapshot has a synthetic stage', () => {
    const snapshots = [
      makeSnapshot({ id: 1, stageCode: 'seed' }),
      makeSnapshot({
        id: 2,
        snapshotDate: '2025-01-01',
        stageCode: 'series_a',
      }),
    ];

    expect(pickRestatedSnapshot(snapshots)).toBeNull();
  });

  it('returns the latest snapshot once a restatement exists', () => {
    const later = makeSnapshot({
      id: 3,
      snapshotDate: '2026-01-01',
      stageCode: 'series_b',
    });

    expect(pickRestatedSnapshot([recapSnapshot, later])?.id).toBe(3);
  });

  it('ignores portfolio_import snapshots', () => {
    const imported = makeSnapshot({
      id: 9,
      snapshotDate: '2027-01-01',
      snapshotTypeCode: 'portfolio_import',
      stageCode: 'series_b',
    });

    expect(pickRestatedSnapshot([recapSnapshot, imported])?.id).toBe(
      recapSnapshot.id,
    );
  });

  it('does not treat a portfolio_import restatement as one', () => {
    const importedRecap = makeSnapshot({
      id: 9,
      snapshotTypeCode: 'portfolio_import',
      stageCode: 'reclassification',
    });

    expect(pickRestatedSnapshot([importedRecap])).toBeNull();
  });
});

describe('snapshotClassNames', () => {
  it('returns null when the snapshot has no per-security detail', () => {
    expect(snapshotClassNames(makeSnapshot())).toBeNull();
  });

  it('returns null for an undefined snapshot', () => {
    expect(snapshotClassNames(undefined)).toBeNull();
  });

  it('lowercases and trims class names', () => {
    const snap = makeSnapshot({
      capTableDetail: detailRows(['  Series A-1 Preferred  ']),
    });

    expect(snapshotClassNames(snap)).toEqual(new Set(['series a-1 preferred']));
  });
});

describe('transformInvToLiqPrefData restatement filter', () => {
  it('hides a class restated away by the snapshot', () => {
    const result = transformInvToLiqPrefData(
      securities,
      transactions,
      undefined,
      recapSnapshot,
    );

    const classes = result?.rows.map((r) => r.equityClass);
    expect(classes).not.toContain('Series A Preferred');
  });

  it('keeps surviving and newly created classes', () => {
    const result = transformInvToLiqPrefData(
      securities,
      transactions,
      undefined,
      recapSnapshot,
    );

    const classes = result?.rows.map((r) => r.equityClass);
    expect(classes).toEqual(
      expect.arrayContaining(['Series Seed Preferred', 'Series A-1 Preferred']),
    );
    expect(classes).toHaveLength(2);
  });

  it('matches class names case-insensitively and ignores surrounding space', () => {
    const snap = makeSnapshot({
      stageCode: 'reclassification',
      capTableDetail: detailRows(['  series a-1 PREFERRED ']),
    });

    const result = transformInvToLiqPrefData(
      securities,
      transactions,
      undefined,
      snap,
    );

    expect(result?.rows.map((r) => r.equityClass)).toEqual([
      'Series A-1 Preferred',
    ]);
  });

  it('renders every class when the snapshot has no per-security detail', () => {
    const noDetail = makeSnapshot({
      stageCode: 'reclassification',
      capTableDetail: null,
    });

    const result = transformInvToLiqPrefData(
      securities,
      transactions,
      undefined,
      noDetail,
    );

    expect(result?.rows).toHaveLength(3);
  });

  it('renders every class when there is no restated snapshot at all', () => {
    const result = transformInvToLiqPrefData(securities, transactions);

    expect(result?.rows).toHaveLength(3);
  });

  it('returns undefined when the filter removes every class', () => {
    const unrelated = makeSnapshot({
      stageCode: 'reclassification',
      capTableDetail: detailRows(['Common']),
    });

    expect(
      transformInvToLiqPrefData(securities, transactions, undefined, unrelated),
    ).toBeUndefined();
  });

  it('keeps totalLiqPref sourced from terms, not transaction sums', () => {
    const result = transformInvToLiqPrefData(
      securities,
      transactions,
      undefined,
      recapSnapshot,
    );

    // Two surviving classes, each with aggregateLiqPref 1000 from its terms.
    expect(result?.totalLiqPref).toBe(2000);
  });
});

describe('transformInvToLiqPrefData myCost', () => {
  function makeTx(overrides: Partial<InvTransaction> & { id: number }) {
    return {
      publicId: `tx-${overrides.id}`,
      companyId: 1,
      fundId: 1,
      securityId: 1,
      financingRoundId: null,
      organizationId: 'org-1',
      transactionDate: '2024-01-01',
      settlementDate: null,
      transactionType: 'purchase',
      units: 1000,
      pricePerUnit: 1,
      amount: 1000,
      currency: 'USD',
      counterpartyName: null,
      notes: null,
      externalId: null,
      metadata: {},
      ...overrides,
    } as InvTransaction;
  }

  const myCostOf = (txs: InvTransaction[]) =>
    transformInvToLiqPrefData([seriesSeed], txs)?.rows[0].myCost;

  it('sums cost-type transactions', () => {
    expect(myCostOf([makeTx({ id: 1, amount: 1000 })])).toBe(1000);
  });

  it('ignores adjustment legs carrying a nonzero amount', () => {
    // A signed sum over every type would leave a residual here; mirroring
    // v_inv_position's cost filter keeps myCost on the purchase alone.
    const txs = [
      makeTx({ id: 1, amount: 1000 }),
      makeTx({ id: 2, transactionType: 'reclassification', amount: -1000 }),
      makeTx({ id: 3, transactionType: 'reclassification', amount: 1000 }),
    ];

    expect(myCostOf(txs)).toBe(1000);
  });

  it('ignores proceeds-type transactions', () => {
    const txs = [
      makeTx({ id: 1, amount: 1000 }),
      makeTx({ id: 2, transactionType: 'secondary_sale', amount: -400 }),
    ];

    expect(myCostOf(txs)).toBe(1000);
  });

  it('counts every position cost type', () => {
    const txs = [
      makeTx({ id: 1, transactionType: 'purchase', amount: 100 }),
      makeTx({ id: 2, transactionType: 'exercise', amount: 200 }),
      makeTx({ id: 3, transactionType: 'secondary_purchase', amount: 300 }),
      makeTx({ id: 4, transactionType: 'issuance', amount: 400 }),
    ];

    expect(myCostOf(txs)).toBe(1000);
  });
});
