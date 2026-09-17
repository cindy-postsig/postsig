const POSTSIG_DOMAIN = 'postsig.com';

export function isPostsigUser(email: string | null | undefined): boolean {
  if (!email) return false;

  return email.toLowerCase().endsWith(`@${POSTSIG_DOMAIN}`);
}

export interface OrgUserVisibilityOptions {
  currentUserEmail?: string | null;
  includePostsigUsers?: boolean;
}

/**
 * PostSig staff seated in a customer org ("shadow users") must not surface in
 * customer-facing lists. Every org user list goes through here so a new surface
 * inherits the rule by default instead of re-deriving it and leaking (PSK-1977).
 */
export function filterVisibleOrgUsers<T extends { email?: string | null }>(
  users: T[],
  options?: OrgUserVisibilityOptions,
): T[] {
  if (options?.includePostsigUsers) return users;
  if (isPostsigUser(options?.currentUserEmail)) return users;

  return users.filter((user) => !isPostsigUser(user.email));
}
