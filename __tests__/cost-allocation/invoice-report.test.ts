jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { contractTypes } from '@/app/lib/constants';
import { buildAllocationContext } from '@/lib/v2/cost-allocation/context';
import {
  buildInvoiceReportRows,
  invoiceBillingDate,
  type InvoiceReportSource,
} from '@/lib/v2/cost-allocation/invoice-report';
import {
  filterInvoiceReportRows,
  invoiceReportTargetOptions,
  invoiceReportTargetTotals,
  invoiceReportTotalAmount,
  invoiceReportVendorOptions,
  sortInvoiceReportRows,
  type InvoiceReportRow,
} from '@/lib/v2/cost-allocation/invoice-report-rows';
import { targetPath } from '@/lib/v2/cost-allocation/target-path';
import type { OrgUnitNode } from '@/lib/v2/org-units/tree';

const MSA = 100;
const INHERITING = 300;
const OVERRIDDEN = 301;
const UNASSIGNED = 302;
const UNDATED = 303;
const OUTSIDE = 304;
const UNSTAMPED = 305;

const ENTITY = 1;
const GROUP = 2;
const RESEARCH = 3;
const COST_CENTER = 4;
const ADA = 9;
const OUTSIDE_TREE = 10;

const AUGUST = { start: '2026-08-01', end: '2026-09-01' };

function context(extraUnits: OrgUnitNode[] = []) {
  return buildAllocationContext({
    allocations: [
      { id: 1, contract_id: MSA, product_id: null, mode: 'manual' },
      { id: 2, contract_id: OVERRIDDEN, product_id: null, mode: 'manual' },
    ],
    lines: [
      {
        id: 1,
        allocation_id: 1,
        org_unit_id: RESEARCH,
        org_employee_id: null,
        percent: 60,
      },
      {
        id: 2,
        allocation_id: 1,
        org_unit_id: null,
        org_employee_id: ADA,
        percent: 40,
      },
      {
        id: 3,
        allocation_id: 2,
        org_unit_id: COST_CENTER,
        org_employee_id: null,
        percent: 100,
      },
    ],
    units: [
      { id: ENTITY, level: 'entity', name: 'Bank', parent_id: null },
      {
        id: GROUP,
        level: 'business_group',
        name: 'Global Equities',
        parent_id: ENTITY,
      },
      { id: RESEARCH, level: 'department', name: 'Research', parent_id: GROUP },
      {
        id: COST_CENTER,
        level: 'cost_center',
        name: '70133 - Sales',
        parent_id: null,
      },
      ...extraUnits,
    ],
    employees: [
      {
        id: ADA,
        name: 'Ada Lovelace',
        status: 'active',
        deleted_at: null,
        org_unit_id: RESEARCH,
      },
      {
        id: OUTSIDE_TREE,
        name: 'Bob Outside',
        status: 'active',
        deleted_at: null,
        org_unit_id: null,
      },
    ],
    seats: [],
    relationships: [
      { parent_contract_id: MSA, child_contract_id: INHERITING },
      { parent_contract_id: MSA, child_contract_id: UNSTAMPED },
    ],
  });
}

function invoice(
  id: number,
  overrides: Partial<InvoiceReportSource> & {
    termStart?: string | null;
    executionDate?: string | null;
    orderNumber?: string;
    recordedBase?: number | null;
    fees?: { product_id: number; fees: number }[];
  } = {},
): InvoiceReportSource {
  const {
    termStart = '2026-08-10',
    executionDate = null,
    orderNumber = `INV-${id}`,
    recordedBase = 1000,
    // An invoice with a recorded amount has the fee row it came from.
    fees = recordedBase === null
      ? undefined
      : [{ product_id: 7, fees: recordedBase }],
    ...rest
  } = overrides;
  return {
    id,
    vendor_name: 'Bloomberg',
    vendor_domain: 'bloomberg.com',
    products: [
      {
        product_id: 7,
        name: 'Terminal',
        isSuperseded: false,
        sort_order: 1,
      },
    ],
    contract: {
      type_id: contractTypes.Invoice,
      execution_date: executionDate,
      term_start_date: termStart === null ? null : [{ date: termStart }],
      contract_types: { name: 'Invoice' },
      metadata: { lineage: { order_number: orderNumber } },
      vendor_products_details: fees,
    },
    engineSpend:
      recordedBase === null
        ? undefined
        : {
            currentBase: 0,
            projectedBase: 0,
            currentNative: 0,
            projectedNative: 0,
            recordedBase,
            recordedNative: recordedBase,
          },
    ...rest,
  };
}

