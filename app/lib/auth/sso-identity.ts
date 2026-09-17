import type { User } from '@supabase/supabase-js';

export function isSsoUser(
  user: Pick<User, 'identities'> | null | undefined,
): boolean {
  return (
    user?.identities?.some((identity) =>
      identity.provider.startsWith('sso:'),
    ) ?? false
  );
}

export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

type Claims = Record<string, unknown>;

const FULL_NAME_KEYS = ['name', 'fullname', 'displayname'];
const GIVEN_NAME_KEYS = ['givenname', 'firstname'];
const FAMILY_NAME_KEYS = ['familyname', 'lastname', 'surname'];

function isRecord(value: unknown): value is Claims {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKeys(claims: Claims): Claims {
  return Object.fromEntries(
    Object.entries(claims).map(([key, value]) => [
      key.toLowerCase().replace(/[_-]/g, ''),
      value,
    ]),
  );
}

// Entra's default `claims/name` carries the UPN, so an email-shaped value is
// a login identifier, not a person's name.
export function isPersonName(value: unknown): value is string {
  return (
    typeof value === 'string' && value.trim() !== '' && !value.includes('@')
  );
}

function firstNameClaim(sources: Claims[], keys: string[]): string | null {
  for (const key of keys) {
    for (const source of sources) {
      const value = source[key];
      if (isPersonName(value)) return value.trim();
    }
  }
  return null;
}

function nameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at <= 0) return null;
  const words = email
    .slice(0, at)
    .split('+')[0]
    .split(/[._-]+/)
    .filter(Boolean);
  if (words.length === 0) return null;
  return words
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function ssoDisplayName(
  user: Pick<User, 'email' | 'user_metadata'>,
): string | null {
  const metadata = normalizeKeys(user.user_metadata ?? {});
  const custom = metadata.customclaims;
  const sources = isRecord(custom)
    ? [metadata, normalizeKeys(custom)]
    : [metadata];

  const fullName = firstNameClaim(sources, FULL_NAME_KEYS);
  if (fullName) return fullName;

  const givenAndFamily = [
    firstNameClaim(sources, GIVEN_NAME_KEYS),
    firstNameClaim(sources, FAMILY_NAME_KEYS),
  ]
    .filter(Boolean)
    .join(' ');
  if (givenAndFamily) return givenAndFamily;

  return nameFromEmail(user.email);
}
