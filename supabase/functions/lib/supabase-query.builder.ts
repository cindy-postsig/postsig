const userRoles = {
  postsigUser: 3,
  postsigReviewer: 6,
  postsigExtractor: 7,
  clientAdmin: 11,
  clientSupervisor: 12,
  clientUser: 14,
};

export async function extendContractsFetchQueryByUserRole(
  supabase: any,
  supabaseQuery: any,
  userId: string,
  roles: number[],
  orgUserIds: string[] = [],
  organizationId?: string,
) {
  let userRole: number | undefined;
  if (roles.length === 1) {
    userRole = roles[0];
  } else if (
    roles.includes(userRoles.clientAdmin) ||
    roles.includes(userRoles.clientSupervisor)
  ) {
    userRole = userRoles.clientAdmin;
  } else if (roles.some((role) => role === userRoles.clientUser)) {
    userRole = userRoles.clientUser;
  }

  switch (userRole) {
    case userRoles.clientUser:
    case userRoles.clientAdmin: {
      if (!organizationId) return supabaseQuery.eq('id', -1);
      const { data, error } = await supabase.rpc('contracts_visible_to', {
        p_organization_id: organizationId,
        p_user_id: userId,
      });
      if (error) {
        console.error('Error calling contracts_visible_to:', error);
        return supabaseQuery.eq('id', -1);
      }
      const visibleIds = (data ?? []).map((row: any) => row.id);
      return visibleIds.length
        ? supabaseQuery.in('id', visibleIds)
        : supabaseQuery.eq('id', -1);
    }
    case userRoles.clientSupervisor: {
      if (!organizationId || !orgUserIds?.length)
        return supabaseQuery.eq('id', -1);
      const visibilityPromises = orgUserIds.map((uid) =>
        supabase.rpc('contracts_visible_to', {
          p_organization_id: organizationId,
          p_user_id: uid,
        }),
      );
      const results = await Promise.all(visibilityPromises);
      const allVisibleIds = new Set<string | number>();
      results.forEach(({ data, error }) => {
        if (error) console.error('Error calling contracts_visible_to:', error);
        (data ?? []).forEach((row: any) => allVisibleIds.add(row.id));
      });
      return allVisibleIds.size
        ? supabaseQuery.in('id', Array.from(allVisibleIds))
        : supabaseQuery.eq('id', -1);
    }
    case userRoles.postsigUser:
      return supabaseQuery.eq('user_id', userId);
    default:
      return supabaseQuery.eq('id', -1);
  }
}
