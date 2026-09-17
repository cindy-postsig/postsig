import type { FieldValue, JsonFieldPath } from './field-registry';

export type JsonRecord = Record<string, unknown>;

/**
 * Read the value a jsonPath addresses. For array paths the entry is located by
 * matching `arrayKey` against `recordId` (e.g. sales tax for a given year).
 */
export function getValueAtJsonPath(
  data: JsonRecord,
  jsonPath: JsonFieldPath,
  recordId: number,
): unknown {
  const { path, arrayKey, valueKey } = jsonPath;

  let current: JsonRecord = data;
  for (const key of path.slice(0, -1)) {
    current = (current[key] as JsonRecord) || {};
  }

  const finalKey = path[path.length - 1];

  if (arrayKey) {
    const arr = (current[finalKey] as JsonRecord[]) || [];
    const entry = arr.find((item) => item[arrayKey] === recordId);
    return entry ? entry[valueKey] : null;
  }

  return current[finalKey] ?? null;
}

/**
 * Coerce an edited value to the shape the JSON column stores.
 * Blank text is stored as null so "no value" reads the same as never-extracted.
 */
export function coerceValueForJson(
  value: FieldValue,
  valueType: string,
): unknown {
  if (value === null) return null;

  switch (valueType) {
    case 'number':
      return typeof value === 'number' ? value : parseFloat(String(value)) || 0;
    case 'boolean':
      return Boolean(value);
    case 'text':
    default: {
      const text = String(value).trim();
      return text === '' ? null : text;
    }
  }
}

/**
 * Write a value at a jsonPath, returning a new object. Shallow copies are made
 * along the path so the original is never mutated.
 */
export function applyJsonPathChange(
  data: JsonRecord,
  jsonPath: JsonFieldPath,
  valueType: string,
  recordId: number,
  newValue: FieldValue,
): JsonRecord {
  const { path, arrayKey, valueKey } = jsonPath;
  const coercedValue = coerceValueForJson(newValue, valueType);

  const result = { ...data };
  let current: JsonRecord = result;

  for (const key of path.slice(0, -1)) {
    current[key] = { ...((current[key] as JsonRecord) || {}) };
    current = current[key] as JsonRecord;
  }

  const finalKey = path[path.length - 1];

  if (arrayKey) {
    const arr = [...((current[finalKey] as JsonRecord[]) || [])];
    const existingIndex = arr.findIndex((item) => item[arrayKey] === recordId);

    if (existingIndex >= 0) {
      arr[existingIndex] = { ...arr[existingIndex], [valueKey]: coercedValue };
    } else {
      arr.push({ [arrayKey]: recordId, [valueKey]: coercedValue });
    }
    current[finalKey] = arr;
  } else {
    current[finalKey] = coercedValue;
  }

  return result;
}
