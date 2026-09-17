'use client';

import { OrgTable } from '@/components/settings/OrgTable';
import { revokeGroupAccessFromFolder } from '@/app/lib/actions/organization-groups';
import { toast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';

interface GroupFolder {
  id: string;
  name: string;
  contractCount: number;
  description?: string;
}

interface GroupFoldersSectionProps {
  folders: GroupFolder[];
  groupId: string;
}

export function GroupFoldersSection({
  folders,
  groupId,
}: GroupFoldersSectionProps) {
  const router = useRouter();

  const handleRevokeFolder = async (folderId: string) => {
    const result = await revokeGroupAccessFromFolder(groupId, folderId);

    if (result.success) {
      toast({
        title: 'Success',
        description: 'Revoked access to folder',
      });
      router.refresh();
    } else {
      toast({
        title: 'Error',
        description: result.error || 'Failed to revoke access',
        variant: 'destructive',
      });
    }
  };

  const columns = ['folder', 'contractCount', 'actionsFolders'];

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-base">
          Shared Folders ({folders.length})
        </h3>
      </div>

      {/* Folders Table */}
      <OrgTable
        data={folders}
        columns={columns}
        onRemoveFolder={handleRevokeFolder}
        emptyStateMessage="No folders assigned"
      />
    </div>
  );
}
