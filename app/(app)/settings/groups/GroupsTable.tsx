'use client';

import { useState } from 'react';
import { OrgTable } from '@/components/settings/OrgTable';
import { DeleteGroupDialog } from '@/components/settings/DeleteGroupDialog';
import { useSettingsBasePath } from '@/hooks/useSettingsBasePath';

interface Group {
  id: number;
  publicUuid: string;
  name: string;
  description: string;
  memberCount: number;
  createdAt: string;
  folders: unknown[];
  contracts: unknown[];
  users: unknown[];
}

interface GroupsTableProps {
  groups: Group[];
}

export function GroupsTable({ groups }: GroupsTableProps) {
  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);
  const settingsBasePath = useSettingsBasePath();

  const handleRemoveGroup = (groupId: string | number) => {
    const numericId =
      typeof groupId === 'string' ? parseInt(groupId, 10) : groupId;
    const group = groups.find((g) => g.id === numericId);
    if (group) {
      setGroupToDelete(group);
    }
  };

  return (
    <>
      <OrgTable
        data={groups}
        columns={['group', 'memberCount', 'actionsGroups']}
        onRemoveGroup={handleRemoveGroup}
        meta={{ settingsBasePath }}
        emptyStateMessage="No groups found"
      />

      {groupToDelete && (
        <DeleteGroupDialog
          groupId={groupToDelete.id}
          groupName={groupToDelete.name}
          open={!!groupToDelete}
          onOpenChange={(open) => !open && setGroupToDelete(null)}
        />
      )}
    </>
  );
}
