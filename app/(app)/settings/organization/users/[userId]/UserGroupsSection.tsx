'use client';

import { OrgTable } from '@/components/settings/OrgTable';
import { useSettingsBasePath } from '@/hooks/useSettingsBasePath';

interface UserGroup {
  id: string;
  publicUuid: string;
  name: string;
  role: string;
  assignedAt: string;
  memberCount?: number;
}

interface UserGroupsSectionProps {
  groups: UserGroup[];
}

// Transform UserGroup to Group format for the table
const transformGroupsForTable = (groups: UserGroup[]) => {
  return groups.map((group) => ({
    id: group.id,
    publicUuid: group.publicUuid,
    name: group.name,
    role: group.role,
    addedAt: group.assignedAt,
    memberCount: group.memberCount,
  }));
};

export function UserGroupsSection({ groups }: UserGroupsSectionProps) {
  const settingsBasePath = useSettingsBasePath();

  const handleRemoveGroup = (groupId: string | number) => {
    // TODO: Implement group removal logic
    void groupId;
  };

  const columns = [
    'group', // Will show group name
    'memberCount',
    'actionsUserGroups',
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-base">Groups ({groups.length})</h3>
      </div>

      <OrgTable
        data={transformGroupsForTable(groups)}
        columns={columns}
        onRemoveGroup={handleRemoveGroup}
        meta={{ settingsBasePath }}
        emptyStateMessage="No groups assigned"
      />
    </div>
  );
}
