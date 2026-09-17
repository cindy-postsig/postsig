import { isOrgUnitLevel } from '@/lib/v2/org-units/levels';
import type {
  BusinessGroupRef,
  ContractOwners,
  OwnerGroup,
  OwnerSponsor,
  RawContractOwnerRow,
} from './types';

/**
 * The owners embed on every contract select. It rides the Redis contract-set
 * cache with the rest of the row, so a cache hit costs nothing extra and no
 * request loads allocation context to learn a contract's business group.
 * The users hint is required: `created_by` is a second FK to users.
 */
export const CONTRACT_OWNERS_EMBED = `contract_owners (
            id, role, user_id, org_employee_id, label, org_unit_id,
            users!contract_owners_user_fkey ( name, email ),
            org_employees!contract_owners_org_employee_fkey ( first_name, last_name ),
            org_units!contract_owners_org_unit_fkey ( name, level, parent_id )
          )`;

export const EMPTY_OWNERS: ContractOwners = { sponsors: [], groups: [] };

export function employeeDisplayName(employee: {
  first_name: string;
  last_name: string;
}): string {
  return `${employee.first_name} ${employee.last_name}`.trim();
}

function sponsorOf(row: RawContractOwnerRow): OwnerSponsor | null {
  if (row.user_id !== null) {
    const user = row.users;
    if (!user) return null;
    return {
      kind: 'user',
      id: row.user_id,
      name: user.name?.trim() || user.email || '',
      email: user.email,
    };
  }
  if (row.org_employee_id !== null) {
    const employee = row.org_employees;
    if (!employee) return null;
    return {
      kind: 'employee',
      id: row.org_employee_id,
      name: employeeDisplayName(employee),
    };
  }
  if (row.label !== null) return { kind: 'label', name: row.label };
  return null;
}

function groupOf(row: RawContractOwnerRow): OwnerGroup | null {
  const unit = row.org_units;
  if (row.org_unit_id === null || !unit || !isOrgUnitLevel(unit.level)) {
    return null;
  }
  return {
    id: row.org_unit_id,
    name: unit.name,
    level: unit.level,
    parentId: unit.parent_id,
  };
}

/**
 * Maps the embed to owners. Rows are ordered by id so the display order is the
 * order they were saved in, whatever order PostgREST returned them. A row
 * whose joined target is missing is skipped rather than shown blank.
 */
export function ownersFromEmbed(
  rows: readonly RawContractOwnerRow[] | null | undefined,
): ContractOwners {
  if (!rows || rows.length === 0) return EMPTY_OWNERS;
  const sponsors: OwnerSponsor[] = [];
  const groups: OwnerGroup[] = [];
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    if (row.role === 'sponsor') {
      const sponsor = sponsorOf(row);
      if (sponsor) sponsors.push(sponsor);
    } else if (row.role === 'group') {
      const group = groupOf(row);
      if (group) groups.push(group);
    }
  }
  return { sponsors, groups };
}

export function contractOwners(contract: {
  contract_owners?: readonly RawContractOwnerRow[] | null;
}): ContractOwners {
  return ownersFromEmbed(contract.contract_owners);
}

export function ownerGroupRefs(owners: ContractOwners): BusinessGroupRef[] {
  return owners.groups.map((group) => ({
    id: `unit:${group.id}`,
    name: group.name,
  }));
}

export function ownerGroupNames(owners: ContractOwners): string[] {
  return owners.groups.map((group) => group.name);
}

export function ownerSponsorNames(owners: ContractOwners): string[] {
  return owners.sponsors.map((sponsor) => sponsor.name);
}

/**
 * "My contracts": a user-kind sponsor matches on id only — two users can
 * share a display name; a label or employee row matches the way the
 * free-text column always did, by the exact display name or email the user
 * signs in with.
 */
export function isSponsoredBy(
  owners: ContractOwners,
  user: { userId: string; name?: string | null; email?: string | null },
): boolean {
  const name = user.name?.trim() ?? '';
  const email = user.email?.trim() ?? '';
  return owners.sponsors.some((sponsor) =>
    sponsor.kind === 'user'
      ? sponsor.id === user.userId
      : (name !== '' && sponsor.name === name) ||
        (email !== '' && sponsor.name === email),
  );
}
