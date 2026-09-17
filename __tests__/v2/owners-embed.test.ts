import {
  contractOwners,
  isSponsoredBy,
  ownerGroupNames,
  ownerGroupRefs,
  ownerSponsorNames,
  ownersFromEmbed,
} from '@/lib/v2/owners/embed';
import type { RawContractOwnerRow } from '@/lib/v2/owners/types';

function row(overrides: Partial<RawContractOwnerRow>): RawContractOwnerRow {
  return {
    id: 1,
    role: 'sponsor',
    user_id: null,
    org_employee_id: null,
    label: null,
    org_unit_id: null,
    users: null,
    org_employees: null,
    org_units: null,
    ...overrides,
  };
}

const userRow = row({
  id: 3,
  user_id: 'u-1',
  users: { name: 'Ada Lovelace', email: 'ada@example.com' },
});
const employeeRow = row({
  id: 1,
  org_employee_id: 7,
  org_employees: { first_name: 'Grace', last_name: 'Hopper' },
});
const labelRow = row({ id: 2, label: 'External Sponsor' });
const groupRow = row({
  id: 4,
  role: 'group',
  org_unit_id: 11,
  org_units: { name: 'Data Science', level: 'business_group', parent_id: 2 },
});
const departmentRow = row({
  id: 5,
  role: 'group',
  org_unit_id: 12,
  org_units: { name: 'Quant', level: 'department', parent_id: 11 },
});

describe('ownersFromEmbed', () => {
  it('maps every sponsor kind and every group, in saved (id) order', () => {
    const owners = ownersFromEmbed([
      groupRow,
      userRow,
      labelRow,
      employeeRow,
      departmentRow,
    ]);
    expect(owners.sponsors).toEqual([
      { kind: 'employee', id: 7, name: 'Grace Hopper' },
      { kind: 'label', name: 'External Sponsor' },
      {
        kind: 'user',
        id: 'u-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    ]);
    expect(owners.groups).toEqual([
      { id: 11, name: 'Data Science', level: 'business_group', parentId: 2 },
      { id: 12, name: 'Quant', level: 'department', parentId: 11 },
    ]);
  });

  it('reads as unowned when the embed is absent or empty', () => {
    expect(ownersFromEmbed(undefined)).toEqual({ sponsors: [], groups: [] });
    expect(ownersFromEmbed(null)).toEqual({ sponsors: [], groups: [] });
    expect(contractOwners({})).toEqual({ sponsors: [], groups: [] });
  });

  it('falls back to the email when a user has no display name', () => {
    const owners = ownersFromEmbed([
      row({ user_id: 'u-2', users: { name: '  ', email: 'x@example.com' } }),
    ]);
    expect(owners.sponsors).toEqual([
      {
        kind: 'user',
        id: 'u-2',
        name: 'x@example.com',
        email: 'x@example.com',
      },
    ]);
  });

  it('skips a row whose joined target is missing or malformed', () => {
    const owners = ownersFromEmbed([
      row({ user_id: 'gone', users: null }),
      row({ org_employee_id: 9, org_employees: null }),
      row({
        role: 'group',
        org_unit_id: 99,
        org_units: { name: 'Bad', level: 'galaxy', parent_id: null },
      }),
      row({ role: 'group', org_unit_id: 100, org_units: null }),
      row({ role: 'mystery', label: 'x' }),
    ]);
    expect(owners).toEqual({ sponsors: [], groups: [] });
  });
});

describe('display helpers', () => {
  const owners = ownersFromEmbed([userRow, labelRow, groupRow, departmentRow]);

  it('keys business-group refs as unit:<id> so filters dedupe on the same key as before', () => {
    expect(ownerGroupRefs(owners)).toEqual([
      { id: 'unit:11', name: 'Data Science' },
      { id: 'unit:12', name: 'Quant' },
    ]);
    expect(ownerGroupNames(owners)).toEqual(['Data Science', 'Quant']);
  });

  it('lists sponsor display names', () => {
    expect(ownerSponsorNames(owners)).toEqual([
      'External Sponsor',
      'Ada Lovelace',
    ]);
  });
});

describe('isSponsoredBy', () => {
  const owners = ownersFromEmbed([userRow, labelRow, employeeRow]);

  it('matches a user-kind sponsor on id regardless of display name', () => {
    expect(isSponsoredBy(owners, { userId: 'u-1', name: 'Someone Else' })).toBe(
      true,
    );
    expect(isSponsoredBy(owners, { userId: 'u-9' })).toBe(false);
  });

  it('never matches a user-kind sponsor by name or email: two users can share a name', () => {
    expect(isSponsoredBy(owners, { userId: 'u-9', name: 'Ada Lovelace' })).toBe(
      false,
    );
    expect(
      isSponsoredBy(owners, { userId: 'u-9', email: 'ada@example.com' }),
    ).toBe(false);
  });

  it('matches labels and employees on the exact name or email, as the free-text column did', () => {
    expect(
      isSponsoredBy(owners, { userId: 'x', name: 'External Sponsor' }),
    ).toBe(true);
    expect(isSponsoredBy(owners, { userId: 'x', email: 'Grace Hopper' })).toBe(
      true,
    );
    expect(
      isSponsoredBy(owners, { userId: 'x', name: 'external sponsor' }),
    ).toBe(false);
    expect(isSponsoredBy(owners, { userId: 'x', name: '', email: null })).toBe(
      false,
    );
    expect(
      isSponsoredBy(owners, { userId: 'x', name: ' External Sponsor ' }),
    ).toBe(true);
    expect(isSponsoredBy(owners, { userId: 'x', name: '   ' })).toBe(false);
  });
});
