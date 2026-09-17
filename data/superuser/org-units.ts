import { getUserMetadata } from '@/data/users';
import { AuthorizationError } from '@/lib/errors';
import {
  getBusinessGroupNodes,
  type BusinessGroupNode,
} from '@/lib/v2/org-units';

/**
 * The business-group list the employee dialogs and the import UI offer.
 * Nodes, not ACL `groups` rows — sharing keeps its own list.
 */
export async function getOrgBusinessGroupNodes(): Promise<BusinessGroupNode[]> {
  const me = await getUserMetadata();
  if (!me?.organizationId) {
    throw new AuthorizationError('Not authenticated');
  }
  return getBusinessGroupNodes(me.organizationId);
}
