'use client';

import { useState } from 'react';
import { GroupBreadcrumb } from './GroupBreadcrumb';
import { GroupHeader } from './GroupHeader';
import { GroupFoldersSection } from './GroupFoldersSection';
import { GroupUsersSection } from './GroupUsersSection';
import { Separator } from '@/components/ui/separator';
import { SettingsPage } from '@/components/settings/SettingsPage';

interface GroupFolder {
  id: string;
  name: string;
  contractCount: number;
}

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

interface GroupPageClientProps {
  group: {
    id: number;
    publicUuid: string;
    name: string;
    memberCount: number;
    folders: GroupFolder[];
    users: GroupUser[];
  };
  availableUsers: AvailableUser[];
}

export function GroupPageClient({
  group,
  availableUsers,
}: GroupPageClientProps) {
  const [optimisticName, setOptimisticName] = useState<string | null>(null);

  const displayName = optimisticName ?? group.name;

  return (
    <SettingsPage className="space-y-6">
      {/* Breadcrumb Navigation */}
      <GroupBreadcrumb groupName={displayName} />

      {/* Page Header */}
      <GroupHeader
        groupId={group.id}
        groupName={displayName}
        memberCount={group.memberCount}
        onOptimisticUpdate={setOptimisticName}
      />

      {/* Main Content Sections */}
      <div className="space-y-10">
        <Separator />

        {/* Users Section */}
        <GroupUsersSection
          users={group.users}
          groupId={group.publicUuid}
          groupName={displayName}
          availableUsers={availableUsers}
        />

        <GroupFoldersSection
          folders={group.folders}
          groupId={group.publicUuid}
        />
      </div>
    </SettingsPage>
  );
}
