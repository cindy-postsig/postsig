import { userRoles } from '@/constants/data';
import type { RoleId } from '@postsig/toolkit';

export const VALID_CLIENT_ROLES = [
  userRoles.clientAdmin,
  userRoles.clientSupervisor,
  userRoles.clientUser,
] as const;

export type ClientRoleId = (typeof VALID_CLIENT_ROLES)[number];

export function isValidClientRole(role: number): role is RoleId {
  return VALID_CLIENT_ROLES.includes(role as ClientRoleId);
}

/**
 * Roles that may not perform state-changing requests. Enforcement has to be
 * server-side: a disabled button and a Next-Action id are both recoverable from
 * client-side JavaScript, so neither bounds anything.
 *
 * Roles 13 (clientReviewer) and 15 (clientTrialUser) are deliberately absent.
 * `defineAbilitiesFor` grants them nothing, so listing them here would change
 * behaviour beyond the read-only boundary this guard exists to enforce.
 */
export const READ_ONLY_ROLES: readonly number[] = [userRoles.clientUser];

export function isReadOnlyRole(role: number | null | undefined): boolean {
  return typeof role === 'number' && READ_ONLY_ROLES.includes(role);
}
