/**
 * In-memory stand-in for the service client covering the query surface the
 * cost-allocation context loader and save service use (same pattern as
 * __tests__/org-units/fake-db.ts, plus insert/delete and the dotted-path
 * filter the contract_users tenancy embed needs). Deleting an allocation
 * cascades its lines, mirroring the ON DELETE CASCADE FK.
 */
type Row = Record<string, unknown>;

const ORG = 'org-1';

function valueAt(row: Row, column: string): unknown {
  if (!column.includes('.')) return row[column];
  let value: unknown = row;
  for (const key of column.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Row)[key];
  }
  return value;
}

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private filters: ((row: Row) => boolean)[] = [];
  private mode: 'select' | 'update' | 'insert' | 'delete' = 'select';
  private patch: Row = {};
  private insertRows: Row[] = [];
  private ordering: { column: string; nullsFirst: boolean } | null = null;
  private rangeBounds: { from: number; to: number } | null = null;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select(_columns?: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => valueAt(row, column) === value);
    return this;
  }

  is(column: string, value: null) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    const wanted = new Set(values);
    this.filters.push((row) => wanted.has(row[column]));
    return this;
  }

  /** PostgREST `or` over `column.op.literal` clauses (`is`/`eq`; null and booleans). */
  or(expression: string) {
    const literal = (raw: string): unknown =>
      raw === 'null'
        ? null
        : raw === 'true'
          ? true
          : raw === 'false'
            ? false
            : raw;
    const alternatives = expression.split(',').map((clause) => {
      const [column, operator, ...rest] = clause.split('.');
      // Fail on shapes this fake does not model, so a future caller cannot
      // silently pass a wrong test (rowsOf's policy).
      if (rest.length === 0 || (operator !== 'is' && operator !== 'eq')) {
        throw new Error(`FakeDb or() cannot evaluate clause "${clause}"`);
      }
      const value = literal(rest.join('.'));
      return (row: Row) => valueAt(row, column) === value;
    });
    this.filters.push((row) => alternatives.some((matches) => matches(row)));
    return this;
  }

  order(column: string, options?: { nullsFirst?: boolean }) {
    this.ordering = { column, nullsFirst: options?.nullsFirst ?? false };
    return this;
  }

  range(from: number, to: number) {
    this.rangeBounds = { from, to };
    return this;
  }

  limit(count: number) {
    this.rangeBounds = { from: 0, to: count - 1 };
    return this;
  }

  update(patch: Row) {
    this.mode = 'update';
    this.patch = patch;
    return this;
  }

  insert(rows: Row | Row[]) {
    this.mode = 'insert';
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  maybeSingle(): Promise<{
    data: Row | null;
    error: { message: string } | null;
  }> {
    const { data } = this.execute();
    const rows = Array.isArray(data) ? (data as Row[]) : [];
    if (rows.length > 1) {
      return Promise.resolve({
        data: null,
        error: { message: `expected at most one row, got ${rows.length}` },
      });
    }
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  single(): Promise<{ data: Row | null; error: { message: string } | null }> {
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
    let rows = this.db
      .rowsOf(this.table)
      .filter((row) => this.filters.every((matches) => matches(row)));
    if (this.ordering) {
      const { column, nullsFirst } = this.ordering;
      rows = [...rows].sort((a, b) => {
        const left = a[column];
        const right = b[column];
        if (left === right) return 0;
        if (left === null) return nullsFirst ? -1 : 1;
        if (right === null) return nullsFirst ? 1 : -1;
        return (left as number) < (right as number) ? -1 : 1;
      });
    }
    if (this.rangeBounds) {
      rows = rows.slice(this.rangeBounds.from, this.rangeBounds.to + 1);
    }
    return rows;
  }

  private execute(): { data: unknown; error: null } {
    if (this.mode === 'update') {
      for (const row of this.matchingRows()) Object.assign(row, this.patch);
      return { data: null, error: null };
    }
    if (this.mode === 'insert') {
      const inserted = this.insertRows.map((row) =>
        this.db.insertRow(this.table, row),
      );
      return { data: inserted, error: null };
    }
    if (this.mode === 'delete') {
      const removed = new Set(this.matchingRows());
      this.db.tables[this.table] = this.db.tables[this.table].filter(
        (row) => !removed.has(row),
      );
      if (this.table === 'contract_cost_allocations') {
        const removedIds = new Set([...removed].map((row) => row.id));
        this.db.tables.contract_cost_allocation_lines =
          this.db.tables.contract_cost_allocation_lines.filter(
            (line) => !removedIds.has(line.allocation_id),
          );
      }
      return { data: null, error: null };
    }
    return { data: this.matchingRows(), error: null };
  }
}

export class FakeDb {
  tables: Record<string, Row[]> = {
    contract_cost_allocations: [],
    contract_cost_allocation_lines: [],
    org_units: [],
    org_employees: [],
    contract_users: [],
    cost_allocation_budgets: [],
    contract_relationships: [],
    vendor_products_details: [],
  };
  private seq = 1;

  client(): unknown {
    return { from: (table: string) => new FakeQuery(this, table) };
  }

  /** Names the missing fixture instead of failing inside the double. */
  rowsOf(table: string): Row[] {
    const rows = this.tables[table];
    if (!rows) {
      throw new Error(`FakeDb has no table "${table}"; seed it first`);
    }
    return rows;
  }

  insertRow(table: string, row: Row): Row {
    const created: Row = { id: this.seq++, ...row };
    this.rowsOf(table).push(created);
    return created;
  }

  seedUnit(level: string, name: string, parentId: number | null = null): Row {
    return this.insertRow('org_units', {
      organization_id: ORG,
      level,
      name,
      parent_id: parentId,
    });
  }

  seedEmployee(
    name: string,
    orgUnitId: number | null = null,
    costCenter: string | null = null,
    overrides: { status?: string; deleted_at?: string | null } = {},
  ): Row {
    const [first, ...rest] = name.split(' ');
    return this.insertRow('org_employees', {
      organization_id: ORG,
      first_name: first,
      last_name: rest.join(' '),
      org_unit_id: orgUnitId,
      cost_center: costCenter,
      status: 'active',
      deleted_at: null,
      ...overrides,
    });
  }

  seedBudget(
    target: { orgUnitId?: number; orgEmployeeId?: number },
    fiscalYear: number,
    amount: number,
  ): Row {
    return this.insertRow('cost_allocation_budgets', {
      organization_id: ORG,
      org_unit_id: target.orgUnitId ?? null,
      org_employee_id: target.orgEmployeeId ?? null,
      fiscal_year: fiscalYear,
      amount,
    });
  }

  /** A live hierarchy edge in this org; override for billing, disabled, inactive, or cross-org edges. */
  seedRelationship(
    parentContractId: number,
    childContractId: number,
    overrides: Row = {},
  ): Row {
    return this.insertRow('contract_relationships', {
      parent_contract_id: parentContractId,
      child_contract_id: childContractId,
      relationship_type: null,
      active: true,
      disabled: null,
      parent_contract: { organization_id: ORG },
      ...overrides,
    });
  }

  seedSeat(
    contractId: number,
    orgEmployeeId: number | null,
    productId: number | null = null,
    releasedAt: string | null = null,
  ): Row {
    return this.insertRow('contract_users', {
      contract_id: contractId,
      product_id: productId,
      org_employee_id: orgEmployeeId,
      released_at: releasedAt,
      contract: { organization_id: ORG },
    });
  }

  /** One vendor_products_details row: a product × year fee line on a contract. */
  seedProductDetail(
    contractId: number,
    product: { id: number; name: string },
    year = 1,
  ): Row {
    return this.insertRow('vendor_products_details', {
      contract_id: contractId,
      product_id: product.id,
      year,
      vendor_products: { id: product.id, name: product.name },
      contract: { organization_id: ORG },
    });
  }

  seedAllocation(
    contractId: number,
    mode: string,
    productId: number | null = null,
  ): Row {
    return this.insertRow('contract_cost_allocations', {
      organization_id: ORG,
      contract_id: contractId,
      product_id: productId,
      mode,
    });
  }

  seedLine(
    allocationId: number,
    target: { orgUnitId?: number; orgEmployeeId?: number },
    percent: number,
  ): Row {
    return this.insertRow('contract_cost_allocation_lines', {
      organization_id: ORG,
      allocation_id: allocationId,
      org_unit_id: target.orgUnitId ?? null,
      org_employee_id: target.orgEmployeeId ?? null,
      percent,
    });
  }
}

export const FAKE_ORG_ID = ORG;
