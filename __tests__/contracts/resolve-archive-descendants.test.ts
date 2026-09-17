import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { contractTypes } from '@/app/lib/constants';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

interface MockRelationship {
  parent_contract_id: number | null;
  child_contract_id: number | null;
  relationship_type?: string | null;
}
interface MockContractRow {
  id: number;
  type_id: number;
  status?: string;
  metadata?: { lineage?: { order_number?: unknown } } | null;
  vendors?: { name: string | null } | null;
  contract_types?: { name: string | null } | null;
}

let mockRelationships: MockRelationship[] = [];
let mockContractRows: MockContractRow[] = [];

jest.mock('@/data/superuser/contracts', () => ({
  fetchAllRelationshipsForOrg: jest.fn(async () => mockRelationships),
}));

// `.in(...)` is chained with `.neq('status', 'inactive')` by the archive
// resolver and with `.eq('status', 'inactive')` by the inactive resolver.
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        in: (_column: string, ids: number[]) => {
          const rows = mockContractRows.filter((row) => ids.includes(row.id));
          const resolveWith = (predicate: (row: MockContractRow) => boolean) =>
            Promise.resolve({ data: rows.filter(predicate), error: null });
          return {
            eq: (_col: string, value: string) =>
              resolveWith((row) => row.status === value),
            neq: (_col: string, value: string) =>
              resolveWith((row) => row.status !== value),
          };
        },
      }),
    }),
  }),
}));

import {
  buildArchiveIdSet,
  resolveArchiveDescendants,
  resolveInactiveDescendants,
} from '@/lib/v2/contracts/archive';

const ORG = 'org-1';

describe('resolveArchiveDescendants', () => {
  beforeEach(() => {
    mockRelationships = [];
    mockContractRows = [];
  });

  it('returns empty when there are no descendants', async () => {
    const result = await resolveArchiveDescendants(ORG, [99]);
    expect(result).toEqual({
      invoiceDescendantIds: [],
      nonInvoiceDescendants: [],
    });
  });

  it('collects invoice children of a parent', async () => {
    mockRelationships = [
      { parent_contract_id: 1, child_contract_id: 2 },
      { parent_contract_id: 1, child_contract_id: 3 },
    ];
    mockContractRows = [
      { id: 2, type_id: contractTypes.Invoice },
      { id: 3, type_id: contractTypes.Invoice },
    ];

    const result = await resolveArchiveDescendants(ORG, [1]);

    expect(result.invoiceDescendantIds.sort()).toEqual([2, 3]);
    expect(result.nonInvoiceDescendants).toEqual([]);
  });

  it('excludes descendants that are already archived', async () => {
    mockRelationships = [
      { parent_contract_id: 1, child_contract_id: 2 },
      { parent_contract_id: 1, child_contract_id: 3 },
    ];
    mockContractRows = [
      { id: 2, type_id: contractTypes.Invoice, status: 'inactive' },
      { id: 3, type_id: contractTypes.SO, status: 'inactive' },
    ];

    const result = await resolveArchiveDescendants(ORG, [1]);

    expect(result).toEqual({
      invoiceDescendantIds: [],
      nonInvoiceDescendants: [],
    });
  });

  it('archives invoices nested under a non-invoice child and flags the non-invoice child', async () => {
    mockRelationships = [
      { parent_contract_id: 1, child_contract_id: 10 },
      { parent_contract_id: 10, child_contract_id: 20 },
    ];
    mockContractRows = [
      { id: 10, type_id: contractTypes.Addendum },
      { id: 20, type_id: contractTypes.Invoice },
    ];

    const result = await resolveArchiveDescendants(ORG, [1]);

    expect(result.invoiceDescendantIds).toEqual([20]);
    expect(result.nonInvoiceDescendants).toEqual([
      { id: 10, typeName: 'Addendum' },
    ]);
  });

  it('is cycle-safe', async () => {
    mockRelationships = [
      { parent_contract_id: 1, child_contract_id: 2 },
      { parent_contract_id: 2, child_contract_id: 1 },
    ];
    mockContractRows = [{ id: 2, type_id: contractTypes.SO }];

    const result = await resolveArchiveDescendants(ORG, [1]);

    expect(result.invoiceDescendantIds).toEqual([]);
    expect(result.nonInvoiceDescendants).toEqual([{ id: 2, typeName: 'SO' }]);
  });

  it('does not archive an invoice reached only through a billing edge', async () => {
    // Invoice 300 hangs off SO 200 structurally and off SO 100 for billing.
    // Archiving 100 must leave 300 alone — 200 still owns it.
    mockRelationships = [
      { parent_contract_id: 200, child_contract_id: 300 },
      {
        parent_contract_id: 100,
        child_contract_id: 300,
        relationship_type: 'billing',
      },
    ];
    mockContractRows = [{ id: 300, type_id: contractTypes.Invoice }];

    const result = await resolveArchiveDescendants(ORG, [100]);

    expect(result).toEqual({
      invoiceDescendantIds: [],
      nonInvoiceDescendants: [],
    });
  });

  it('yields the same descendants with a billing edge present as without it', async () => {
    const hierarchy: MockRelationship[] = [
      { parent_contract_id: 1, child_contract_id: 10 },
      { parent_contract_id: 10, child_contract_id: 20 },
    ];
    mockContractRows = [
      { id: 10, type_id: contractTypes.Addendum },
      { id: 20, type_id: contractTypes.Invoice },
      { id: 30, type_id: contractTypes.Invoice },
    ];

    mockRelationships = hierarchy;
    const withoutBilling = await resolveArchiveDescendants(ORG, [1]);

    mockRelationships = [
      ...hierarchy,
      {
        parent_contract_id: 1,
        child_contract_id: 30,
        relationship_type: 'billing',
      },
    ];
    const withBilling = await resolveArchiveDescendants(ORG, [1]);

    expect(withBilling).toEqual(withoutBilling);
    expect(withBilling.invoiceDescendantIds).toEqual([20]);
  });

  it('ignores relationship rows with null endpoints', async () => {
    mockRelationships = [
      { parent_contract_id: 1, child_contract_id: null },
      { parent_contract_id: null, child_contract_id: 5 },
    ];

    const result = await resolveArchiveDescendants(ORG, [1]);

    expect(result).toEqual({
      invoiceDescendantIds: [],
      nonInvoiceDescendants: [],
    });
  });
});

