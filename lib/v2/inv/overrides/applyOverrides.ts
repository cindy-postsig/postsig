/**
 * Pure merge of investor value overrides into entity rows.
 *
 * Overrides never mutate source data: this module takes raw DB rows
 * (snake_case, pre-transform) plus the org's active overrides and returns new
 * row objects with override values applied, alongside per-field metadata for
 * "edited" badges and lineage tooltips. Apply BEFORE computing derived
 * metrics so an edited input flows into MOIC / FMV consistently.
 */

import type { Json } from '@/database.types';

import {
  EDITABLE_FIELDS,
  isEditableField,
  type OverrideEntityType,
} from './registry';

const REGISTRY_RULES = new Map(
  EDITABLE_FIELDS.map((f) => [`${f.entityType}:${f.fieldKey}`, f.rule]),
);

/**
 * Row shape of `inv_value_overrides` (migration 20260611100000).
 * Replace with the generated type once `npm run supabase:generate:types` picks
 * up the table. `id` is uuid (string); `entity_id` is bigint (number).
 */
export interface ValueOverrideRow {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id: number;
  field_key: string;
  original_value: Json | null;
  override_value: Json;
  reason: string;
  created_by: string;
  created_at: string;
  reverted_at: string | null;
  reverted_by: string | null;
}

/** Lineage metadata for one overridden field (badge + tooltip data). */
export interface AppliedOverrideMeta {
  overrideId: string;
  fieldKey: string;
  originalValue: Json | null;
  overrideValue: Json;
  reason: string;
  createdBy: string;
  createdAt: string;
}

/**
 * entityId -> fieldKey -> metadata. Plain objects (not Maps) so the result
 * can cross the RSC serialization boundary untouched.
 */
export type OverrideMetadataByEntity = Record<
  number,
  Record<string, AppliedOverrideMeta>
>;

export interface ApplyOverridesResult<T> {
  rows: T[];
  /** Only contains entries for fields actually applied to a returned row. */
  overridden: OverrideMetadataByEntity;
}

/** Last-write-wins: later created_at wins; ties broken by id string order. */
function isNewer(a: ValueOverrideRow, b: ValueOverrideRow): boolean {
  if (a.created_at !== b.created_at) {
    return a.created_at > b.created_at;
  }
  return a.id > b.id; // uuid string comparison — stable tie-break
}

function isApplicable(
  override: ValueOverrideRow,
  entityType: OverrideEntityType,
): boolean {
  return (
    override.entity_type === entityType &&
    override.reverted_at === null &&
    isEditableField(override.entity_type, override.field_key) &&
    validatesAgainstRegistry(override)
  );
}

/**
 * A corrupt override_value (e.g. a string in a numeric column) must not
 * poison downstream metric math — validate against the registry rule and
 * skip anything that fails.
 */
function validatesAgainstRegistry(override: ValueOverrideRow): boolean {
  const rule = REGISTRY_RULES.get(
    `${override.entity_type}:${override.field_key}`,
  );
  return rule ? rule.safeParse(override.override_value).success : false;
}

function toMeta(override: ValueOverrideRow): AppliedOverrideMeta {
  return {
    overrideId: override.id,
    fieldKey: override.field_key,
    originalValue: override.original_value,
    overrideValue: override.override_value,
    reason: override.reason,
    createdBy: override.created_by,
    createdAt: override.created_at,
  };
}

/**
 * Merge active overrides into rows of one entity type, keyed by row `id`.
 *
 * Pure: input rows and overrides are not mutated. Overrides that are
 * reverted, target another entity type, an unregistered field, a missing
 * row, or carry a value violating the field's registry rule are ignored.
 */
export function applyOverrides<T extends { id: number }>(
  entityType: OverrideEntityType,
  rows: readonly T[],
  overrides: readonly ValueOverrideRow[],
): ApplyOverridesResult<T> {
  // Winning override per (entity_id, field_key). The DB enforces one active
  // override per field via a partial unique index, but stay defensive.
  const winners = new Map<string, ValueOverrideRow>();
  for (const override of overrides) {
    if (!isApplicable(override, entityType)) {
      continue;
    }
    const key = `${override.entity_id}:${override.field_key}`;
    const current = winners.get(key);
    if (!current || isNewer(override, current)) {
      winners.set(key, override);
    }
  }

  if (winners.size === 0) {
    return { rows: [...rows], overridden: {} };
  }

  const byEntity = new Map<number, ValueOverrideRow[]>();
  for (const override of winners.values()) {
    const list = byEntity.get(override.entity_id) ?? [];
    list.push(override);
    byEntity.set(override.entity_id, list);
  }

  const overridden: OverrideMetadataByEntity = {};
  const mergedRows = rows.map((row) => {
    const rowOverrides = byEntity.get(row.id);
    if (!rowOverrides) {
      return row;
    }
    overridden[row.id] = Object.fromEntries(
      rowOverrides.map((o) => [o.field_key, toMeta(o)]),
    );
    const patch = Object.fromEntries(
      rowOverrides.map((o) => [o.field_key, o.override_value]),
    );
    return { ...row, ...patch };
  });

  return { rows: mergedRows, overridden };
}
