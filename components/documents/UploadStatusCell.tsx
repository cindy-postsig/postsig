'use client';

import {
  Loader2,
  CheckCircle2,
  XCircle,
  CircleDashed,
  Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UploadStatus } from './types';

const STATUS_CONFIG: Record<
  UploadStatus,
  {
    label: string;
    className?: string;
    showSpinner?: boolean;
    showCheck?: boolean;
    showError?: boolean;
    showReady?: boolean;
    showSkip?: boolean;
  }
> = {
  ready: { label: 'Ready', showReady: true },
  uploading: { label: 'Uploading', showSpinner: true },
  processing: { label: 'Processing', showSpinner: true },
  uploaded: {
    label: 'Uploaded',
    className: 'text-green-600',
    showCheck: true,
  },
  error: { label: 'Failed', className: 'text-red-600', showError: true },
  unsupported: {
    label: 'Unsupported',
    className: 'text-amber-900 dark:text-amber-200',
    showSkip: true,
  },
};

interface UploadStatusCellProps {
  status: UploadStatus;
  errorMessage?: string;
  progress?: number;
}

export function UploadStatusCell({
  status,
  errorMessage,
  progress,
}: UploadStatusCellProps) {
  const config = STATUS_CONFIG[status];

  const hasErrorDetail =
    (status === 'error' || status === 'uploading') && errorMessage;

  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex-shrink-0">
        {config.showReady && (
          <CircleDashed className="h-4 w-4 text-muted-foreground" />
        )}
        {config.showSpinner && <Loader2 className="h-4 w-4 animate-spin" />}
        {config.showCheck && (
          <CheckCircle2 className="text-green-600 h-4 w-4" />
        )}
        {config.showError && <XCircle className="h-4 w-4 text-red-600" />}
        {config.showSkip && (
          <Ban className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        )}
      </div>
      <div className="min-w-0">
        <span className={cn('leading-tight', config.className)}>
          {config.label}
          {status === 'uploading' && progress != null && (
            <span className="ml-1 text-muted-foreground">{progress}%</span>
          )}
        </span>
        {hasErrorDetail && (
          <p className="mt-0.5 text-xs text-muted-foreground">{errorMessage}</p>
        )}
      </div>
    </div>
  );
}
