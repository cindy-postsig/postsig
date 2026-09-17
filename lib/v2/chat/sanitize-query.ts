interface SanitizeQueryInput {
  query: string;
  organizationName: string;
  orgUserNames: string[];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const UNICODE_WORD_CHAR = '[\\p{L}\\p{N}_\\p{M}]';

function unicodeWordBoundaryPattern(escaped: string): string {
  return `(?<!${UNICODE_WORD_CHAR})${escaped}(?!${UNICODE_WORD_CHAR})`;
}

export function sanitizeQuery({
  query,
  organizationName,
  orgUserNames,
}: SanitizeQueryInput): string {
  if (!query) return query;

  let result = query;

  const emailSentinel = '__EMAIL_PLACEHOLDER__';
  result = result.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    emailSentinel,
  );

  if (organizationName) {
    const orgPattern = new RegExp(
      unicodeWordBoundaryPattern(escapeRegex(organizationName)),
      'giu',
    );
    result = result.replace(orgPattern, '[ACME]');
  }

  const fragmentSet = new Set<string>();
  for (const name of orgUserNames) {
    if (!name) continue;
    const trimmed = name.trim();
    if (!trimmed) continue;

    fragmentSet.add(trimmed);

    const tokens = trimmed.split(/\s+/);
    for (const token of tokens) {
      if (token.length > 1) {
        fragmentSet.add(token);
      }
    }
  }

  // Sort longest-first to prevent partial replacement artifacts
  const fragments = Array.from(fragmentSet).sort((a, b) => b.length - a.length);

  // Use sentinels to avoid later passes re-matching the "John Doe" placeholder
  const sentinels: string[] = [];
  for (let i = 0; i < fragments.length; i++) {
    const sentinel = `__NAME_PLACEHOLDER_${i}__`;
    sentinels.push(sentinel);
    const namePattern = new RegExp(
      unicodeWordBoundaryPattern(escapeRegex(fragments[i])),
      'giu',
    );
    result = result.replace(namePattern, sentinel);
  }

  for (const sentinel of sentinels) {
    result = result.replaceAll(sentinel, '[John Doe]');
  }

  result = result.replaceAll(emailSentinel, '[user@example.com]');

  return result;
}
