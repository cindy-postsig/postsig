/**
 * Date utility functions shared across the application
 */

type DateInput =
  | string
  | Array<string | { date?: string }>
  | { date?: string }
  | null
  | undefined;

/**
 * Extract the first date from various date input formats
 *
 * Handles multiple input types:
 * - string: converts directly to Date
 * - Array: extracts first element (string or object with date property)
 * - Object: extracts date property
 * - null/undefined: returns null
 *
 * @param input - Date value in various formats
 * @returns Parsed Date object or null if input is invalid
 */
export function firstDate(input: DateInput): Date | null {
  if (!input) return null;

  if (typeof input === 'string') {
    return new Date(input);
  }

  if (Array.isArray(input) && input.length > 0) {
    const firstElement = input[0];
    const dateString =
      typeof firstElement === 'string' ? firstElement : firstElement?.date;
    return dateString ? new Date(dateString) : null;
  }

  if (typeof input === 'object' && 'date' in input && input.date) {
    return new Date(input.date);
  }

  return null;
}
