import type { EmployeeStatus } from '@/data/superuser/_employee-row';

/**
 * Computes what an import commit changed relative to the directory state read
 * just before the write. The result is persisted with the run (as JSONB), so
 * the delta report survives both later edits to org_employees and the loss of
 * the original file.
 *
 * Leavers are directory rows the file no longer contains, which assumes the
 * file is a full roster — the same assumption the import's update path already
 * makes for weekly snapshot files.
 */

/** Directory state loaded before the write; a subset of org_employees. */
export type ExistingEmployeeState = {
  id: number;
  employee_id: string | null;
  email: string | null;
  first_name: string;
  last_name: string;
  region: string | null;
  country: string | null;
  division: string | null;
  department: string | null;
  cost_center: string | null;
  business_unit: string | null;
  entity: string | null;
  team: string | null;
  start_date: string | null;
  leave_date: string | null;
  status: string;
};

/** A valid file row after buildEmployeeRow normalization. */
export type IncomingEmployeeRow = {
  first_name: string;
  last_name: string;
  email: string | null;
  employee_id: string | null;
  region: string | null;
  country: string | null;
  division: string | null;
  department: string | null;
  cost_center: string | null;
  business_unit: string | null;
  entity: string | null;
  team: string | null;
  start_date: string | null;
  leave_date: string | null;
  /** Omitted when the file has no status column — the column is left alone. */
  status?: EmployeeStatus;
};

export type ImportChangeType = 'joiner' | 'leaver' | 'mover' | 'attribute';

export type ImportFieldChange = {
  field: string;
  from: string | null;
  to: string | null;
};

export type ImportDeltaChange = {
  type: ImportChangeType;
  /** Null for joiners: the DB id is not known until after the insert. */
  orgEmployeeId: number | null;
  /** The HR-side employee id, when the file or directory carries one. */
  employeeRef: string | null;
  name: string;
  /** "entity · department · team" — new values, or old ones for a leaver. */
  position: string | null;
  /** Field-level old → new pairs; empty for joiners and leavers. */
  fields: ImportFieldChange[];
};

export type ImportDelta = {
  joiners: number;
  leavers: number;
  movers: number;
  attributeChanges: number;
  changes: ImportDeltaChange[];
};

/** A change to any of these reclassifies the row from attribute to mover. */
const MOVER_FIELDS = [
  'entity',
  'division',
  'business_unit',
  'department',
  'team',
  'cost_center',
] as const;

const ATTRIBUTE_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'employee_id',
  'region',
  'country',
  'start_date',
  'leave_date',
  'status',
] as const;

type ComparedField =
  | (typeof MOVER_FIELDS)[number]
  | (typeof ATTRIBUTE_FIELDS)[number];

function nameKey(first: string, last: string): string {
  return `${first.trim().toLowerCase()}\0${last.trim().toLowerCase()}`;
}