const msa: InvoiceReportSource = {
  id: MSA,
  vendor_name: 'Bloomberg',
  vendor_domain: 'bloomberg.com',
  products: [
    { product_id: 7, name: 'Terminal', isSuperseded: false, sort_order: 1 },
  ],
  contract: {
    type_id: contractTypes.MSA,
    term_start_date: [{ date: '2026-01-01' }],
    contract_types: { name: 'MSA' },
    metadata: { lineage: { order_number: 'MSA-2026-001' } },
  },
  engineSpend: {
    currentBase: 12000,
    projectedBase: 12000,
    currentNative: 12000,
    projectedNative: 12000,
  },
};

function buildFixture(ctx = context()) {
  return buildInvoiceReportRows(
    [
      msa,
      invoice(INHERITING),
      invoice(OVERRIDDEN, { recordedBase: 500 }),
      invoice(UNASSIGNED, { vendor_name: 'FactSet', recordedBase: 250 }),
      invoice(UNDATED, { termStart: null }),
      invoice(OUTSIDE, { termStart: '2026-07-31' }),
      invoice(UNSTAMPED, { recordedBase: null }),
    ],
    AUGUST,
    ctx,
  );
}

const rowById = (rows: InvoiceReportRow[], id: number) => {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`row ${id} missing`);
  return row;
};

describe('invoiceBillingDate', () => {
  it("books from the earliest billing-period start, the engine's anchor", () => {
    expect(
      invoiceBillingDate({
        execution_date: '2026-09-15',
        term_start_date: [{ date: '2026-08-10' }, { date: '2026-07-01' }],
      }),
    ).toBe('2026-07-01');
  });

  it('falls back to the invoice date when no billing period was extracted', () => {
    expect(
      invoiceBillingDate({ execution_date: '2026-09-15', term_start_date: [] }),
    ).toBe('2026-09-15');
    expect(
      invoiceBillingDate({
        execution_date: '2026-09-15',
        term_start_date: null,
      }),
    ).toBe('2026-09-15');
  });

  it('is null with no date at all', () => {
    expect(invoiceBillingDate({ term_start_date: [{ date: 'garbage' }] })).toBe(
      null,
    );
    expect(invoiceBillingDate({})).toBe(null);
  });
});

