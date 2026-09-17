/**
 * Child-invoice selection, once the DB-walking `findTopmostParent` was replaced
 * by the synchronous hierarchy map.
 *
 * Both filters take the org's whole relationship set rather than deriving one
 * from the contracts handed to them: every caller passes a FILTERED array
 * (archived, draft, report scope), and a map built from that array would drop
 * the edge to a missing parent — promoting a child invoice to a root and
 * double-counting it against the parent that already carries its amount.
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/app/lib/contracts/actions', () => ({
  __esModule: true,
  notifyComments: jest.fn(),
}));

jest.mock('@/data/contracts', () => ({
  __esModule: true,
  fetchOrgUsersForMentions: jest.fn(),
}));

import { filterLinkedChildInvoices } from '@/app/lib/contracts/utils';
import {
  buildOrgHierarchyMap,
  type ContractRelationship,
} from '@/lib/inventory/hierarchyUtils';

const INVOICE_TYPE_ID = 6;
const PARENT = 1;
const INVOICE = 2;
const STANDALONE_INVOICE = 3;

const invoice = (id: number) => ({ id, typeId: INVOICE_TYPE_ID });
const contract = (id: number) => ({ id, typeId: 1 });

const edge = (
  parent: number,
  child: number,
  relationshipType: string | null = null,
): ContractRelationship => ({
  parent_contract_id: parent,
  child_contract_id: child,
  relationship_type: relationshipType,
});

const ids = (rows: any[]) => rows.map((row) => row.id);

describe('buildOrgHierarchyMap', () => {
  it('takes its nodes from the edge endpoints, not a contract array', () => {
    const map = buildOrgHierarchyMap([edge(PARENT, INVOICE)]);

    expect(map.parents.get(INVOICE)).toBe(PARENT);
    expect(map.children.get(PARENT)).toEqual([INVOICE]);
  });

  it('ignores typed edges', () => {
    const map = buildOrgHierarchyMap([edge(PARENT, INVOICE, 'billing')]);

    expect(map.parents.has(INVOICE)).toBe(false);
  });

  it('skips edges with a null endpoint', () => {
    const map = buildOrgHierarchyMap([
      { parent_contract_id: null, child_contract_id: INVOICE },
      { parent_contract_id: PARENT, child_contract_id: null },
    ]);

    expect(map.parents.size).toBe(0);
  });
});

describe('filterLinkedChildInvoices', () => {
  it('keeps every non-invoice row', () => {
    const rows = [contract(PARENT), contract(9)];

    expect(ids(filterLinkedChildInvoices(rows, [edge(PARENT, 9)]))).toEqual([
      PARENT,
      9,
    ]);
  });

  it('drops an invoice that hangs off a hierarchy parent', () => {
    const rows = [contract(PARENT), invoice(INVOICE)];

    expect(
      ids(filterLinkedChildInvoices(rows, [edge(PARENT, INVOICE)])),
    ).toEqual([PARENT]);
  });

  it('drops it even when the parent is absent from the array', () => {
    const rows = [invoice(INVOICE), invoice(STANDALONE_INVOICE)];

    expect(
      ids(filterLinkedChildInvoices(rows, [edge(PARENT, INVOICE)])),
    ).toEqual([STANDALONE_INVOICE]);
  });

  it('keeps a standalone invoice', () => {
    expect(
      ids(filterLinkedChildInvoices([invoice(STANDALONE_INVOICE)], [])),
    ).toEqual([STANDALONE_INVOICE]);
  });

  it('keeps an invoice whose only edge is a billing edge', () => {
    const rows = [invoice(INVOICE)];

    expect(
      ids(filterLinkedChildInvoices(rows, [edge(PARENT, INVOICE, 'billing')])),
    ).toEqual([INVOICE]);
  });

  it('reads the raw-DB type column as well as the processed one', () => {
    const rows = [{ id: INVOICE, type_id: INVOICE_TYPE_ID }];

    expect(filterLinkedChildInvoices(rows, [edge(PARENT, INVOICE)])).toEqual(
      [],
    );
  });

  it('drops rows without an id, and returns [] for empty or invalid input', () => {
    expect(
      filterLinkedChildInvoices([null, { typeId: 1 }] as any[], []),
    ).toEqual([]);
    expect(filterLinkedChildInvoices([], [])).toEqual([]);
    expect(filterLinkedChildInvoices(undefined as any, [])).toEqual([]);
  });
});
