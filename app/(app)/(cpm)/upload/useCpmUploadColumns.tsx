'use client';

import { useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Ban, Loader2, SaveIcon, X } from 'lucide-react';
import { Pencil1Icon } from '@radix-ui/react-icons';
import {
  fileNameColumn,
  statusColumn,
} from '@/components/documents/upload-columns';
import { CpmMetadataCell } from './CpmMetadataCell';
import { useCpmRowEdit } from './CpmRowEditContext';
import type { CpmUploadFile } from './CpmUploadPage';

function CpmActionsCell({
  file,
  onRemove,
}: {
  file: CpmUploadFile;
  onRemove: (id: string) => void;
}) {
  const ctx = useCpmRowEdit();

  if (file.status !== 'uploaded' || !ctx.canUpdate) {
    if (['ready', 'error', 'uploading', 'unsupported'].includes(file.status)) {
      const isUploading = file.status === 'uploading';
      const Icon = isUploading ? Ban : X;
      return (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => onRemove(file.id)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50"
            aria-label={isUploading ? 'Cancel upload' : 'Remove'}
          >
            <Icon className="h-4 w-4" />
          </button>
        </div>
      );
    }
    return null;
  }

  if (ctx.isEditing) {
    return (
      <div className="flex gap-1">
        <button
          type="button"
          onClick={ctx.save}
          className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50"
          aria-label="Save"
          disabled={ctx.isSaving}
        >
          {ctx.isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SaveIcon className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={ctx.cancel}
          className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50"
          aria-label="Cancel"
          disabled={ctx.isSaving}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={ctx.startEdit}
        className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50"
        aria-label="Edit"
        disabled={!file.dbContractId}
      >
        <Pencil1Icon className="h-4 w-4" />
      </button>
    </div>
  );
}

function CpmMetadataCellWrapper({
  field,
}: {
  field: 'folder' | 'sponsor' | 'group' | 'tag';
}) {
  return <CpmMetadataCell field={field} />;
}

interface UseCpmUploadColumnsOptions {
  onRemove: (id: string) => void;
}

export function useCpmUploadColumns({
  onRemove,
}: UseCpmUploadColumnsOptions): ColumnDef<CpmUploadFile, unknown>[] {
  return useMemo(
    (): ColumnDef<CpmUploadFile, unknown>[] => [
      {
        ...fileNameColumn<CpmUploadFile>(),
        size: 0, // use className width instead
        meta: { className: 'w-[36%]' },
      },
      {
        id: 'folder',
        header: 'Folder',
        meta: { className: 'w-[12%]' },
        cell: () => <CpmMetadataCellWrapper field="folder" />,
      },
      {
        id: 'sponsor',
        header: 'Sponsor',
        meta: { className: 'w-[12%]' },
        cell: () => <CpmMetadataCellWrapper field="sponsor" />,
      },
      {
        id: 'group',
        header: 'Group',
        meta: { className: 'w-[12%]' },
        cell: () => <CpmMetadataCellWrapper field="group" />,
      },
      {
        id: 'tags',
        header: 'Tags',
        meta: { className: 'w-[12%]' },
        cell: () => <CpmMetadataCellWrapper field="tag" />,
      },
      {
        ...statusColumn<CpmUploadFile>(),
        meta: { className: 'w-[8%]' },
      },
      {
        id: 'actions',
        header: '',
        meta: { className: 'w-[8%]' },
        cell: ({ row }) => (
          <CpmActionsCell file={row.original} onRemove={onRemove} />
        ),
      },
    ],
    [onRemove],
  );
}
