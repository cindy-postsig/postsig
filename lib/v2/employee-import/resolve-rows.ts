import { normalizeImportedName } from '@/lib/settings/employee-form';
import { countryCodeForLocation } from '@/constants/city-country';
import { cellToString, isZeroLike } from './cell-value';
import {
  detectDateColumnFormat,
  isValidIsoDate,
  normalizeDateValue,
  type DateFormat,
} from './date-values';
import {
  DEFAULT_SEPARATOR,
  IMPORT_TARGET_FIELDS,
  isValueMappable,
  type EmployeeImportMapping,
  type FieldRule,
  type ImportTargetField,
  type ResolvedEmployeeRow,
  type SheetRow,
} from './types';

/** Applies to both the unmapped and the seen sets. */
const MAX_DISTINCT_VALUES_PER_FIELD = 200;

export function normalizeValueMapKey(value: string): string {
  return value.trim().toLowerCase();
}

export type ResolveOptions = {
  /** Injected so status derivation is deterministic in tests. */
  today: string;
};

export type ResolveResult = {
  rows: ResolvedEmployeeRow[];
  /** Distinct source values a value map had no entry for, per field. */
  unmappedValues: Partial<Record<ImportTargetField, string[]>>;
  /**
   * Every distinct input value seen per value-mappable field, whether or not a
   * value map exists yet. Without this the mapping editor has nothing to list,
   * so the first value map could never be built.
   */
  sourceValues: Partial<Record<ImportTargetField, string[]>>;
};

type FieldResolution = {
  value: string;
  /** The input value before any lookup — always set when non-empty. */
  sourceValue: string;
  /** Set when a lookup was attempted for this source value and found nothing. */
  unmapped?: string;
};

/** Joins a field's source columns, honouring the zero-rule and separator. */
function joinSources(row: SheetRow, rule: FieldRule): string {
  const parts: string[] = [];

  for (const source of rule.sources) {
    const cell = row[source.index];
    const text = cellToString(cell);

    // A "required" source that is blank or zero-like blanks the whole field:
    // the HR file uses code 0 to mean "this level does not apply".
    if (source.required && (text === '' || isZeroLike(cell))) return '';

    // Blank non-required parts drop out entirely, so a missing second half
    // never leaves a dangling separator behind.
    if (text !== '') parts.push(text);
  }

  return parts.join(rule.separator ?? DEFAULT_SEPARATOR);
}

/**
 * Resolves one field for one row.
 *
 * `derivedInput` is the already-resolved value of the field named by
 * `rule.deriveFrom`, used in place of reading columns — this is how Country
 * comes from Region and Business Group from Division.
 */
export function resolveField(
  row: SheetRow,
  rule: FieldRule,
  derivedInput?: string,
): FieldResolution {
  const input = rule.deriveFrom ? (derivedInput ?? '') : joinSources(row, rule);
  if (input === '') return { value: '', sourceValue: '' };

  // An explicit override always wins over the built-in lookup below.
  const mapped = rule.valueMap?.[normalizeValueMapKey(input)];
  if (mapped !== undefined) return { value: mapped, sourceValue: input };

  return { value: input, sourceValue: input };
}

/**
 * Country is derived automatically from Region via a best-effort location
 * lookup. Anything it cannot resolve is reported so the user can override just
 * those values rather than being left with a silent blank.
 */
function resolveCountry(rule: FieldRule, input: string): FieldResolution {
  if (input === '') return { value: '', sourceValue: '' };

  const override = rule.valueMap?.[normalizeValueMapKey(input)];
  if (override !== undefined) return { value: override, sourceValue: input };

  const derived = countryCodeForLocation(input);
  if (derived) return { value: derived, sourceValue: input };

  return { value: '', sourceValue: input, unmapped: input };
}

function splitFullName(fullName: string): { first: string; last: string } {
  const spaceIdx = fullName.indexOf(' ');
  if (spaceIdx > 0) {
    return {
      first: fullName.slice(0, spaceIdx),
      last: fullName.slice(spaceIdx + 1),
    };
  }
  return { first: fullName, last: '' };
}

