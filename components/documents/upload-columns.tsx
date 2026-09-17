'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { X, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { UploadStatusCell } from './UploadStatusCell';
import type { UploadingFile } from './types';

function getFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return 'FILE';
  return fileName.slice(dot + 1).toUpperCase();
}

function getBadgeClass(ext: string, isUnsupported: boolean): string {
  if (isUnsupported) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
  }
  if (ext === 'ZIP') {
    return 'bg-blue-200 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
  }
  return 'bg-foreground/10 text-foreground/85 dark:bg-foreground/15 dark:text-foreground';
}

export function fileNameColumn<T extends UploadingFile>(): ColumnDef<
  T,
  unknown
> {
  return {
    id: 'fileName',
    header: 'File Name',
    cell: ({ row }) => {
      const isUnsupported = row.original.status === 'unsupported';
      const ext = getFileExtension(row.original.fileName);
      const badgeClass = getBadgeClass(ext, isUnsupported);
      const textClass = isUnsupported
        ? 'text-amber-900 dark:text-amber-200'
        : '';
      return (
        <div className="flex items-center gap-2">
          <span
            className={`font-medium inline-flex h-5 min-w-[40px] flex-shrink-0 items-center justify-center rounded px-1.5 font-mono text-[10px] uppercase tracking-wide ${badgeClass}`}
          >
            {ext}
          </span>
          <span className={`truncate ${textClass}`}>
            {row.original.fileName}
          </span>
        </div>
      );
    },
  };
}

export function statusColumn<T extends UploadingFile>(): ColumnDef<T, unknown> {
  return {
    id: 'status',
    header: 'Status',
    size: 320,
    cell: ({ row }) => (
      <UploadStatusCell
        status={row.original.status}
        errorMessage={row.original.errorMessage}
        progress={row.original.progress}
      />
    ),
  };
}

export function removeColumn<T extends UploadingFile>(
  onRemove: (id: string) => void,
): ColumnDef<T, unknown> {
  return {
    id: 'remove',
    header: '',
    size: 64,
    cell: ({ row }) => {
      const file = row.original;
      if (!['ready', 'error', 'uploading', 'unsupported'].includes(file.status))
        return null;
      const isUploading = file.status === 'uploading';
      const Icon = isUploading ? Ban : X;
      const label = isUploading
        ? 'Cancel this upload'
        : 'Remove from upload list';
      return (
        <div className="flex justify-center">
          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-8 px-0"
                  onClick={() => onRemove(file.id)}
                  aria-label={label}
                >
                  <Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      );
    },
  };
}
