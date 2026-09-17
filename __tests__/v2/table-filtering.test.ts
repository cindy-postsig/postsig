import { pruneRowsByFilters } from '@/lib/v2/contracts/tableFiltering';
import type { ContractTableRow } from '@/lib/v2/core/types';

const row = (
  id: string,
  overrides: Partial<ContractTableRow> = {},
): ContractTableRow =>
  ({
    id,
    contract_id: id,
    vendor: 'Acme',
    renewalType: 'auto',
    ...overrides,
  }) as ContractTableRow;

const group = (id: string, subRows: ContractTableRow[]): ContractTableRow =>
  ({ id, vendor: 'Acme', isGroup: true, subRows }) as ContractTableRow;

const RENEWAL_MANUAL = [{ id: 'renewalType', value: 'manual' }];
const BUSINESS_SPONSOR_ALICE = [{ id: 'businessSponsor', value: 'Alice' }];

describe('pruneRowsByFilters', () => {
  it('returns rows untouched when nothing is filtered', () => {
    const rows = [row('1'), row('2')];
    expect(pruneRowsByFilters(rows, [])).toEqual(rows);
  });

  it('keeps every ancestor of a match nested three levels down', () => {
    // The failure this guards: pruning an ancestor makes the matching
    // descendant unreachable, so the filter appears to find nothing.
    const amendment = row('3', { renewalType: 'manual' });
    const orderForm = row('2', { subRows: [amendment] });
    const msa = row('1', { subRows: [orderForm] });

    const [kept] = pruneRowsByFilters(
      [group('g', [msa, row('9')])],
      RENEWAL_MANUAL,
    );

    // Only one child survived, so the vendor group collapses into it.
    expect(kept.id).toBe('1');
    const so = (kept.subRows as ContractTableRow[])[0];
    expect(so.id).toBe('2');
    expect((so.subRows as ContractTableRow[])[0].id).toBe('3');
  });

  it('drops a group whose subtree has no match at all', () => {
    const rows = [group('g', [row('1'), row('2')])];
    expect(pruneRowsByFilters(rows, RENEWAL_MANUAL)).toEqual([]);
  });

  it('collapses a vendor group down to its single surviving child', () => {
    const rows = [group('g', [row('1', { renewalType: 'manual' }), row('2')])];
    const result = pruneRowsByFilters(rows, RENEWAL_MANUAL);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
    expect(result[0].isGroup).toBeUndefined();
  });

  it('keeps a group intact when several children survive', () => {
    const rows = [
      group('g', [
        row('1', { renewalType: 'manual' }),
        row('2', { renewalType: 'manual' }),
        row('3'),
      ]),
    ];
    const [kept] = pruneRowsByFilters(rows, RENEWAL_MANUAL);

    expect(kept.isGroup).toBe(true);
    expect((kept.subRows as ContractTableRow[]).map((r) => r.id)).toEqual([
      '1',
      '2',
    ]);
  });

  it('never flattens a real contract into its own child', () => {
    // A vendor group is scaffolding; a contract has its own identity and must
    // survive as itself even when only one amendment matches.
    const msa = row('1', {
      renewalType: 'manual',
      subRows: [row('2', { renewalType: 'manual' }), row('3')],
    });

    const [kept] = pruneRowsByFilters([msa], RENEWAL_MANUAL);

    expect(kept.id).toBe('1');
    expect((kept.subRows as ContractTableRow[]).map((r) => r.id)).toEqual([
      '2',
    ]);
  });

  it('keeps a matching parent whose children all fail', () => {
    const msa = row('1', { renewalType: 'manual', subRows: [row('2')] });
    const [kept] = pruneRowsByFilters([msa], RENEWAL_MANUAL);

    expect(kept.id).toBe('1');
    expect(kept.subRows).toEqual([]);
  });

  it('keeps a matching contract row leaf product subRows intact', () => {
    const productA = row('2a', {
      businessSponsor: undefined,
      vendor_products: { id: 1, name: 'Product A' },
    } as Partial<ContractTableRow>);
    const productB = row('2b', {
      businessSponsor: undefined,
      vendor_products: { id: 2, name: 'Product B' },
    } as Partial<ContractTableRow>);
    const contract = row('1', {
      businessSponsor: ['Alice'],
      subRows: [productA, productB],
    } as Partial<ContractTableRow>);

    const [kept] = pruneRowsByFilters([contract], BUSINESS_SPONSOR_ALICE);

    expect(kept.id).toBe('1');
    expect((kept.subRows as ContractTableRow[]).map((r) => r.id)).toEqual([
      '2a',
      '2b',
    ]);
  });

  it('drops a non-matching contract even though its leaf children are always "kept"', () => {
    const productA = row('2a', {
      businessSponsor: undefined,
      vendor_products: { id: 1, name: 'Product A' },
    } as Partial<ContractTableRow>);
    const contract = row('1', {
      businessSponsor: ['Bob'],
      subRows: [productA],
    } as Partial<ContractTableRow>);

    expect(pruneRowsByFilters([contract], BUSINESS_SPONSOR_ALICE)).toEqual([]);
  });
});
