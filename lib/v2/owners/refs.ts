import type { OwnerSponsor, OwnerSponsorRef } from './types';

/** The embed's sponsor without its display name: what a save sends back. */
export function sponsorRefOf(sponsor: OwnerSponsor): OwnerSponsorRef {
  switch (sponsor.kind) {
    case 'user':
      return { kind: 'user', id: sponsor.id };
    case 'employee':
      return { kind: 'employee', id: sponsor.id };
    case 'label':
      return { kind: 'label', name: sponsor.name };
  }
}

/**
 * Identity of a sponsor row, matching the table's partial uniques: one row per
 * user, per employee, and per case-insensitive label. Shared by the writer,
 * the name matcher and the pickers so all three collapse the same duplicates.
 */
export function sponsorRefKey(ref: OwnerSponsorRef): string {
  return ref.kind === 'label'
    ? `label:${ref.name.trim().toLowerCase()}`
    : `${ref.kind}:${ref.id}`;
}

export function groupRefKey(orgUnitId: number): string {
  return `group:${orgUnitId}`;
}

/** Labels trimmed and dropped when empty; every arm deduped on its key. */
export function normalizeSponsorRefs(
  sponsors: readonly OwnerSponsorRef[],
): OwnerSponsorRef[] {
  const seen = new Set<string>();
  const normalized: OwnerSponsorRef[] = [];
  for (const sponsor of sponsors) {
    const ref: OwnerSponsorRef =
      sponsor.kind === 'label'
        ? { kind: 'label', name: sponsor.name.trim() }
        : sponsor;
    if (ref.kind === 'label' && ref.name === '') continue;
    const key = sponsorRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(ref);
  }
  return normalized;
}

export function normalizeGroupUnitIds(
  groupUnitIds: readonly number[],
): number[] {
  return [...new Set(groupUnitIds.filter(Number.isInteger))];
}
