'use client';

import FieldSelector from '@/components/documents/FieldSelector';
import { useCpmRowEdit } from './CpmRowEditContext';

type MetadataField = 'folder' | 'sponsor' | 'group' | 'tag';

interface CpmMetadataCellProps {
  field: MetadataField;
}

export function CpmMetadataCell({ field }: CpmMetadataCellProps) {
  const ctx = useCpmRowEdit();

  const fieldConfig = {
    folder: {
      data: ctx.orgFolders,
      isLoading: ctx.isOrgFoldersLoading,
      multiSelect: false,
      savedItems: ctx.savedFolderData,
      selectedItems: ctx.selectedFolders,
      setSelectedItems: ctx.setSelectedFolders,
    },
    sponsor: {
      data: ctx.orgUsers,
      isLoading: ctx.isOrgUsersLoading,
      multiSelect: true,
      savedItems: ctx.savedSponsorData,
      selectedItems: ctx.selectedSponsors,
      setSelectedItems: ctx.setSelectedSponsors,
    },
    group: {
      data: ctx.orgBusinessGroups,
      isLoading: ctx.isOrgBusinessGroupsLoading,
      multiSelect: true,
      savedItems: ctx.savedGroupData,
      selectedItems: ctx.selectedBusinessGroups,
      setSelectedItems: ctx.setSelectedBusinessGroups,
    },
    tag: {
      data: ctx.orgTags,
      isLoading: ctx.isOrgTagsLoading,
      multiSelect: true,
      savedItems: ctx.savedTagData,
      selectedItems: ctx.selectedTags,
      setSelectedItems: ctx.setSelectedTags,
    },
  } as const;

  const config = fieldConfig[field];

  return (
    <FieldSelector
      field={field}
      data={config.data}
      isLoading={config.isLoading}
      isEditing={
        ctx.isEditing && (field !== 'group' || ctx.canManageOrganization)
      }
      multiSelect={config.multiSelect}
      savedItems={config.savedItems}
      selectedItems={config.selectedItems}
      setSelectedItems={config.setSelectedItems}
      disableSelect={ctx.isSaving}
    />
  );
}
