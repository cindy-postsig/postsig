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
  selectUnallocatedContracts,
  summarizeUnallocated,
  unallocatedContractRows,
  type UnallocatedContractSource,
} from '@/lib/v2/cost-allocation/unallocated';

const ALLOCATED = 10;
const CHILD = 11;
const OWN = 12;
const INVOICE = 13;

const ctx = buildAllocationContext({
  allocations: [
    { id: 1, contract_id: ALLOCATED, product_id: null, mode: 'manual' },
  ],
  lines: [
    {
      id: 1,
      allocation_id: 1,
      org_unit_id: 2,
      org_employee_id: null,
      percent: 100,
    },
  ],
  units: [{ id: 2, level: 'department', name: 'Research', parent_id: null }],
  employees: [],
  seats: [],
  relationships: [
    {
      parent_contract_id: ALLOCATED,
      child_contract_id: CHILD,
      relationship_type: null,
    },
  ],
});

const contract = (id: number, typeId: number, totalContractValue: number) => ({
  id,
  vendor_name: 'Acme',
  totalContractValue,
  contract: { type_id: typeId, contract_types: { name: 'MSA' } },
});

const contracts = [
  contract(ALLOCATED, contractTypes.MSA, 1000),
  contract(CHILD, contractTypes.Addendum, 500),
  contract(OWN, contractTypes.MSA, 250),
  contract(INVOICE, contractTypes.Invoice, 75),
];

describe('selectUnallocatedContracts', () => {
  it('keeps only contracts nothing allocates, invoice records aside', () => {
    expect(selectUnallocatedContracts(contracts, ctx).map((c) => c.id)).toEqual(
      [OWN],
    );
  });

  it('drops an Exchange Agreement invoice too, not just type 6', () => {
    const eaInvoice = contract(14, contractTypes.EAINV, 40);

    expect(
      selectUnallocatedContracts([...contracts, eaInvoice], ctx).map(
        (c) => c.id,
      ),
    ).toEqual([OWN]);
  });
});

const source = (
  id: number,
  vendorName: string | null,
  orderNumber: string | null = null,
): UnallocatedContractSource => ({
  id,
  vendor_name: vendorName,
  contract: {
    type_id: contractTypes.MSA,
    contract_types: { name: 'MSA' },
    metadata: { lineage: { order_number: orderNumber } },
  },
});

describe('unallocatedContractRows', () => {
  it('names a contract by its order number, falling back to its type and id', () => {
    const untyped: UnallocatedContractSource = {
      id: 22,
      vendor_name: 'Acme',
      contract: { type_id: contractTypes.MSA },
    };

    const rows = unallocatedContractRows(
      [source(20, 'Acme', 'ORD-42'), source(21, 'Acme'), untyped],
      ctx,
      new Map(),
    );

    expect(new Map(rows.map((row) => [row.id, row.name]))).toEqual(
      new Map([
        [20, 'ORD-42'],
        [21, 'MSA · ID 21'],
        [22, 'Contract · ID 22'],
      ]),
    );
  });

  it('joins the window amount on by id, to cents, and leaves an unbooked contract null', () => {
    const rows = unallocatedContractRows(
      [source(20, 'Acme'), source(21, 'Acme')],
      ctx,
      new Map([[20, 1234.5678]]),
    );

    expect(new Map(rows.map((row) => [row.id, row.amount]))).toEqual(
      new Map([
        [20, 1234.57],
        [21, null],
      ]),
    );
  });

  it('sorts by vendor then name, a vendorless contract sorting first', () => {
    const rows = unallocatedContractRows(
      [
        source(30, 'Zylo'),
        source(31, 'Acme', 'B-2'),
        source(32, null),
        source(33, 'Acme', 'A-1'),
      ],
      ctx,
      new Map(),
    );

    expect(rows.map((row) => [row.vendor, row.name])).toEqual([
      [null, 'MSA · ID 32'],
      ['Acme', 'A-1'],
      ['Acme', 'B-2'],
      ['Zylo', 'MSA · ID 30'],
    ]);
  });

  it('takes the latest valid term end, ignoring malformed dates and timestamps past the day', () => {
    const withEnds = (
      id: number,
      term_end_date: unknown,
    ): UnallocatedContractSource => ({
      ...source(id, 'Acme'),
      contract: { ...source(id, 'Acme').contract, term_end_date },
    });

    const rows = unallocatedContractRows(
      [
        withEnds(40, [{ date: '2026-03-31' }, { date: '2027-06-30' }]),
        // A "9999-99-99" would win a plain string comparison and displace the
        // real latest end.
        withEnds(41, [{ date: '9999-99-99' }, { date: '2026-01-31' }]),
        withEnds(42, [{ date: '2026-05-31T23:00:00Z' }]),
        withEnds(43, [{ date: 12345 }, {}]),
        withEnds(44, null),
        withEnds(45, []),
      ],
      ctx,
      new Map(),
    );

    expect(new Map(rows.map((row) => [row.id, row.termEnd]))).toEqual(
      new Map([
        [40, '2027-06-30'],
        [41, '2026-01-31'],
        [42, '2026-05-31'],
        [43, null],
        [44, null],
        [45, null],
      ]),
    );
  });

  it('takes the earliest term start, and the first live product as the lead', () => {
    const contract: UnallocatedContractSource = {
      ...source(50, 'Acme'),
      products: [
        { product_id: 2, name: 'Retired', isSuperseded: true, sort_order: 1 },
        { product_id: 1, name: 'Terminal', isSuperseded: false, sort_order: 2 },
      ],
      contract: {
        ...source(50, 'Acme').contract,
        term_start_date: [{ date: '2026-04-01' }, { date: '2026-01-01' }],
      },
    };

    const [row] = unallocatedContractRows([contract], ctx, new Map());

    expect(row.termStart).toBe('2026-01-01');
    expect(row.product).toBe('Terminal');
    expect(row.products).toEqual([
      { id: 2, name: 'Retired' },
      { id: 1, name: 'Terminal' },
    ]);
  });
});

describe('summarizeUnallocated', () => {
  it("counts the same contracts and values them the way the dashboard's other items do", () => {
    expect(summarizeUnallocated(contracts, ctx)).toEqual({
      count: 1,
      totalValueInUSD: 250,
    });
  });

  it('reports nothing to set up when every contract is allocated', () => {
    expect(summarizeUnallocated([contracts[0], contracts[1]], ctx)).toEqual({
      count: 0,
      totalValueInUSD: 0,
    });
  });
});
