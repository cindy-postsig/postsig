import { describe, expect, it } from '@jest/globals';
import {
  buildFmvCoverage,
  fmvExclusionReason,
  type FmvCoverageEntry,
  type FmvResult,
} from '@/app/lib/mcp/tools/investor/companies';

const available: FmvResult = {
  myFmvUSD: 250_000,
  asOfDate: '2025-06-30',
  fmvUnavailableCode: null,
  fmvUnavailableReason: null,
};

function unavailable(code: FmvResult['fmvUnavailableCode']): FmvResult {
  return {
    myFmvUSD: null,
    asOfDate: null,
    fmvUnavailableCode: code,
    fmvUnavailableReason: 'reason',
  };
}

function entry(overrides: Partial<FmvCoverageEntry> = {}): FmvCoverageEntry {
  return {
    hasTransactionData: true,
    myAggregateCostUSD: 100_000,
    fmv: available,
    securityTypes: new Set(['preferred']),
    ...overrides,
  };
}

describe('fmvExclusionReason', () => {
  it('includes any company with an FMV, including an exited real 0', () => {
    expect(fmvExclusionReason(entry())).toBeNull();
    expect(
      fmvExclusionReason(entry({ fmv: { ...available, myFmvUSD: 0 } })),
    ).toBeNull();
  });

  it('ranks no transaction data above every other reason', () => {
    expect(
      fmvExclusionReason(
        entry({
          hasTransactionData: false,
          fmv: unavailable('noCapTableSnapshot'),
          securityTypes: undefined,
        }),
      ),
    ).toBe('noTransactionData');
  });

  it('classifies SAFE/note-only positions as convertibleOnly before snapshot state', () => {
    expect(
      fmvExclusionReason(
        entry({
          fmv: unavailable('noCapTableSnapshot'),
          securityTypes: new Set(['convertible_note']),
        }),
      ),
    ).toBe('convertibleOnly');
    expect(
      fmvExclusionReason(
        entry({
          fmv: unavailable('noCapTableSnapshot'),
          securityTypes: new Set(['safe', 'convertible_note']),
        }),
      ),
    ).toBe('convertibleOnly');
  });

  it('is not convertibleOnly once any equity or warrant is held', () => {
    expect(
      fmvExclusionReason(
        entry({
          fmv: unavailable('noRecordedHoldings'),
          securityTypes: new Set(['convertible_note', 'common']),
        }),
      ),
    ).toBe('noRecordedHoldings');
  });

  it('falls through to the FMV unavailability code', () => {
    expect(
      fmvExclusionReason(entry({ fmv: unavailable('snapshotMissingInputs') })),
    ).toBe('snapshotMissingInputs');
    expect(
      fmvExclusionReason(entry({ fmv: unavailable('noCapTableSnapshot') })),
    ).toBe('noCapTableSnapshot');
  });

  it('treats a missing FMV result as no snapshot', () => {
    expect(fmvExclusionReason(entry({ fmv: undefined }))).toBe(
      'noCapTableSnapshot',
    );
  });
});

describe('buildFmvCoverage', () => {
  it('counts included and excluded companies and sums excluded cost by reason', () => {
    const coverage = buildFmvCoverage([
      entry(),
      entry({ fmv: { ...available, myFmvUSD: 0 }, myAggregateCostUSD: 0 }),
      entry({
        hasTransactionData: false,
        myAggregateCostUSD: 0,
        fmv: unavailable('noCapTableSnapshot'),
        securityTypes: undefined,
      }),
      entry({
        myAggregateCostUSD: 3_657_126.59,
        fmv: unavailable('noCapTableSnapshot'),
        securityTypes: new Set(['convertible_note']),
      }),
      entry({
        myAggregateCostUSD: 1_128_439.78,
        fmv: unavailable('noCapTableSnapshot'),
        securityTypes: new Set(['common']),
      }),
      entry({
        myAggregateCostUSD: 1_235_221.99,
        fmv: unavailable('noRecordedHoldings'),
        securityTypes: new Set(['common', 'preferred', 'convertible_note']),
      }),
    ]);

    expect(coverage).toEqual({
      includedCount: 2,
      excludedCount: 4,
      excludedCostUSD: 3_657_126.59 + 1_128_439.78 + 1_235_221.99,
      excludedByReason: {
        noTransactionData: 1,
        convertibleOnly: 1,
        noCapTableSnapshot: 1,
        snapshotMissingInputs: 0,
        noRecordedHoldings: 1,
      },
    });
  });

  it('returns zeroed coverage for an empty set', () => {
    expect(buildFmvCoverage([])).toEqual({
      includedCount: 0,
      excludedCount: 0,
      excludedCostUSD: 0,
      excludedByReason: {
        noTransactionData: 0,
        convertibleOnly: 0,
        noCapTableSnapshot: 0,
        snapshotMissingInputs: 0,
        noRecordedHoldings: 0,
      },
    });
  });
});