function position(
  row: Pick<IncomingEmployeeRow, 'entity' | 'department' | 'team'>,
): string | null {
  const parts = [row.entity, row.department, row.team].filter(
    (p): p is string => !!p,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

function fieldValue(
  row: ExistingEmployeeState | IncomingEmployeeRow,
  field: ComparedField,
): string | null | undefined {
  const value = row[field as keyof typeof row];
  return value as string | null | undefined;
}

function sameValue(field: ComparedField, a: string | null, b: string | null) {
  // Emails are stored normalized on the import path, but rows added through
  // other paths may carry the original casing.
  if (field === 'email') {
    return (a?.toLowerCase() ?? null) === (b?.toLowerCase() ?? null);
  }
  return a === b;
}

function diffFields(
  existing: ExistingEmployeeState,
  incoming: IncomingEmployeeRow,
): { fields: ImportFieldChange[]; isMover: boolean } {
  const fields: ImportFieldChange[] = [];
  let isMover = false;

  for (const field of [...MOVER_FIELDS, ...ATTRIBUTE_FIELDS]) {
    const to = fieldValue(incoming, field);
    // An absent key (only `status` today) means the import leaves the column
    // alone, so it cannot have changed.
    if (to === undefined) continue;
    const from = fieldValue(existing, field) ?? null;
    if (sameValue(field, from, to)) continue;
    fields.push({ field, from, to });
    if ((MOVER_FIELDS as readonly string[]).includes(field)) isMover = true;
  }

  return { fields, isMover };
}

/**
 * Matches incoming rows to the directory the way addOrgEmployees does:
 * employee_id first, then email, then — only when both sides carry neither
 * identifier — first+last name. Each existing row is claimed at most once;
 * later duplicates in the file are ignored, mirroring skippedDuplicates.
 */
export function computeImportDelta(
  existing: ExistingEmployeeState[],
  incoming: IncomingEmployeeRow[],
): ImportDelta {
  const byEmployeeId = new Map<string, ExistingEmployeeState>();
  const byEmail = new Map<string, ExistingEmployeeState>();
  const byNameOnly = new Map<
    string,
    { employee: ExistingEmployeeState; hasEmailOrEmployeeId: boolean }
  >();

  for (const e of existing) {
    if (e.employee_id) byEmployeeId.set(e.employee_id, e);
    if (e.email) byEmail.set(e.email.toLowerCase(), e);
    byNameOnly.set(nameKey(e.first_name, e.last_name), {
      employee: e,
      hasEmailOrEmployeeId: !!(e.email || e.employee_id),
    });
  }

  const findExisting = (
    row: IncomingEmployeeRow,
  ): ExistingEmployeeState | undefined => {
    if (row.employee_id && byEmployeeId.has(row.employee_id)) {
      return byEmployeeId.get(row.employee_id);
    }
    if (row.email && byEmail.has(row.email.toLowerCase())) {
      return byEmail.get(row.email.toLowerCase());
    }
    if (row.email || row.employee_id) return undefined;
    const match = byNameOnly.get(nameKey(row.first_name, row.last_name));
    if (match && !match.hasEmailOrEmployeeId) return match.employee;
    return undefined;
  };

  const delta: ImportDelta = {
    joiners: 0,
    leavers: 0,
    movers: 0,
    attributeChanges: 0,
    changes: [],
  };

  const claimedIds = new Set<number>();
  const seenJoinerKeys = new Set<string>();

  for (const row of incoming) {
    const match = findExisting(row);

    if (!match) {
      const key = row.employee_id
        ? `e\0${row.employee_id}`
        : row.email
          ? `m\0${row.email.toLowerCase()}`
          : `n\0${nameKey(row.first_name, row.last_name)}`;
      if (seenJoinerKeys.has(key)) continue;
      seenJoinerKeys.add(key);

      delta.joiners += 1;
      delta.changes.push({
        type: 'joiner',
        orgEmployeeId: null,
        employeeRef: row.employee_id,
        name: `${row.first_name} ${row.last_name}`.trim(),
        position: position(row),
        fields: [],
      });
      continue;
    }

    if (claimedIds.has(match.id)) continue;
    claimedIds.add(match.id);

    const { fields, isMover } = diffFields(match, row);
    if (fields.length === 0) continue;

    if (isMover) delta.movers += 1;
    else delta.attributeChanges += 1;
    delta.changes.push({
      type: isMover ? 'mover' : 'attribute',
      orgEmployeeId: match.id,
      employeeRef: row.employee_id ?? match.employee_id,
      name: `${row.first_name} ${row.last_name}`.trim(),
      position: position(row),
      fields,
    });
  }

  for (const e of existing) {
    if (claimedIds.has(e.id)) continue;
    delta.leavers += 1;
    delta.changes.push({
      type: 'leaver',
      orgEmployeeId: e.id,
      employeeRef: e.employee_id,
      name: `${e.first_name} ${e.last_name}`.trim(),
      position: position(e),
      fields: [],
    });
  }

  return delta;
}
