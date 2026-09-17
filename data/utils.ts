import type { SupabaseClient } from '@supabase/supabase-js';
import { userRoles } from '@/constants/data';
import type { Database } from '@/database.types';

/** `'all'` is the unfiltered reviewer/extractor view; a set is an id allowlist. */
export type VisibleContractIds = 'all' | Set<number>;

/**
 * Read-side twin of `extendQueryByUserRoleACL`'s contract branch: it resolves
 * visibility without baking it into a query, so one org-wide result set can be
 * sliced per requester instead of being fetched and cached per user.
 */
export async function resolveVisibleContractIds(
  supabase: SupabaseClient<Database>,
  {
    organizationId,
    userId,
    userRole,
  }: { organizationId: string; userId: string; userRole: number },
): Promise<VisibleContractIds> {
  switch (userRole) {
    case userRoles.clientAdmin:
    case userRoles.clientSupervisor:
    case userRoles.clientUser: {
      const { data, error } = await supabase.rpc('contracts_visible_to', {
        p_organization_id: organizationId,
        p_user_id: userId,
      });

      if (error) {
        throw error;
      }

      return new Set((data ?? []).map((row) => row.id));
    }

    case userRoles.postsigReviewer:
    case userRoles.postsigExtractor:
      return 'all';

    default:
      return new Set<number>();
  }
}

/**
 * Universal ACL query builder using database RPC functions
 * @param resourceType - The type of resource ('contract' or 'folder')
 * @param supabase - The Supabase client instance
 * @param supabaseQuery - The Supabase query to extend
 * @param userId - The current user's ID
 * @param userRole - The current user's role
 * @param organizationId - The organization ID
 */
export async function extendQueryByUserRoleACL(
  resourceType: 'contract' | 'folder',
  supabase: any,
  supabaseQuery: any,
  userId: string,
  userRole: number,
  organizationId: string,
) {
  const rpcFunction =
    resourceType === 'contract' ? 'contracts_visible_to' : 'folders_visible_to';

  switch (userRole) {
    case userRoles.clientAdmin:
    case userRoles.clientUser:
    case userRoles.clientSupervisor:
      const { data: userVisibleIds, error: userError } = await supabase.rpc(
        rpcFunction,
        { p_organization_id: organizationId, p_user_id: userId },
      );

      if (userError) {
        console.error(`Error calling ${rpcFunction}:`, userError);
        throw userError;
      }

      if (!userVisibleIds || userVisibleIds.length === 0) {
        return supabaseQuery.eq('id', -1);
      }

      const visibleIds = userVisibleIds.map((row: any) => row.id);

      return await supabaseQuery.in('id', visibleIds);

    case userRoles.postsigReviewer:
    case userRoles.postsigExtractor:
      return await supabaseQuery;

    default:
      return supabaseQuery.eq('id', -1);
  }
}

// Backwards-compatible wrapper for contracts - now executes query and returns data
export async function extendSupabaseQueryByUserRole(
  supabase: any,
  supabaseQuery: any,
  userId: string,
  userRole: number,
  organizationId: string,
) {
  return extendQueryByUserRoleACL(
    'contract',
    supabase,
    supabaseQuery,
    userId,
    userRole,
    organizationId,
  );
}

// Backwards-compatible wrapper for folders
export async function extendFolderQueryByUserRole(
  supabase: any,
  supabaseQuery: any,
  userId: string,
  userRole: number,
  organizationId: string,
) {
  return extendQueryByUserRoleACL(
    'folder',
    supabase,
    supabaseQuery,
    userId,
    userRole,
    organizationId,
  );
}
