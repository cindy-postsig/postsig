import {
  computeImportDelta,
  type ExistingEmployeeState,
  type IncomingEmployeeRow,
} from '@/lib/v2/employee-import/delta';

let nextId = 1;

function existing(
  overrides: Partial<ExistingEmployeeState> = {},
): ExistingEmployeeState {
  return {
    id: nextId++,
    employee_id: 'EMP1',
    email: 'ada@acme.com',
    first_name: 'Ada',
    last_name: 'Lovelace',
    region: 'EMEA',
    country: 'UK',
    division: 'Global Markets',
    department: 'FX Trading',
    cost_center: 'CC-1049',
    business_unit: 'Sales & Distribution',
    entity: 'Acme Bank',
    team: 'FX Options',
    start_date: '2020-01-01',
    leave_date: null,
    status: 'active',
    ...overrides,
  };
}

function incoming(
  overrides: Partial<IncomingEmployeeRow> = {},
): IncomingEmployeeRow {
  return {
    employee_id: 'EMP1',
    email: 'ada@acme.com',
    first_name: 'Ada',
    last_name: 'Lovelace',
    region: 'EMEA',
    country: 'UK',
    division: 'Global Markets',
    department: 'FX Trading',
    cost_center: 'CC-1049',
    business_unit: 'Sales & Distribution',
    entity: 'Acme Bank',
    team: 'FX Options',
    start_date: '2020-01-01',
    leave_date: null,
    ...overrides,
  };
}

beforeEach(() => {
  nextId = 1;
});

describe('computeImportDelta', () => {
  it('reports no changes when the file matches the directory', () => {
    const delta = computeImportDelta([existing()], [incoming()]);

    expect(delta).toEqual({
      joiners: 0,
      leavers: 0,
      movers: 0,
      attributeChanges: 0,
      changes: [],
    });
  });

  it('classifies an unmatched file row as a joiner with its new position', () => {
    const delta = computeImportDelta(
      [existing()],
      [
        incoming(),
        incoming({
          employee_id: 'EMP2',
          email: 'grace@acme.com',
          first_name: 'Grace',
          last_name: 'Hopper',
          department: 'Rates Trading',
          team: 'Flow Rates',
        }),
      ],
    );

    expect(delta.joiners).toBe(1);
    expect(delta.leavers).toBe(0);
    expect(delta.changes).toEqual([
      {
        type: 'joiner',
        orgEmployeeId: null,
        employeeRef: 'EMP2',
        name: 'Grace Hopper',
        position: 'Acme Bank · Rates Trading · Flow Rates',
        fields: [],
      },
    ]);
  });

  it('classifies a directory row missing from the file as a leaver', () => {
    const gone = existing({
      id: 99,
      employee_id: 'EMP9',
      email: 'gone@acme.com',
      first_name: 'Gone',
      last_name: 'Person',
    });
    const delta = computeImportDelta([existing(), gone], [incoming()]);

    expect(delta.leavers).toBe(1);
    expect(delta.changes).toEqual([
      {
        type: 'leaver',
        orgEmployeeId: 99,
        employeeRef: 'EMP9',
        name: 'Gone Person',
        position: 'Acme Bank · FX Trading · FX Options',
        fields: [],
      },
    ]);
  });

  it('classifies an org-placement change as a mover with old → new fields', () => {
    const delta = computeImportDelta(
      [existing()],
      [incoming({ team: 'Spot FX', region: 'APAC' })],
    );

    expect(delta.movers).toBe(1);
    expect(delta.attributeChanges).toBe(0);
    expect(delta.changes).toHaveLength(1);
    const [change] = delta.changes;
    expect(change.type).toBe('mover');
    expect(change.orgEmployeeId).toBe(1);
    expect(change.fields).toEqual([
      { field: 'team', from: 'FX Options', to: 'Spot FX' },
      { field: 'region', from: 'EMEA', to: 'APAC' },
    ]);
  });

  it('classifies a non-placement change as an attribute change', () => {
    const delta = computeImportDelta(
      [existing()],
      [incoming({ leave_date: '2026-10-01' })],
    );

    expect(delta.movers).toBe(0);
    expect(delta.attributeChanges).toBe(1);
    expect(delta.changes[0].type).toBe('attribute');
    expect(delta.changes[0].fields).toEqual([
      { field: 'leave_date', from: null, to: '2026-10-01' },
    ]);
  });

  it('matches by employee_id first, reporting an email change instead of a leaver/joiner pair', () => {
    const delta = computeImportDelta(
      [existing()],
      [incoming({ email: 'ada.lovelace@acme.com' })],
    );

    expect(delta.joiners).toBe(0);
    expect(delta.leavers).toBe(0);
    expect(delta.changes[0].fields).toEqual([
      {
        field: 'email',
        from: 'ada@acme.com',
        to: 'ada.lovelace@acme.com',
      },
    ]);
  });

  it('matches by email case-insensitively when the file has no employee_id', () => {
    const delta = computeImportDelta(
      [existing()],
      [incoming({ employee_id: null, email: 'ADA@ACME.COM' })],
    );

    expect(delta.joiners).toBe(0);
    expect(delta.leavers).toBe(0);
    // The employee_id was dropped by the file, which is an attribute change;
    // the case-only email difference is not.
    expect(delta.changes[0].fields).toEqual([
      { field: 'employee_id', from: 'EMP1', to: null },
    ]);
  });

  it('falls back to name matching only when both sides lack identifiers', () => {
    const noIds = existing({ employee_id: null, email: null });
    const matchedByName = computeImportDelta(
      [noIds],
      [incoming({ employee_id: null, email: null, team: 'Spot FX' })],
    );
    expect(matchedByName.joiners).toBe(0);
    expect(matchedByName.movers).toBe(1);

    // Same name, but the directory row has an email: the file row cannot claim
    // it, mirroring the import's own matching.
    const notMatched = computeImportDelta(
      [existing()],
      [incoming({ employee_id: null, email: null })],
    );
    expect(notMatched.joiners).toBe(1);
    expect(notMatched.leavers).toBe(1);
  });

  it('skips the status comparison when the file has no status column', () => {
    const delta = computeImportDelta(
      [existing({ status: 'on_leave' })],
      [incoming()],
    );

    expect(delta.changes).toEqual([]);
  });

  it('reports a status change when the file provides one', () => {
    const delta = computeImportDelta(
      [existing()],
      [incoming({ status: 'inactive' })],
    );

    expect(delta.attributeChanges).toBe(1);
    expect(delta.changes[0].fields).toEqual([
      { field: 'status', from: 'active', to: 'inactive' },
    ]);
  });

  it('ignores duplicate file rows for the same employee and duplicate joiners', () => {
    const delta = computeImportDelta(
      [existing()],
      [
        incoming({ team: 'Spot FX' }),
        incoming({ team: 'Delta One' }),
        incoming({ employee_id: 'EMP2', email: 'new@acme.com' }),
        incoming({ employee_id: 'EMP2', email: 'new@acme.com' }),
      ],
    );

    expect(delta.movers).toBe(1);
    expect(delta.joiners).toBe(1);
    expect(delta.changes.filter((c) => c.type === 'mover')).toHaveLength(1);
    expect(delta.changes[0].fields).toEqual([
      { field: 'team', from: 'FX Options', to: 'Spot FX' },
    ]);
  });
});
