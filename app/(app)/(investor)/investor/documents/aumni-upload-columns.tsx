'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UploadingFile } from '@/components/documents/types';

export function retryColumn<T extends UploadingFile>(
  onRetry: () => void,
): ColumnDef<T, unknown> {
  return {
    id: 'retry',
    header: '',
    size: 120,
    cell: ({ row }) => {
      if (
        row.original.status !== 'error' ||
        row.original.id === 'pending-recovery'
      )
        return null;
      return (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            aria-label="Retry upload"
          >
            <RotateCcw />
            Retry
          </Button>
        </div>
      );
    },
  };
}
