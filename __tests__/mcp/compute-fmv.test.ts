import { describe, expect, it } from '@jest/globals';
import {
  computeFmv,
  recordsNoHoldings,
  type ComputeFmvInput,
} from '@/app/lib/mcp/tools/investor/companies';

const base: ComputeFmvInput = {
  status: 'active',
  ourImpliedValue: null,
  viewMyFmv: null,
  hasCapTableSnapshot: false,
  fmvOverridden: false,
  myUnits: null,
  snapshotDate: null,
  overrideCreatedAt: null,
};

describe('computeFmv', () => {
  it('returns a real 0 for a closed/exited position, never null', () => {
    expect(computeFmv({ ...base, status: 'exited' })).toEqual({
      myFmvUSD: 0,
      asOfDate: null,
      fmvUnavailableCode: null,
      fmvUnavailableReason: null,
    });
    // Even with data available, an exited position's FMV is 0 going forward
    // — a status-derived constant, so no snapshot date is attributed to it.
    expect(
      computeFmv({
        ...base,
        status: 'exited',
        ourImpliedValue: 500_000,
        viewMyFmv: 400_000,
        hasCapTableSnapshot: true,
        snapshotDate: '2024-03-01',
      }),
    ).toEqual({
      myFmvUSD: 0,
      asOfDate: null,
      fmvUnavailableCode: null,
      fmvUnavailableReason: null,
    });
  });

  it('prefers cap_table_detail.our_implied_value when present', () => {
    expect(
      computeFmv({
        ...base,
        ourImpliedValue: 250_000,
        viewMyFmv: 100_000,
        hasCapTableSnapshot: true,
        snapshotDate: '2024-03-01',
      }),
    ).toEqual({
      myFmvUSD: 250_000,
      asOfDate: '2024-03-01',
      fmvUnavailableCode: null,
      fmvUnavailableReason: null,
    });
  });

  it('falls back to the valuation view my_fmv when implied value is missing', () => {
    expect(
      computeFmv({
        ...base,
        viewMyFmv: 100_000,
        hasCapTableSnapshot: true,
        snapshotDate: '2024-03-01',
      }),
    ).toEqual({
      myFmvUSD: 100_000,
      asOfDate: '2024-03-01',
      fmvUnavailableCode: null,
      fmvUnavailableReason: null,
    });
  });

  it('prefers the manual override over cap_table_detail.our_implied_value', () => {
    // viewMyFmv here is the override value (applyValuationOverrides already
    // patched it onto the valuation view row) — implied value is stale once
    // a human has corrected the figure, so the override must win. asOfDate
    // is the override's creation date (date part), not the snapshot date:
    // the manual mark is fresher than the transaction data it supersedes.
    expect(
      computeFmv({
        ...base,
        ourImpliedValue: 250_000,
        viewMyFmv: 999_000,
        hasCapTableSnapshot: true,
        fmvOverridden: true,
        snapshotDate: '2024-03-01',
        overrideCreatedAt: '2026-08-15T14:30:00.000+00:00',
      }),
    ).toEqual({
      myFmvUSD: 999_000,
      asOfDate: '2026-08-15',
      fmvUnavailableCode: null,
      fmvUnavailableReason: null,
    });
  });

  it('keeps the snapshot date when myFmv is only recomputed from an overridden input', () => {
    // fmvOverridden is also true when myFmv appears in `recomputed` (an
    // input like implied_valuation was edited) — there is no myFmv override
    // row then, so overrideCreatedAt is null and the snapshot date stands.
    expect(
      computeFmv({
        ...base,
        viewMyFmv: 750_000,
        hasCapTableSnapshot: true,
        fmvOverridden: true,
        snapshotDate: '2024-03-01',
      }),
    ).toEqual({
      myFmvUSD: 750_000,
      asOfDate: '2024-03-01',
      fmvUnavailableCode: null,
      fmvUnavailableReason: null,
    });
  });

  it('returns null with a reason when a snapshot exists but neither source has a value', () => {
    expect(
      computeFmv({
        ...base,
        hasCapTableSnapshot: true,
        snapshotDate: '2024-03-01',
      }),
    ).toEqual({
      myFmvUSD: null,
      asOfDate: null,
      fmvUnavailableCode: 'snapshotMissingInputs',
      fmvUnavailableReason:
        'The latest cap table snapshot is missing ownership percent or implied valuation, so FMV could not be computed.',
    });
  });

  it('returns null with a different reason when no cap table snapshot exists at all', () => {
    expect(computeFmv(base)).toEqual({
      myFmvUSD: null,
      asOfDate: null,
      fmvUnavailableCode: 'noCapTableSnapshot',
      fmvUnavailableReason:
        'No cap table snapshot has been recorded for this company.',
    });
  });

  it('treats a real 0 implied value as a real value, not missing data', () => {
    expect(
      computeFmv({
        ...base,
        ourImpliedValue: 0,
        viewMyFmv: 100_000,
        hasCapTableSnapshot: true,
        snapshotDate: '2024-03-01',
      }),
    ).toEqual({
      myFmvUSD: 0,
      asOfDate: '2024-03-01',
      fmvUnavailableCode: null,
      fmvUnavailableReason: null,
    });
  });

  it('returns null with a reason when the snapshot records zero holdings for an active company', () => {
    // 0 units × any post-money is a real-looking 0 from the view; a live
    // position with no recorded holdings is data that has not caught up.
    expect(
      computeFmv({
        ...base,
        viewMyFmv: 0,
        hasCapTableSnapshot: true,
        myUnits: 0,
        snapshotDate: '2025-11-01',
      }),
    ).toEqual({
      myFmvUSD: null,
      asOfDate: null,
      fmvUnavailableCode: 'noRecordedHoldings',
      fmvUnavailableReason:
        'The latest cap table snapshot records no holdings for this active position, so FMV could not be computed.',
    });
  });

  it('lets a manual override win over zero recorded holdings', () => {
    expect(
      computeFmv({
        ...base,
        viewMyFmv: 50_000,
        hasCapTableSnapshot: true,
        fmvOverridden: true,
        myUnits: 0,
        snapshotDate: '2025-11-01',
        overrideCreatedAt: '2026-08-15T14:30:00.000+00:00',
      }),
    ).toEqual({
      myFmvUSD: 50_000,
      asOfDate: '2026-08-15',
      fmvUnavailableCode: null,
      fmvUnavailableReason: null,
    });
  });

  it('keeps the real 0 for an exited company with zero holdings', () => {
    expect(
      computeFmv({ ...base, status: 'exited', myUnits: 0, viewMyFmv: 0 }),
    ).toEqual({
      myFmvUSD: 0,
      asOfDate: null,
      fmvUnavailableCode: null,
      fmvUnavailableReason: null,
    });
  });
});

describe('recordsNoHoldings', () => {
  it('is true only for an active company with exactly zero units and no override', () => {
    expect(
      recordsNoHoldings({ status: 'active', myUnits: 0, fmvOverridden: false }),
    ).toBe(true);
    expect(
      recordsNoHoldings({ status: 'active', myUnits: 0, fmvOverridden: true }),
    ).toBe(false);
    expect(
      recordsNoHoldings({ status: 'exited', myUnits: 0, fmvOverridden: false }),
    ).toBe(false);
    expect(
      recordsNoHoldings({
        status: 'active',
        myUnits: null,
        fmvOverridden: false,
      }),
    ).toBe(false);
    expect(
      recordsNoHoldings({ status: 'active', myUnits: 1, fmvOverridden: false }),
    ).toBe(false);
  });
});