describe('resolveInactiveDescendants', () => {
  beforeEach(() => {
    mockRelationships = [];
    mockContractRows = [];
  });

  it('returns only inactive descendants, invoice and non-invoice, with labels', async () => {
    mockRelationships = [
      { parent_contract_id: 1, child_contract_id: 2 },
      { parent_contract_id: 1, child_contract_id: 3 },
      { parent_contract_id: 1, child_contract_id: 4 },
    ];
    mockContractRows = [
      {
        id: 2,
        type_id: contractTypes.Invoice,
        status: 'inactive',
        vendors: { name: 'Acme' },
        contract_types: { name: 'Invoice' },
        metadata: { lineage: { order_number: 'INV-1' } },
      },
      {
        id: 3,
        type_id: contractTypes.SO,
        status: 'inactive',
        vendors: { name: 'Acme' },
        contract_types: { name: 'SO' },
        metadata: null,
      },
      // Active descendant must be excluded.
      {
        id: 4,
        type_id: contractTypes.Invoice,
        status: 'active',
        vendors: { name: 'Acme' },
        contract_types: { name: 'Invoice' },
      },
    ];

    const result = await resolveInactiveDescendants(ORG, [1]);

    expect(result).toEqual([
      { id: 2, typeName: 'Invoice', label: 'Acme · Invoice · INV-1' },
      { id: 3, typeName: 'SO', label: 'Acme · SO' },
    ]);
  });

  it('falls back to the type map when contract_types is missing', async () => {
    mockRelationships = [{ parent_contract_id: 1, child_contract_id: 5 }];
    mockContractRows = [
      {
        id: 5,
        type_id: contractTypes.Addendum,
        status: 'inactive',
        vendors: null,
        contract_types: null,
        metadata: null,
      },
    ];

    const result = await resolveInactiveDescendants(ORG, [1]);

    expect(result).toEqual([
      { id: 5, typeName: 'Addendum', label: 'Addendum' },
    ]);
  });

  it('returns empty when there are no descendants', async () => {
    const result = await resolveInactiveDescendants(ORG, [99]);
    expect(result).toEqual([]);
  });

  it('does not offer to reactivate an invoice reached only through a billing edge', async () => {
    mockRelationships = [
      {
        parent_contract_id: 100,
        child_contract_id: 300,
        relationship_type: 'billing',
      },
    ];
    mockContractRows = [
      {
        id: 300,
        type_id: contractTypes.Invoice,
        status: 'inactive',
        vendors: { name: 'Acme' },
        contract_types: { name: 'Invoice' },
        metadata: null,
      },
    ];

    const result = await resolveInactiveDescendants(ORG, [100]);

    expect(result).toEqual([]);
  });
});

describe('buildArchiveIdSet', () => {
  const byNumber = (a: number, b: number) => a - b;

  it('includes roots and invoice descendants but not non-invoice by default', () => {
    expect(buildArchiveIdSet([1], [2, 3], [10], false).sort(byNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  it('includes non-invoice descendants when opted in', () => {
    expect(buildArchiveIdSet([1], [2, 3], [10], true).sort(byNumber)).toEqual([
      1, 2, 3, 10,
    ]);
  });

  it('de-duplicates overlapping ids', () => {
    expect(buildArchiveIdSet([1, 2], [2], [1], true).sort(byNumber)).toEqual([
      1, 2,
    ]);
  });
});
