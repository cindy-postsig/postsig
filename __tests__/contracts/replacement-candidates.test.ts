import { describe, expect, it } from '@jest/globals';

import {
  findReplacementCandidates,
  getNewContractDate,
  getTermEndDate,
  isWithinRenewalWindow,
  matchProductNames,
  REPLACEMENT_TYPE_IDS,
  ReplacementCandidateInput,
  ReplacementOldContract,
} from '@/lib/contracts/replacementCandidates';
import { contractTypes } from '@/app/lib/constants';

const NEW_ID = 100;
const OLD_ID = 42;

const dated = (date: string) => [{ date }];

const oldContract = (
  overrides: Partial<ReplacementOldContract> = {},
): ReplacementOldContract => ({
  contractId: OLD_ID,
  typeId: contractTypes.SO,
  termEndDate: dated('2026-01-31'),
  productNames: ['Terminal Pro'],
  status: 'active',
  ...overrides,
});

const run = (overrides: Partial<ReplacementCandidateInput> = {}) =>
  findReplacementCandidates({
    newContract: {
      contractId: NEW_ID,
      typeId: contractTypes.SO,
      termStartDate: dated('2026-02-01'),
      productNames: ['Terminal Pro'],
    },
    oldContracts: [oldContract()],
    chainContractIds: new Set<number>([NEW_ID]),
    existingEventOldContractIds: new Set<number>(),
    ...overrides,
  });

describe('REPLACEMENT_TYPE_IDS', () => {
  it('covers exactly the big 3 contract types', () => {
    expect([...REPLACEMENT_TYPE_IDS].sort()).toEqual(
      [contractTypes.MSA, contractTypes.SO, contractTypes.Addendum].sort(),
    );
  });

  it('excludes types that can never replace a contract', () => {
    // An invoice or a trial arriving at renewal time is not a replacement.
    [
      contractTypes.Invoice,
      contractTypes.TOS,
      contractTypes.Trial,
      contractTypes.NDA,
      contractTypes.EAFeeSchedule,
    ].forEach((typeId) => {
      expect(REPLACEMENT_TYPE_IDS).not.toContain(typeId);
    });
  });
});

describe('getTermEndDate', () => {
  it('reads the LATEST end date, not the last array element', () => {
    // An extension appends a later end date. Reading the original (the
    // getOrderingDate convention) would make an extended contract look
    // replaceable a year early.
    const extended = [{ date: '2027-01-31' }, { date: '2026-01-31' }];

    expect(getTermEndDate(extended)?.toISOString()).toBe(
      new Date('2027-01-31').toISOString(),
    );
  });

  it('accepts a bare string as well as the jsonb array', () => {
    expect(getTermEndDate('2026-01-31')?.toISOString()).toBe(
      new Date('2026-01-31').toISOString(),
    );
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty array', []],
    ['entries with no date', [{ note: 'x' }]],
    ['a blank date string', [{ date: '   ' }]],
    ['an unparseable date', [{ date: 'not a date' }]],
  ])('returns null for %s', (_label, value) => {
    expect(getTermEndDate(value)).toBeNull();
  });

  it('ignores unparseable entries when a valid one is present', () => {
    expect(
      getTermEndDate([
        { date: 'garbage' },
        { date: '2026-01-31' },
      ])?.toISOString(),
    ).toBe(new Date('2026-01-31').toISOString());
  });
});

describe('getNewContractDate', () => {
  it('reads the EARLIEST start, i.e. when the contract first took effect', () => {
    // A later amendment to the new contract must not move it out of the window.
    const amended = [{ date: '2026-06-01' }, { date: '2026-02-01' }];

    expect(getNewContractDate(amended)?.toISOString()).toBe(
      new Date('2026-02-01').toISOString(),
    );
  });

  it('returns null when there is no usable date', () => {
    expect(getNewContractDate([])).toBeNull();
  });
});

describe('isWithinRenewalWindow', () => {
  const end = new Date('2026-01-31');

  it('accepts the exact lower boundary day', () => {
    expect(isWithinRenewalWindow(new Date('2025-12-31'), end)).toBe(true);
  });

  it('accepts the exact upper boundary day', () => {
    // Jan 31 + 1 month clamps to Feb 28, the last day of the target month,
    // rather than overflowing into March.
    expect(isWithinRenewalWindow(new Date('2026-02-28'), end)).toBe(true);
  });

  it('rejects a date before the lower boundary', () => {
    expect(isWithinRenewalWindow(new Date('2025-12-30'), end)).toBe(false);
  });

  it('rejects a date past the upper boundary', () => {
    expect(isWithinRenewalWindow(new Date('2026-03-04'), end)).toBe(false);
  });

  it('uses calendar months so a Jan 31 end accepts a Feb 28 renewal', () => {
    // A fixed 30-day window would have missed this pair.
    expect(
      isWithinRenewalWindow(new Date('2026-02-28'), new Date('2026-01-31')),
    ).toBe(true);
  });

  it('clamps the lower bound instead of overflowing a month-end date', () => {
    // Mar 31 - 1 month is "Feb 31", which a bare setMonth rolls forward to
    // Mar 3 — collapsing the lower half of the window and rejecting a renewal
    // signed a month early.
    expect(
      isWithinRenewalWindow(new Date('2026-03-01'), new Date('2026-03-31')),
    ).toBe(true);
  });

  it('accepts the clamped lower boundary day itself', () => {
    expect(
      isWithinRenewalWindow(new Date('2026-02-28'), new Date('2026-03-31')),
    ).toBe(true);
  });

  it('still rejects a date before the clamped lower boundary', () => {
    expect(
      isWithinRenewalWindow(new Date('2026-02-27'), new Date('2026-03-31')),
    ).toBe(false);
  });

  it('clamps a leap-year February target', () => {
    expect(
      isWithinRenewalWindow(new Date('2028-02-29'), new Date('2028-03-31')),
    ).toBe(true);
  });
});

