export function normalizeEmail(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized === '' ? null : normalized;
}

const PLACEHOLDER_PATTERN = /^(?:[-–—]+|n\/?a|none|null)$/i;

export function normalizeOptional(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || PLACEHOLDER_PATTERN.test(trimmed)) return null;
  return trimmed;
}
