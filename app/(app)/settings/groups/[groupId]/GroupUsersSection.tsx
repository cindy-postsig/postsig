'use client';

import { OrgTable } from '@/components/settings/OrgTable';
import AddUsersToGroupDialog from '@/components/settings/AddUsersToGroupDialog';
import { removeUserFromGroup } from '@/app/lib/actions/organization-groups';
import { toast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';

interface GroupUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

interface AvailableUser {
  id: string;
  name: string | null;
  email: string | null;
  job_title: string | null;
}

interface GroupUsersSectionProps {
  users: GroupUser[];
  groupId: string;
  groupName: string;
  availableUsers: AvailableUser[];
}

export function GroupUsersSection({
  users,
  groupId,
  groupName,
  availableUsers,
}: GroupUsersSectionProps) {
  const router = useRouter();

  const handleRemoveUser = async (userId: string) => {
    const result = await removeUserFromGroup(groupId, userId);

    if (result.success) {
      toast({
        title: 'Success',
        description: 'User removed from group',
      });
      router.refresh();
    } else {
      toast({
        title: 'Error',
        description: result.error || 'Failed to remove user from group',
        variant: 'destructive',
      });
    }
  };

  const columns = ['user', 'role', 'actionsGroupUsers'];

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-base">
            Members ({users.length} user{users.length === 1 ? '' : 's'})
          </h3>
        </div>
        <AddUsersToGroupDialog
          groupId={groupId}
          groupName={groupName}
          availableUsers={availableUsers}
        />
      </div>

      {/* Users Table */}
      <OrgTable
        data={users}
        columns={columns}
        onRemoveUser={handleRemoveUser}
      />
    </div>
  );
}