describe('buildInvoiceReportRows', () => {
  it('lists only invoice-type contracts dated inside the window', () => {
    const { rows, undatedCount } = buildFixture();

    expect(rows.map((r) => r.id).sort()).toEqual([
      INHERITING,
      OVERRIDDEN,
      UNASSIGNED,
      UNSTAMPED,
    ]);
    expect(undatedCount).toBe(1);
  });

  it("reads the engine's recorded amount and splits it by percent", () => {
    const row = rowById(buildFixture().rows, INHERITING);

    expect(row.amount).toBe(1000);
    expect(row.targets).toEqual([
      expect.objectContaining({
        key: 'org_unit:3',
        name: 'Research',
        typeLabel: 'Department',
        percent: 60,
        amount: 600,
        productId: null,
      }),
      expect.objectContaining({
        key: 'employee:9',
        name: 'Ada Lovelace',
        typeLabel: 'User',
        percent: 40,
        amount: 400,
      }),
    ]);
  });

  it('carries provenance, the source contract, and the linked parent', () => {
    const { rows } = buildFixture();

    const inherited = rowById(rows, INHERITING);
    expect(inherited.provenance).toEqual({
      kind: 'inherited',
      sourceContractId: MSA,
    });
    expect(inherited.sourceContract).toEqual({
      id: MSA,
      label: 'MSA-2026-001',
    });
    expect(inherited.parentContract).toEqual({
      id: MSA,
      label: 'MSA-2026-001',
    });

    const overridden = rowById(rows, OVERRIDDEN);
    expect(overridden.provenance).toEqual({ kind: 'own' });
    expect(overridden.sourceContract).toBeNull();
    expect(overridden.parentContract).toBeNull();
    expect(overridden.targets).toEqual([
      expect.objectContaining({
        name: '70133 - Sales',
        typeLabel: 'Cost Center',
        percent: 100,
        amount: 500,
      }),
    ]);
  });

  it('leaves an unallocated invoice with no targets and no source', () => {
    const row = rowById(buildFixture().rows, UNASSIGNED);

    expect(row.provenance).toEqual({ kind: 'none' });
    expect(row.targets).toEqual([]);
    expect(row.sourceContract).toBeNull();
  });

  it('renders no amount, never zero, for an invoice absent from the engine set', () => {
    const row = rowById(buildFixture().rows, UNSTAMPED);

    expect(row.amount).toBeNull();
    expect(row.targets.map((t) => t.amount)).toEqual([null, null]);
    expect(row.targets.map((t) => t.percent)).toEqual([60, 40]);
  });

  it('reads the invoice number, vendor, and first product', () => {
    const row = rowById(buildFixture().rows, INHERITING);

    expect(row.invoiceNumber).toBe('INV-300');
    expect(row.vendor).toBe('Bloomberg');
    expect(row.vendorDomain).toBe('bloomberg.com');
    expect(row.product).toBe('Terminal');
    expect(row.products).toEqual([{ id: 7, name: 'Terminal' }]);
    expect(row.billingDate).toBe('2026-08-10');
  });

  it('labels a parent without an order number by type and id', () => {
    const { rows } = buildInvoiceReportRows(
      [
        {
          ...msa,
          contract: { ...msa.contract, metadata: { lineage: {} } },
        },
        invoice(INHERITING),
      ],
      AUGUST,
      context(),
    );

    expect(rowById(rows, INHERITING).parentContract).toEqual({
      id: MSA,
      label: 'MSA · ID 100',
    });
  });

  it("prices product-scoped lines from the invoice's recorded fees at its recorded rate", () => {
    const ctx = buildAllocationContext({
      allocations: [
        { id: 1, contract_id: INHERITING, product_id: 7, mode: 'manual' },
      ],
      lines: [
        {
          id: 1,
          allocation_id: 1,
          org_unit_id: RESEARCH,
          org_employee_id: null,
          percent: 50,
        },
      ],
      units: [
        {
          id: RESEARCH,
          level: 'department',
          name: 'Research',
          parent_id: null,
        },
      ],
      employees: [],
      seats: [],
      relationships: [],
    });
    const { rows } = buildInvoiceReportRows(
      [
        invoice(INHERITING, {
          fees: [{ product_id: 7, fees: 1000 }],
          engineSpend: {
            currentBase: 900,
            projectedBase: 0,
            currentNative: 1000,
            projectedNative: 0,
            recordedBase: 900,
            recordedNative: 1000,
            products: { 7: { currentNative: 1000, projectedNative: 0 } },
          },
        }),
      ],
      AUGUST,
      ctx,
    );

    expect(rowById(rows, INHERITING).targets).toEqual([
      expect.objectContaining({
        productId: 7,
        productName: 'Terminal',
        percent: 50,
        amount: 450,
      }),
    ]);
  });

  it('values a past-window invoice inheriting a product-scoped allocation and feeds the target totals', () => {
    const ctx = buildAllocationContext({
      allocations: [{ id: 1, contract_id: MSA, product_id: 7, mode: 'manual' }],
      lines: [
        {
          id: 1,
          allocation_id: 1,
          org_unit_id: RESEARCH,
          org_employee_id: null,
          percent: 50,
        },
      ],
      units: [
        {
          id: RESEARCH,
          level: 'department',
          name: 'Research',
          parent_id: null,
        },
      ],
      employees: [],
      seats: [],
      relationships: [
        { parent_contract_id: MSA, child_contract_id: INHERITING },
      ],
    });
    // The fixture invoice's windowed stamps are zero: it contributed nothing
    // to the engine's current fiscal window, the shape of every past invoice.
    const { rows } = buildInvoiceReportRows(
      [msa, invoice(INHERITING, { fees: [{ product_id: 7, fees: 1000 }] })],
      AUGUST,
      ctx,
    );

    const row = rowById(rows, INHERITING);
    expect(row.provenance).toEqual({
      kind: 'inherited',
      sourceContractId: MSA,
    });
    expect(row.targets).toEqual([
      expect.objectContaining({ productId: 7, percent: 50, amount: 500 }),
    ]);
    expect(invoiceReportTargetTotals(rows)).toEqual([
      {
        key: 'org_unit:3',
        name: 'Research',
        typeLabel: 'Department',
        amount: 500,
      },
    ]);
  });
});

