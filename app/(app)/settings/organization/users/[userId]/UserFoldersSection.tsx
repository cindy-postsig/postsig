'use client';

import { OrgTable } from '@/components/settings/OrgTable';
import { FolderIcon } from 'lucide-react';

interface UserFolder {
  id: string;
  name: string;
  contractCount: number;
  assignedAt: string;
}

interface UserFoldersSectionProps {
  folders: UserFolder[];
}

// Transform UserFolder to Folder format for the table
const transformFoldersForTable = (folders: UserFolder[]) => {
  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    contractCount: folder.contractCount,
    addedAt: folder.assignedAt,
  }));
};

export function UserFoldersSection({ folders }: UserFoldersSectionProps) {
  const handleRemoveFolder = (folderId: string) => {
    // TODO: Implement folder removal logic
    void folderId;
  };

  const columns = ['folder', 'contractCount', 'actionsFolders'];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-base">Folders ({folders.length})</h3>
      </div>

      <OrgTable
        data={transformFoldersForTable(folders)}
        columns={columns}
        onRemoveFolder={handleRemoveFolder}
        emptyStateMessage="No folders assigned"
      />
    </div>
  );
}
