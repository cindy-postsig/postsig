import {
  deriveCancelByDateFromParent,
  enrichWithLineage,
} from '@/lib/v2/core/lineage';

const CONTRACT_TYPE_MSA = 1;
const CONTRACT_TYPE_SERVICE_ORDER = 2;
const CONTRACT_TYPE_ADDENDUM = 3;

const dates = (date: string) => [{ date }];

/** A service order that states no cancel-by date of its own. */
const serviceOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 20,
  type_id: CONTRACT_TYPE_SERVICE_ORDER,
  cancel_date: null,
  cancel_by_date: null,
  term_end_date: dates('2026-06-30'),
  ...overrides,
});

/** An MSA carrying a 90-day notice period. */
const msa = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  type_id: CONTRACT_TYPE_MSA,
  cancel_by_date: 90,
  cancel_date: dates('2026-10-02'),
  term_end_date: dates('2026-12-31'),
  ...overrides,
});

describe('deriveCancelByDateFromParent', () => {
  it("counts the MSA's notice period back from the service order's own term end", () => {
    expect(deriveCancelByDateFromParent(serviceOrder(), msa())).toEqual({
      date: '2026-04-01',
      noticeDays: 90,
      sourceContractId: 10,
    });
  });

  it("does not copy the MSA's own resolved cancel date", () => {
    // The MSA's date (2026-10-02) falls after the service order has expired
    const result = deriveCancelByDateFromParent(serviceOrder(), msa());
    expect(result?.date).not.toBe('2026-10-02');
    expect(result!.date < '2026-06-30').toBe(true);
  });

  it('leaves a service order that states its own cancel date alone', () => {
    const withOwnDate = serviceOrder({ cancel_date: dates('2026-05-15') });
    expect(deriveCancelByDateFromParent(withOwnDate, msa())).toBeNull();
  });

  it('leaves a service order that states its own notice period alone', () => {
    const withOwnNotice = serviceOrder({ cancel_by_date: 30 });
    expect(deriveCancelByDateFromParent(withOwnNotice, msa())).toBeNull();
  });

  it('ignores parents that are not MSAs', () => {
    const addendum = msa({ type_id: CONTRACT_TYPE_ADDENDUM });
    expect(deriveCancelByDateFromParent(serviceOrder(), addendum)).toBeNull();
  });

  it('only applies to service orders', () => {
    const addendum = serviceOrder({ type_id: CONTRACT_TYPE_ADDENDUM });
    expect(deriveCancelByDateFromParent(addendum, msa())).toBeNull();
  });

  it('returns null when the MSA carries no notice period', () => {
    // Number(null)/Number('') are 0, which would wrongly resolve to the term end
    for (const cancel_by_date of [null, undefined, '']) {
      expect(
        deriveCancelByDateFromParent(serviceOrder(), msa({ cancel_by_date })),
      ).toBeNull();
    }
  });

  it('returns null for a non-numeric or negative notice period', () => {
    for (const cancel_by_date of ['none', -30]) {
      expect(
        deriveCancelByDateFromParent(serviceOrder(), msa({ cancel_by_date })),
      ).toBeNull();
    }
  });

  it('accepts a zero-day notice period as the term end itself', () => {
    expect(
      deriveCancelByDateFromParent(serviceOrder(), msa({ cancel_by_date: 0 }))
        ?.date,
    ).toBe('2026-06-30');
  });

  it('accepts a notice period stored as a numeric string', () => {
    expect(
      deriveCancelByDateFromParent(
        serviceOrder(),
        msa({ cancel_by_date: '90' }),
      )?.date,
    ).toBe('2026-04-01');
  });

  it('returns null when the service order has no term end to count back from', () => {
    const noTermEnd = serviceOrder({ term_end_date: null });
    expect(deriveCancelByDateFromParent(noTermEnd, msa())).toBeNull();
  });

  it('returns null when there is no parent at all', () => {
    expect(deriveCancelByDateFromParent(serviceOrder(), null)).toBeNull();
    expect(deriveCancelByDateFromParent(serviceOrder(), undefined)).toBeNull();
  });

  it('returns null for an unparseable term end', () => {
    const badTermEnd = serviceOrder({ term_end_date: dates('not-a-date') });
    expect(deriveCancelByDateFromParent(badTermEnd, msa())).toBeNull();
  });

  it('crosses a month boundary correctly', () => {
    const so = serviceOrder({ term_end_date: dates('2026-03-01') });
    expect(
      deriveCancelByDateFromParent(so, msa({ cancel_by_date: 60 }))?.date,
    ).toBe('2025-12-31');
  });
});

describe('enrichWithLineage cancel-by inheritance', () => {
  const relationship = { parent_contract_id: 10, child_contract_id: 20 };

  it('attaches the inherited date to a linked service order', () => {
    const [parent, child] = enrichWithLineage(
      [msa(), serviceOrder()],
      [relationship],
    );

    expect(parent.inheritedCancelByDate).toBeNull();
    expect(child.inheritedCancelByDate).toEqual({
      date: '2026-04-01',
      noticeDays: 90,
      sourceContractId: 10,
    });
  });

  it('attaches nothing to an unlinked service order', () => {
    const [, child] = enrichWithLineage([msa(), serviceOrder()], []);
    expect(child.inheritedCancelByDate).toBeNull();
  });

  it('does not inherit through an intermediate addendum', () => {
    // Direct parent only: SO -> Addendum -> MSA leaves the SO untouched
    const addendum = {
      id: 15,
      type_id: CONTRACT_TYPE_ADDENDUM,
      cancel_by_date: null,
      cancel_date: null,
      term_end_date: dates('2026-12-31'),
    };
    const [, , child] = enrichWithLineage(
      [msa(), addendum, serviceOrder()],
      [
        { parent_contract_id: 10, child_contract_id: 15 },
        { parent_contract_id: 15, child_contract_id: 20 },
      ],
    );

    expect(child.inheritedCancelByDate).toBeNull();
  });
});