describe('buildInvoiceReportRows inherited product scopes', () => {
  it("lists only the scopes for products the invoice bills — a parent-only product never appears as 'Product #'", () => {
    const ctx = buildAllocationContext({
      allocations: [
        { id: 1, contract_id: MSA, product_id: 7, mode: 'manual' },
        { id: 2, contract_id: MSA, product_id: 8, mode: 'manual' },
      ],
      lines: [
        {
          id: 1,
          allocation_id: 1,
          org_unit_id: RESEARCH,
          org_employee_id: null,
          percent: 100,
        },
        {
          id: 2,
          allocation_id: 2,
          org_unit_id: RESEARCH,
          org_employee_id: null,
          percent: 100,
        },
      ],
      units: [
        {
          id: RESEARCH,
          level: 'department',
          name: 'Research',
          parent_id: null,
        },
      ],
      employees: [],
      seats: [],
      relationships: [
        { parent_contract_id: MSA, child_contract_id: INHERITING },
      ],
    });
    const { rows } = buildInvoiceReportRows(
      [msa, invoice(INHERITING)],
      AUGUST,
      ctx,
    );

    const row = rowById(rows, INHERITING);
    expect(row.provenance).toEqual({
      kind: 'inherited',
      sourceContractId: MSA,
    });
    expect(row.targets).toEqual([
      expect.objectContaining({
        productId: 7,
        productName: 'Terminal',
        amount: 1000,
      }),
    ]);
  });
});

describe('buildInvoiceReportRows scope presence', () => {
  it('keeps hasScope for an applicable scope with no lines, and clears it when no scope applies', () => {
    const active = buildAllocationContext({
      allocations: [
        { id: 1, contract_id: MSA, product_id: null, mode: 'active_users' },
      ],
      lines: [],
      units: [],
      employees: [],
      seats: [],
      relationships: [
        { parent_contract_id: MSA, child_contract_id: INHERITING },
      ],
    });
    const withActive = buildInvoiceReportRows(
      [msa, invoice(INHERITING)],
      AUGUST,
      active,
    ).rows;
    expect(rowById(withActive, INHERITING)).toEqual(
      expect.objectContaining({ hasScope: true, targets: [] }),
    );

    const parentOnlyProduct = buildAllocationContext({
      allocations: [{ id: 1, contract_id: MSA, product_id: 8, mode: 'manual' }],
      lines: [
        {
          id: 1,
          allocation_id: 1,
          org_unit_id: RESEARCH,
          org_employee_id: null,
          percent: 100,
        },
      ],
      units: [
        {
          id: RESEARCH,
          level: 'department',
          name: 'Research',
          parent_id: null,
        },
      ],
      employees: [],
      seats: [],
      relationships: [
        { parent_contract_id: MSA, child_contract_id: INHERITING },
      ],
    });
    const withoutScope = buildInvoiceReportRows(
      [msa, invoice(INHERITING)],
      AUGUST,
      parentOnlyProduct,
    ).rows;
    expect(rowById(withoutScope, INHERITING)).toEqual(
      expect.objectContaining({
        hasScope: false,
        targets: [],
        provenance: { kind: 'inherited', sourceContractId: MSA },
      }),
    );

    expect(rowById(buildFixture().rows, UNASSIGNED).hasScope).toBe(false);
  });
});

