'use client';

import { useContext } from 'react';
import { UserContext } from '@/app/userProvider';
import { userRoles } from '@/constants/data';

/**
 * Returns true if the current user has permission to edit investor fields
 * (value overrides). Only client supervisors and PostSig admins can edit.
 * Used for UI gating only — server-side enforcement lives in
 * app/lib/actions/investor/overrides.ts.
 */
export function useCanEditInvestor(): boolean {
  const userContext = useContext(UserContext);
  const role = userContext?.userMetadata?.userRole;
  return role === userRoles.clientSupervisor || role === userRoles.postsigAdmin;
}