describe('matchProductNames', () => {
  it('matches case-insensitively but otherwise exactly', () => {
    expect(matchProductNames(['terminal PRO'], ['Terminal Pro'])).toEqual([
      'Terminal Pro',
    ]);
  });

  it('ignores surrounding whitespace', () => {
    expect(matchProductNames(['  Terminal Pro '], ['Terminal Pro'])).toEqual([
      'Terminal Pro',
    ]);
  });

  it('does not fuzzy match near-miss names', () => {
    // Near-miss names are exactly where independent per-seat orders
    // masquerade as renewals.
    expect(matchProductNames(['Terminal Pro Plus'], ['Terminal Pro'])).toEqual(
      [],
    );
  });

  it('returns the old contract casing, deduplicated', () => {
    expect(
      matchProductNames(['terminal pro'], ['Terminal Pro', 'Terminal Pro']),
    ).toEqual(['Terminal Pro']);
  });

  it('ignores blank names on both sides', () => {
    expect(matchProductNames(['', '   '], ['', '  '])).toEqual([]);
  });
});

describe('findReplacementCandidates — the happy path', () => {
  it('returns the old contract with its evidence', () => {
    expect(run()).toEqual([{ oldContractId: OLD_ID, dateDeltaDays: 1 }]);
  });

  it('reports a negative delta when the new contract predates the end', () => {
    expect(
      run({
        newContract: {
          contractId: NEW_ID,
          typeId: contractTypes.SO,
          termStartDate: dated('2026-01-21'),
          productNames: ['Terminal Pro'],
        },
      })[0].dateDeltaDays,
    ).toBe(-10);
  });

  it('allows a type change between old and new', () => {
    // Amendment→SO and Amendment→MSA are both valid replacement shapes.
    expect(
      run({
        newContract: {
          contractId: NEW_ID,
          typeId: contractTypes.MSA,
          termStartDate: dated('2026-02-01'),
          productNames: ['Terminal Pro'],
        },
        oldContracts: [oldContract({ typeId: contractTypes.Addendum })],
      }),
    ).toHaveLength(1);
  });

  it('keeps a pair whose dates fall outside the renewal window', () => {
    // Stage 1 no longer gates on the window; stage 2 adjudicates the dates.
    expect(
      run({
        oldContracts: [oldContract({ termEndDate: dated('2025-06-30') })],
      }),
    ).toHaveLength(1);
  });

  it('keeps a pair that shares no product name', () => {
    // Vendors rename products across paper, so an empty overlap is not a no.
    expect(
      run({ oldContracts: [oldContract({ productNames: ['Data Feed'] })] }),
    ).toHaveLength(1);
  });

  it.each([
    ['the old contract has no products', { productNames: [] }],
    ['the new contract has no products', { productNames: ['  '] }],
  ])('keeps a pair when %s', (_label, overrides) => {
    expect(run({ oldContracts: [oldContract(overrides)] })).toHaveLength(1);
  });

  it('returns one entry per qualifying old contract', () => {
    expect(
      run({
        oldContracts: [
          oldContract({ contractId: 1 }),
          oldContract({ contractId: 2 }),
        ],
      }).map((c) => c.oldContractId),
    ).toEqual([1, 2]);
  });
});

describe('findReplacementCandidates — exclusions', () => {
  it('excludes a new contract that is not a big-3 type', () => {
    expect(
      run({
        newContract: {
          contractId: NEW_ID,
          typeId: contractTypes.Invoice,
          termStartDate: dated('2026-02-01'),
          productNames: ['Terminal Pro'],
        },
      }),
    ).toEqual([]);
  });

  it('excludes a new contract with no type at all', () => {
    expect(
      run({
        newContract: {
          contractId: NEW_ID,
          typeId: null,
          termStartDate: dated('2026-02-01'),
          productNames: ['Terminal Pro'],
        },
      }),
    ).toEqual([]);
  });

  it('excludes an old contract that is not a big-3 type', () => {
    expect(
      run({ oldContracts: [oldContract({ typeId: contractTypes.TOS })] }),
    ).toEqual([]);
  });

  it('excludes an undated new contract', () => {
    expect(
      run({
        newContract: {
          contractId: NEW_ID,
          typeId: contractTypes.SO,
          termStartDate: null,
          productNames: ['Terminal Pro'],
        },
      }),
    ).toEqual([]);
  });

  it('excludes an undated old contract', () => {
    // No end date means no renewal window to fall inside.
    expect(run({ oldContracts: [oldContract({ termEndDate: null })] })).toEqual(
      [],
    );
  });

  it.each([['archived'], ['draft'], ['expired'], [null]])(
    'excludes an old contract with status %s',
    (status) => {
      // Only an active contract is worth prompting the customer to archive.
      expect(run({ oldContracts: [oldContract({ status })] })).toEqual([]);
    },
  );

  it('excludes an old contract in the new contract’s own chain', () => {
    // An amendment on the same paper is normal lineage, not a replacement.
    expect(run({ chainContractIds: new Set([NEW_ID, OLD_ID]) })).toEqual([]);
  });

  it('excludes a pair that already has an event of any status', () => {
    expect(run({ existingEventOldContractIds: new Set([OLD_ID]) })).toEqual([]);
  });

  it('never returns the new contract as its own candidate', () => {
    expect(
      run({ oldContracts: [oldContract({ contractId: NEW_ID })] }),
    ).toEqual([]);
  });

  it('returns nothing when there are no old contracts', () => {
    expect(run({ oldContracts: [] })).toEqual([]);
  });
});