describe('buildInvoiceReportRows zero and missing fees', () => {
  const productScopedOnParent = () =>
    buildAllocationContext({
      allocations: [{ id: 1, contract_id: MSA, product_id: 7, mode: 'manual' }],
      lines: [
        {
          id: 1,
          allocation_id: 1,
          org_unit_id: RESEARCH,
          org_employee_id: null,
          percent: 50,
        },
      ],
      units: [
        {
          id: RESEARCH,
          level: 'department',
          name: 'Research',
          parent_id: null,
        },
      ],
      employees: [],
      seats: [],
      relationships: [
        { parent_contract_id: MSA, child_contract_id: INHERITING },
      ],
    });

  it('values a recorded-zero invoice at zero, never blank', () => {
    const { rows } = buildInvoiceReportRows(
      [
        msa,
        invoice(INHERITING, {
          recordedBase: 0,
          fees: [{ product_id: 7, fees: 0 }],
        }),
      ],
      AUGUST,
      productScopedOnParent(),
    );

    const row = rowById(rows, INHERITING);
    expect(row.amount).toBe(0);
    expect(row.targets).toEqual([
      expect.objectContaining({ productId: 7, percent: 50, amount: 0 }),
    ]);
  });

  it('renders no amount, never zero, for an invoice in the set with no fee recorded', () => {
    const { rows } = buildInvoiceReportRows(
      [msa, invoice(INHERITING, { recordedBase: 0, fees: [] })],
      AUGUST,
      productScopedOnParent(),
    );

    const row = rowById(rows, INHERITING);
    expect(row.amount).toBeNull();
    expect(row.targets.map((t) => t.amount)).toEqual([null]);
  });
});

describe('filterInvoiceReportRows', () => {
  it('matches explicit line targets — inherited lines count', () => {
    const { rows } = buildFixture();

    const research = filterInvoiceReportRows(rows, {
      targetKeys: ['org_unit:3'],
      vendors: [],
    });
    expect(research.map((r) => r.id).sort()).toEqual([INHERITING, UNSTAMPED]);
  });

  it("never matches through an employee's cost-center attribute or a parent node", () => {
    const { rows } = buildFixture();

    expect(
      filterInvoiceReportRows(rows, {
        targetKeys: ['org_unit:2'],
        vendors: [],
      }),
    ).toEqual([]);
    expect(
      filterInvoiceReportRows(rows, {
        targetKeys: ['org_unit:4'],
        vendors: [],
      }).map((r) => r.id),
    ).toEqual([OVERRIDDEN]);
  });

  it('combines the vendor filter with the target filter', () => {
    const { rows } = buildFixture();

    expect(
      filterInvoiceReportRows(rows, {
        targetKeys: [],
        vendors: ['FactSet'],
      }).map((r) => r.id),
    ).toEqual([UNASSIGNED]);
    expect(
      filterInvoiceReportRows(rows, {
        targetKeys: ['org_unit:3'],
        vendors: ['FactSet'],
      }),
    ).toEqual([]);
  });
});

