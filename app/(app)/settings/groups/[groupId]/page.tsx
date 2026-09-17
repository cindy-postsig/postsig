import { AuthorizationError } from '@/lib/errors';
import { getAllOrgUserData, getUser } from '@/data/users';
import { notFound, redirect } from 'next/navigation';
import { getGroupById } from '@/app/lib/actions/organization-groups';
import { GroupPageClient } from './GroupPageClient';
import { verifyAbility } from '@/data/user-permissions';

export default async function GroupManagePage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  let authData;
  try {
    authData = await verifyAbility('manage', 'Group');
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect('/dashboard');
    }
    throw error;
  }

  const { groupId } = await params;
  const currentUser = await getUser();
  const group = await getGroupById(groupId);

  if (!group) {
    notFound();
  }

  const allOrgUsers = await getAllOrgUserData(authData.organizationId, {
    currentUserEmail: currentUser?.email,
  });

  // Filter out users already in the group
  const groupUserIds = new Set(group.users.map((u) => u.id));
  const availableUsers = allOrgUsers
    .filter((user) => !groupUserIds.has(user.id))
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      job_title: user.job_title,
    }));

  return <GroupPageClient group={group} availableUsers={availableUsers} />;
}
