/**
 * In-memory stand-in for the service client covering the query surface the
 * org-units sync uses, including the nulls-not-distinct conflict semantics of
 * org_units_path_unique so upsert behavior matches the real constraint.
 */
type Row = Record<string, unknown>;

const ORG = 'org-1';

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private filters: ((row: Row) => boolean)[] = [];
  private mode: 'select' | 'update' | 'upsert' = 'select';
  private patch: Row = {};
  private upsertRows: Row[] = [];
  private orderColumn: string | null = null;
  private limitCount: number | null = null;
  private rangeBounds: { from: number; to: number } | null = null;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select(_columns?: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column: string, value: null) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  not(column: string, _operator: 'is', _value: null) {
    this.filters.push((row) => row[column] !== null);
    return this;
  }

  in(column: string, values: unknown[]) {
    const wanted = new Set(values);
    this.filters.push((row) => wanted.has(row[column]));
    return this;
  }

  order(column: string) {
    this.orderColumn = column;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.rangeBounds = { from, to };
    return this;
  }

  update(patch: Row) {
    this.mode = 'update';
    this.patch = patch;
    return this;
  }

  upsert(rows: Row | Row[], _options?: { onConflict?: string }) {
    this.mode = 'upsert';
    this.upsertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  maybeSingle(): Promise<{ data: Row | null; error: null }> {
    const rows = this.matchingRows();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  single(): Promise<{
    data: Row | null;
    error: { message: string } | null;
  }> {
    const { data } = this.execute();
    const rows = Array.isArray(data) ? (data as Row[]) : [];
    if (rows.length !== 1) {
      return Promise.resolve({
        data: null,
        error: { message: `expected exactly one row, got ${rows.length}` },
      });
    }
    return Promise.resolve({ data: rows[0], error: null });
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onFulfilled?:
      | ((value: {
          data: unknown;
          error: null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  private matchingRows(): Row[] {
    let rows = this.db.tables[this.table].filter((row) =>
      this.filters.every((matches) => matches(row)),
    );
    if (this.orderColumn) {
      const column = this.orderColumn;
      rows = [...rows].sort((a, b) =>
        (a[column] as number) < (b[column] as number) ? -1 : 1,
      );
    }
    if (this.rangeBounds) {
      rows = rows.slice(this.rangeBounds.from, this.rangeBounds.to + 1);
    }
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return rows;
  }

  private execute(): { data: unknown; error: null } {
    if (this.mode === 'update') {
      for (const row of this.matchingRows()) Object.assign(row, this.patch);
      return { data: null, error: null };
    }
    if (this.mode === 'upsert') {
      if (this.table !== 'org_units') {
        throw new Error(`fake upsert not implemented for ${this.table}`);
      }
      return {
        data: this.upsertRows.map((row) => this.db.upsertUnit(row)),
        error: null,
      };
    }
    return { data: this.matchingRows(), error: null };
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {
    org_units: [],
    org_employees: [],
    groups: [],
    org_preferences: [],
  };
  private unitSeq = 1;
  private employeeSeq = 1;

  get orgUnits() {
    return this.tables.org_units;
  }
  get orgEmployees() {
    return this.tables.org_employees;
  }

  client(): unknown {
    return { from: (table: string) => new FakeQuery(this, table) };
  }

  seedEmployee(overrides: Row = {}): Row {
    const row: Row = {
      id: this.employeeSeq++,
      organization_id: ORG,
      deleted_at: null,
      status: 'active',
      entity: null,
      division: null,
      business_unit: null,
      department: null,
      team: null,
      cost_center: null,
      group_id: null,
      org_unit_id: null,
      ...overrides,
    };
    this.tables.org_employees.push(row);
    return row;
  }

  seedGroup(id: number, name: string): void {
    this.tables.groups.push({ id, name, organization_id: ORG });
  }

  setHierarchyLevels(value: unknown): void {
    this.tables.org_preferences.push({
      organization_id: ORG,
      preference_key: 'employees.hierarchy_levels',
      preference_value: value,
    });
  }

  upsertUnit(row: Row): Row {
    const existing = this.tables.org_units.find(
      (unit) =>
        unit.organization_id === row.organization_id &&
        unit.parent_id === row.parent_id &&
        unit.level === row.level &&
        unit.name === row.name,
    );
    if (existing) return existing;
    const created: Row = { id: this.unitSeq++, ...row };
    this.tables.org_units.push(created);
    return created;
  }

  findUnit(level: string, name: string, parentId?: number | null): Row {
    const matches = this.tables.org_units.filter(
      (unit) =>
        unit.level === level &&
        unit.name === name &&
        (parentId === undefined || unit.parent_id === parentId),
    );
    if (matches.length !== 1) {
      throw new Error(
        `expected exactly one ${level} "${name}" node, found ${matches.length}`,
      );
    }
    return matches[0];
  }
}

export const FAKE_ORG_ID = ORG;