export function resolveRows(
  rows: SheetRow[],
  mapping: EmployeeImportMapping,
  options: ResolveOptions,
): ResolveResult {
  const dataRows = mapping.hasHeaderRow ? rows.slice(1) : rows;
  const rowOffset = mapping.hasHeaderRow ? 2 : 1;

  const unmapped: Partial<Record<ImportTargetField, Set<string>>> = {};
  const seen: Partial<Record<ImportTargetField, Set<string>>> = {};
  const record = (
    into: Partial<Record<ImportTargetField, Set<string>>>,
    field: ImportTargetField,
    value: string,
  ) => {
    const set = into[field] ?? new Set<string>();
    if (set.size < MAX_DISTINCT_VALUES_PER_FIELD) set.add(value);
    into[field] = set;
  };

  const resolved = new Map<ImportTargetField, string[]>();

  // IMPORT_TARGET_FIELDS orders region before country and division before
  // business_group, so a single pass in that order satisfies every deriveFrom
  // dependency. See the ordering test in derive-from.test.ts.
  for (const field of IMPORT_TARGET_FIELDS) {
    const rule = mapping.fields[field];
    if (!rule) continue;

    const derivedFrom = rule.deriveFrom
      ? (resolved.get(rule.deriveFrom) ?? [])
      : undefined;

    const values = dataRows.map((row, i) => {
      const input = derivedFrom
        ? (derivedFrom[i] ?? '')
        : joinSources(row, rule);

      const result =
        field === 'country'
          ? resolveCountry(rule, input)
          : resolveField(row, rule, input);

      if (result.unmapped) record(unmapped, field, result.unmapped);
      if (result.sourceValue !== '' && isValueMappable(field)) {
        record(seen, field, result.sourceValue);
      }
      return result.value;
    });

    resolved.set(field, values);
  }

  const dateFormatFor = (field: 'start_date' | 'leave_date'): DateFormat =>
    detectDateColumnFormat(resolved.get(field) ?? []);
  const startDateFmt = dateFormatFor('start_date');
  const leaveDateFmt = dateFormatFor('leave_date');

  const valueAt = (field: ImportTargetField, i: number): string =>
    resolved.get(field)?.[i] ?? '';

  const outRows = dataRows.map((_, i) => {
    const fullName = valueAt('full_name', i);
    let firstName = valueAt('first_name', i);
    let lastName = valueAt('last_name', i);

    if (fullName && !firstName && !lastName) {
      const split = splitFullName(fullName);
      firstName = split.first;
      lastName = split.last;
    }

    firstName = normalizeImportedName(firstName);
    lastName = normalizeImportedName(lastName);

    const rawStart = valueAt('start_date', i);
    const rawLeave = valueAt('leave_date', i);
    const startDate = normalizeDateValue(rawStart, startDateFmt);
    const leaveDate = normalizeDateValue(rawLeave, leaveDateFmt);

    // A shape check is not enough: "2024-02-31" matches YYYY-MM-DD but is not
    // a real date, and Postgres would reject it after the preview called it OK.
    const startDateValid = isValidIsoDate(startDate);
    const leaveDateValid = isValidIsoDate(leaveDate);

    const invalidReasons: string[] = [];
    if (!firstName) invalidReasons.push('Missing first name');
    if (!lastName) invalidReasons.push('Missing last name');
    if (!startDateValid)
      invalidReasons.push(`Invalid start date: "${rawStart}"`);
    if (!leaveDateValid)
      invalidReasons.push(`Invalid leave date: "${rawLeave}"`);

    // Only ever derive 'inactive'. Writing 'active' explicitly would clobber a
    // manually-set 'on_leave' on every weekly import, and would also contradict
    // employeeSchema, which treats active-with-a-past-leave-date as invalid.
    const status =
      leaveDateValid && leaveDate && leaveDate < options.today
        ? ('inactive' as const)
        : undefined;

    return {
      rowNumber: i + rowOffset,
      first_name: firstName,
      last_name: lastName,
      email: valueAt('email', i),
      employee_id: valueAt('employee_id', i),
      region: valueAt('region', i),
      country: valueAt('country', i),
      division: valueAt('division', i),
      business_group: valueAt('business_group', i),
      department: valueAt('department', i),
      cost_center: valueAt('cost_center', i),
      business_unit: valueAt('business_unit', i),
      entity: valueAt('entity', i),
      team: valueAt('team', i),
      start_date: startDate,
      leave_date: leaveDate,
      ...(status ? { status } : {}),
      isValid: invalidReasons.length === 0,
      invalidReasons,
    };
  });

  const collect = (from: Partial<Record<ImportTargetField, Set<string>>>) => {
    const out: Partial<Record<ImportTargetField, string[]>> = {};
    for (const [field, values] of Object.entries(from)) {
      if (values && values.size > 0) {
        out[field as ImportTargetField] = Array.from(values);
      }
    }
    return out;
  };

  return {
    rows: outRows,
    unmappedValues: collect(unmapped),
    sourceValues: collect(seen),
  };
}
