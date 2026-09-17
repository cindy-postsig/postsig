import type { OrgUnitLevel } from '@/lib/v2/org-units/levels';

/**
 * A contract's owners as the contract embed carries them (psk-1975). Ids only
 * in storage; names come from the joined rows so renames propagate and
 * deletions cascade. Ownership grants no access and attributes no spend —
 * sharing is `contract_acl_group`, attribution is the cost allocation.
 */
export type OwnerSponsor =
  | { kind: 'user'; id: string; name: string; email: string | null }
  | { kind: 'employee'; id: number; name: string }
  | { kind: 'label'; name: string };

export interface OwnerGroup {
  id: number;
  name: string;
  level: OrgUnitLevel;
  parentId: number | null;
}

export interface ContractOwners {
  sponsors: OwnerSponsor[];
  groups: OwnerGroup[];
}

/** What the client sends `updateOwner`; the row shape without display names. */
export type OwnerSponsorRef =
  | { kind: 'user'; id: string }
  | { kind: 'employee'; id: number }
  | { kind: 'label'; name: string };

/**
 * A business group as the contracts table, inventory, and their filters carry
 * it. `id` is `unit:<id>` rather than the bare number: the filter dropdown
 * dedupes options on this field, and the key survived the cost-allocation era
 * so URL params and saved filters keep working.
 */
export interface BusinessGroupRef {
  id: string;
  name: string;
}

/** One `contract_owners` row as the contract embed returns it. */
export interface RawContractOwnerRow {
  id: number;
  role: string;
  user_id: string | null;
  org_employee_id: number | null;
  label: string | null;
  org_unit_id: number | null;
  users?: { name: string | null; email: string | null } | null;
  org_employees?: { first_name: string; last_name: string } | null;
  org_units?: { name: string; level: string; parent_id: number | null } | null;
}
