'use client';

import { useContext } from 'react';
import { UserContext } from '@/app/userProvider';
import { userRoles } from '@/constants/data';

/**
 * Whether the current user can manage KPI definitions — adding or removing an
 * org's custom KPIs. Customer-facing authorization: only the client "Admin"
 * role (clientSupervisor) qualifies. Internal PostSig roles are excluded, and
 * this mirrors the server-side gate in lib/v2/kpis/custom-kpis.ts.
 * UI-gating only; the server gate is the boundary.
 */
export function useCanManageKpis(): boolean {
  const userContext = useContext(UserContext);
  const role = userContext?.userMetadata?.userRole;
  return role === userRoles.clientSupervisor;
}

/**
 * Whether the current user can edit a KPI's value — a wider set than the
 * definitions above, covering "Manager" (clientAdmin) as well. Mirrors
 * VALUE_EDIT_ROLES in lib/v2/kpis/custom-kpis.ts.
 */
export function useCanEditKpiValues(): boolean {
  const userContext = useContext(UserContext);
  const role = userContext?.userMetadata?.userRole;
  return role === userRoles.clientAdmin || role === userRoles.clientSupervisor;
}
