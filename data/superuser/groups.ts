'use server';
import { createClient } from '@/utils/supabase/service_server';
import { unstable_noStore as noStore } from 'next/cache';
import logger from '@/utils/pino';
import { getUserMetadata } from '@/data/users';
import { filterVisibleOrgUsers } from '@/lib/utils/users';

export async function getOrgUsers() {
  const supabase = createClient();
  noStore();

  try {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      throw new Error('User metadata not found');
    }

    const { data, error } = await supabase
      .from('users')
      .select(
        `
        id,
        name,
        email,
        user_roles2!inner(role_id)
      `,
      )
      .eq('organization_id', userMetadata.organizationId)
      .order('name');

    if (error) throw error;

    const users = (data ?? []).map((user) => ({
      id: user.id,
      name: user.name || '',
      email: user.email || '',
      role: user.user_roles2?.[0]?.role_id,
    }));

    return filterVisibleOrgUsers(users, {
      currentUserEmail: userMetadata.userProfile?.email,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch org users');
    throw error;
  }
}

export async function getOrgGroups() {
  const supabase = createClient();
  noStore();

  try {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      throw new Error('User metadata not found');
    }

    // Get all groups and their members
    const { data, error } = await supabase
      .from('groups')
      .select(
        `
        id,
        name,
        public_uuid,
        group_members (
          user_id,
          users (
            id,
            name,
            email
          )
        )
      `,
      )
      .eq('organization_id', userMetadata.organizationId)
      .order('name');

    if (error) throw error;

    return (data || []).map((group: any) => ({
      id: group.id,
      name: group.name || '',
      publicUuid: group.public_uuid || '',
      memberCount: group.group_members?.length || 0,
      members: (group.group_members || []).map((m: any) => ({
        id: m.users?.id || m.user_id,
        name: m.users?.name || '',
        email: m.users?.email || '',
      })),
    }));
  } catch (error) {
    logger.error({ error }, 'Failed to fetch org groups');
    throw error;
  }
}

export async function getGroupMembers(groupId: number) {
  const supabase = createClient();
  noStore();

  try {
    const { data, error } = await supabase
      .from('group_members')
      .select(
        `
        user_id,
        users (
          id,
          name,
          email
        )
      `,
      )
      .eq('group_id', groupId);

    if (error) throw error;

    return (data || []).map((item: any) => ({
      id: item.users?.id || '',
      name: item.users?.name || '',
      email: item.users?.email || '',
    }));
  } catch (error) {
    logger.error({ error, groupId }, 'Failed to fetch group members');
    throw error;
  }
}