describe('report options and totals', () => {
  it('offers each distinct target once, disambiguating shared names by type', () => {
    const { rows } = buildFixture();
    const twin: InvoiceReportRow = {
      ...rowById(rows, OVERRIDDEN),
      id: 999,
      targets: [
        {
          key: 'employee:11',
          name: 'Research',
          typeLabel: 'User',
          percent: 100,
          amount: 1,
          productId: null,
          productName: null,
        },
      ],
    };

    expect(invoiceReportTargetOptions([...rows, twin])).toEqual([
      { value: 'org_unit:4', label: '70133 - Sales' },
      { value: 'employee:9', label: 'Ada Lovelace' },
      { value: 'org_unit:3', label: 'Research (Department)' },
      { value: 'employee:11', label: 'Research (User)' },
    ]);
    expect(invoiceReportVendorOptions(rows)).toEqual([
      { value: 'Bloomberg', label: 'Bloomberg' },
      { value: 'FactSet', label: 'FactSet' },
    ]);
  });

  it('names a target by its parents when another org unit at the level shares its name', () => {
    const plain = buildFixture();
    expect(
      rowById(plain.rows, INHERITING).targets[0].breadcrumb,
    ).toBeUndefined();

    const twinned = buildFixture(
      context([
        {
          id: 5,
          level: 'business_group',
          name: 'Global Macro',
          parent_id: ENTITY,
        },
        { id: 6, level: 'department', name: 'Research', parent_id: 5 },
      ]),
    );
    const research = rowById(twinned.rows, INHERITING).targets[0];
    expect(research).toMatchObject({
      name: 'Research',
      breadcrumb: 'Global Equities · Bank',
    });
    // The parents do the disambiguating, so the type is not appended.
    expect(invoiceReportTargetOptions(twinned.rows)).toContainEqual({
      value: 'org_unit:3',
      label: 'Research · Global Equities · Bank',
    });
    expect(invoiceReportTargetTotals(twinned.rows)[0]).toMatchObject({
      key: 'org_unit:3',
      breadcrumb: 'Global Equities · Bank',
    });
  });

  it('sums engine-valued spend per target, largest first, skipping unvalued rows', () => {
    const { rows } = buildFixture();

    expect(invoiceReportTargetTotals(rows)).toEqual([
      {
        key: 'org_unit:3',
        name: 'Research',
        typeLabel: 'Department',
        amount: 600,
      },
      {
        key: 'org_unit:4',
        name: '70133 - Sales',
        typeLabel: 'Cost Center',
        amount: 500,
      },
      {
        key: 'employee:9',
        name: 'Ada Lovelace',
        typeLabel: 'User',
        amount: 400,
      },
    ]);
    expect(invoiceReportTotalAmount(rows)).toBe(1750);
  });

  it('sorts by amount with unvalued rows last in either direction', () => {
    const { rows } = buildFixture();

    expect(
      sortInvoiceReportRows(rows, 'amount', 'desc').map((r) => r.id),
    ).toEqual([INHERITING, OVERRIDDEN, UNASSIGNED, UNSTAMPED]);
    expect(
      sortInvoiceReportRows(rows, 'amount', 'asc').map((r) => r.id),
    ).toEqual([UNASSIGNED, OVERRIDDEN, INHERITING, UNSTAMPED]);
    expect(sortInvoiceReportRows(rows, 'vendor', 'asc')[0].vendor).toBe(
      'Bloomberg',
    );
    expect(sortInvoiceReportRows(rows, 'vendor', 'desc')[0].vendor).toBe(
      'FactSet',
    );
  });

  it('collates invoice numbers numerically', () => {
    const { rows } = buildFixture();
    const numbered = rows.map((row, i) => ({
      ...row,
      invoiceNumber: ['INV-10', 'INV-9', 'INV-100', 'INV-1'][i],
    }));

    expect(
      sortInvoiceReportRows(numbered, 'invoiceNumber', 'asc').map(
        (r) => r.invoiceNumber,
      ),
    ).toEqual(['INV-1', 'INV-9', 'INV-10', 'INV-100']);
  });
});

describe('targetPath', () => {
  it('walks a unit root-first and an employee to the unit they sit under', () => {
    const { unitsById } = context();

    expect(
      targetPath(
        { kind: 'org_unit', id: RESEARCH, name: 'Research' },
        unitsById,
      ),
    ).toEqual(['Bank', 'Global Equities', 'Research']);
    expect(
      targetPath(
        { kind: 'org_unit', id: COST_CENTER, name: '70133 - Sales' },
        unitsById,
      ),
    ).toEqual(['70133 - Sales']);
    expect(
      targetPath(
        {
          kind: 'employee',
          id: ADA,
          name: 'Ada Lovelace',
          orgUnitId: RESEARCH,
        },
        unitsById,
      ),
    ).toEqual(['Bank', 'Global Equities', 'Research']);
    expect(
      targetPath(
        { kind: 'employee', id: OUTSIDE_TREE, name: 'Bob', orgUnitId: null },
        unitsById,
      ),
    ).toEqual([]);
  });
});
