// __tests__/v2/inv-overrides-apply.test.ts
import {
  applyOverrides,
  type ValueOverrideRow,
} from '@/lib/v2/inv/overrides/applyOverrides';

interface TransactionRowFixture {
  id: number;
  amount: number;
  units: number;
  transaction_date: string;
  transaction_type: string;
}

function makeRow(
  overrides: Partial<TransactionRowFixture> & { id: number },
): TransactionRowFixture {
  return {
    amount: 1000000,
    units: 5000,
    transaction_date: '2024-01-15',
    transaction_type: 'purchase',
    ...overrides,
  };
}

function makeOverride(
  overrides: Partial<ValueOverrideRow> & { id: string },
): ValueOverrideRow {
  return {
    organization_id: 'org-1',
    entity_type: 'inv_transaction',
    entity_id: 1,
    field_key: 'amount',
    original_value: 1000000,
    override_value: 2000000,
    reason: 'Corrected per wire confirmation',
    created_by: 'user-1',
    created_at: '2026-06-01T10:00:00Z',
    reverted_at: null,
    reverted_by: null,
    ...overrides,
  };
}

describe('applyOverrides', () => {
  it('returns rows unchanged with no overrides', () => {
    const rows = [makeRow({ id: 1 }), makeRow({ id: 2 })];
    const result = applyOverrides('inv_transaction', rows, []);

    expect(result.rows).toEqual(rows);
    expect(result.overridden).toEqual({});
  });

  it('applies an active override and exposes its metadata', () => {
    const rows = [makeRow({ id: 1 }), makeRow({ id: 2 })];
    const override = makeOverride({ id: 'ov-10', entity_id: 1 });

    const result = applyOverrides('inv_transaction', rows, [override]);

    expect(result.rows[0].amount).toBe(2000000);
    expect(result.rows[1].amount).toBe(1000000);
    expect(result.overridden[1].amount).toEqual({
      overrideId: 'ov-10',
      fieldKey: 'amount',
      originalValue: 1000000,
      overrideValue: 2000000,
      reason: 'Corrected per wire confirmation',
      createdBy: 'user-1',
      createdAt: '2026-06-01T10:00:00Z',
    });
    expect(result.overridden[2]).toBeUndefined();
  });

  it('ignores reverted overrides', () => {
    const rows = [makeRow({ id: 1 })];
    const reverted = makeOverride({
      id: 'ov-10',
      reverted_at: '2026-06-02T09:00:00Z',
      reverted_by: 'user-1',
    });

    const result = applyOverrides('inv_transaction', rows, [reverted]);

    expect(result.rows[0].amount).toBe(1000000);
    expect(result.overridden).toEqual({});
  });

  it('applies multiple overrides on different fields of one entity', () => {
    const rows = [makeRow({ id: 1 })];
    const result = applyOverrides('inv_transaction', rows, [
      makeOverride({
        id: 'ov-10',
        field_key: 'amount',
        override_value: 2000000,
      }),
      makeOverride({ id: 'ov-11', field_key: 'units', override_value: 7500 }),
    ]);

    expect(result.rows[0].amount).toBe(2000000);
    expect(result.rows[0].units).toBe(7500);
    expect(Object.keys(result.overridden[1]).sort()).toEqual([
      'amount',
      'units',
    ]);
  });

  it('last write wins when two active overrides target the same field', () => {
    const rows = [makeRow({ id: 1 })];
    const result = applyOverrides('inv_transaction', rows, [
      makeOverride({
        id: 'ov-11',
        override_value: 3000000,
        created_at: '2026-06-03T10:00:00Z',
      }),
      makeOverride({
        id: 'ov-10',
        override_value: 2000000,
        created_at: '2026-06-01T10:00:00Z',
      }),
    ]);

    expect(result.rows[0].amount).toBe(3000000);
    expect(result.overridden[1].amount.overrideId).toBe('ov-11');
  });

  it('breaks created_at ties by id string order', () => {
    const rows = [makeRow({ id: 1 })];
    const result = applyOverrides('inv_transaction', rows, [
      makeOverride({ id: 'ov-z', override_value: 4000000 }),
      makeOverride({ id: 'ov-a', override_value: 3000000 }),
    ]);

    expect(result.rows[0].amount).toBe(4000000);
  });

  it('ignores overrides for other entity types', () => {
    const rows = [makeRow({ id: 1 })];
    const result = applyOverrides('inv_transaction', rows, [
      makeOverride({ id: 'ov-10', entity_type: 'inv_cap_table_snapshot' }),
    ]);

    expect(result.rows[0].amount).toBe(1000000);
    expect(result.overridden).toEqual({});
  });

  it('ignores overrides on fields not in the registry', () => {
    const rows = [makeRow({ id: 1 })];
    const result = applyOverrides('inv_transaction', rows, [
      makeOverride({
        id: 'ov-10',
        field_key: 'transaction_type',
        override_value: 'sale',
      }),
      makeOverride({
        id: 'ov-11',
        field_key: 'organization_id',
        override_value: 'org-evil',
      }),
    ]);

    expect(result.rows[0]).toEqual(makeRow({ id: 1 }));
    expect(result.overridden).toEqual({});
  });

  it('ignores override values violating the registry rule', () => {
    const rows = [makeRow({ id: 1 })];
    const result = applyOverrides('inv_transaction', rows, [
      makeOverride({ id: 'ov-10', override_value: 'not-a-number' }),
    ]);

    expect(result.rows[0].amount).toBe(1000000);
    expect(result.overridden).toEqual({});
  });

  it('produces no metadata for overrides targeting rows not present', () => {
    const rows = [makeRow({ id: 1 })];
    const result = applyOverrides('inv_transaction', rows, [
      makeOverride({ id: 'ov-10', entity_id: 999 }),
    ]);

    expect(result.rows).toEqual(rows);
    expect(result.overridden).toEqual({});
  });

  it('does not mutate input rows', () => {
    const rows = [makeRow({ id: 1 })];
    const snapshot = makeRow({ id: 1 });

    applyOverrides('inv_transaction', rows, [makeOverride({ id: 'ov-10' })]);

    expect(rows[0]).toEqual(snapshot);
  });

  it('merges snapshot valuation fields', () => {
    const snapshots = [
      { id: 7, implied_valuation: 50000000, our_fd_ownership_percent: 0.1 },
    ];
    const result = applyOverrides('inv_cap_table_snapshot', snapshots, [
      makeOverride({
        id: 'ov-20',
        entity_type: 'inv_cap_table_snapshot',
        entity_id: 7,
        field_key: 'implied_valuation',
        original_value: 50000000,
        override_value: 65000000,
      }),
    ]);

    expect(result.rows[0].implied_valuation).toBe(65000000);
    expect(result.overridden[7].implied_valuation.overrideValue).toBe(65000000);
  });
});
