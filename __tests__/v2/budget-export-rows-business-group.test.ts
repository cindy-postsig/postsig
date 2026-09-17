import { buildContractRows } from '@/lib/v2/reports/budget-export/rows';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import type { RawContractOwnerRow } from '@/lib/v2/owners/types';

/**
 * The budget export's Business Group and Business Sponsor columns read the
 * contract's own owner rows (psk-1975) — never a cost allocation, never the
 * frozen business_sponsor column. A contract with no owners exports blank.
 */

interface Spec {
  id: number;
  vendor: string;
  groups?: string[];
  sponsors?: string[];
}

function ownerRows(spec: Spec): RawContractOwnerRow[] {
  let id = 0;
  return [
    ...(spec.groups ?? []).map((name, index) => ({
      id: ++id,
      role: 'group',
      user_id: null,
      org_employee_id: null,
      label: null,
      org_unit_id: index + 1,
      org_units: { name, level: 'business_group', parent_id: null },
    })),
    ...(spec.sponsors ?? []).map((label) => ({
      id: ++id,
      role: 'sponsor',
      user_id: null,
      org_employee_id: null,
      label,
      org_unit_id: null,
    })),
  ];
}

function makeEnriched(spec: Spec): ContractWithPricing {
  return {
    id: spec.id,
    vendor_id: spec.id * 10,
    vendor_name: spec.vendor,
    contract: { id: spec.id, contract_owners: ownerRows(spec) },
    products: [],
    priceHistory: { vendor: spec.vendor },
    isLinkedChildInvoice: false,
  } as unknown as ContractWithPricing;
}

const SPECS: Spec[] = [
  { id: 1, vendor: 'OneGroup', groups: ['Trading'] },
  {
    id: 2,
    vendor: 'ManyGroups',
    groups: ['Alpha', 'Beta', 'Gamma'],
    sponsors: ['Ada Lovelace'],
  },
  { id: 3, vendor: 'SponsorOnly', sponsors: ['Grace Hopper', 'Alan Turing'] },
  { id: 4, vendor: 'Unowned' },
];

describe('budget export ownership columns over the owners embed', () => {
  const rows = buildContractRows(SPECS.map(makeEnriched), new Map());
  const rowFor = (id: number) => rows.find((row) => row.id === id)!;

  it('joins owner group names in saved order', () => {
    expect(rowFor(1).businessGroup).toBe('Trading');
    expect(rowFor(2).businessGroup).toBe('Alpha, Beta, Gamma');
  });

  it('joins owner sponsor names in saved order', () => {
    expect(rowFor(2).businessSponsor).toBe('Ada Lovelace');
    expect(rowFor(3).businessSponsor).toBe('Grace Hopper, Alan Turing');
  });

  it('leaves each column blank when the contract has no owner of that kind', () => {
    expect(rowFor(1).businessSponsor).toBe('');
    expect(rowFor(3).businessGroup).toBe('');
    expect(rowFor(4).businessGroup).toBe('');
    expect(rowFor(4).businessSponsor).toBe('');
  });

  it('stays blank on a row with no owners embed at all', () => {
    const [row] = buildContractRows(
      [
        {
          id: 99,
          vendor_id: 990,
          vendor_name: 'Unstamped',
          contract: { id: 99 },
          products: [],
          priceHistory: {},
          isLinkedChildInvoice: false,
        } as unknown as ContractWithPricing,
      ],
      new Map(),
    );
    expect(row.businessGroup).toBe('');
    expect(row.businessSponsor).toBe('');
  });
});
