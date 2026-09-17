'use client';

import { type ReactNode, type Ref } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  FileDropZone,
  type FileDropZoneHandle,
} from '@/components/documents/FileDropZone';
import { UploadProgressTable } from '@/components/documents/UploadProgressTable';
import type { UploadingFile } from '@/components/documents/types';
import type { UploadQueue } from '@/components/documents/useUploadQueue';

interface UploadQueueShellProps<T extends UploadingFile> {
  queue: UploadQueue<T>;
  columns: ColumnDef<T, unknown>[];
  rowWrapper?: (file: T, children: ReactNode) => ReactNode;
  displayFiles?: T[];
  headerText: string;
  maxHeightVh?: number;
  showProcessingNote?: boolean;
  dropZoneRef?: Ref<FileDropZoneHandle>;
  variant?: 'default' | 'cpm';
  maxFiles?: number;
  isActive?: boolean;
  hideStaminaNote?: boolean;
}

export const STAMINA_NOTE =
  'Note: For large uploads or bulk processing jobs, please ensure your computer remains awake and connected to the internet until processing is complete. If your device goes to sleep or loses network connectivity, the operation may be interrupted and progress could be lost.';

export function UploadQueueShell<T extends UploadingFile>({
  queue,
  columns,
  rowWrapper,
  displayFiles,
  headerText,
  maxHeightVh,
  showProcessingNote,
  dropZoneRef,
  variant = 'default',
  maxFiles,
  isActive = true,
  hideStaminaNote = false,
}: UploadQueueShellProps<T>) {
  const {
    handleFiles,
    handleUploadClick,
    handleCancel,
    clearAll,
    clearUploaded,
    hasFiles,
    hasReady,
    hasUploaded,
    hasActiveUpload,
    isCancelling,
    allBlocked,
  } = queue;
  const filesToShow = displayFiles ?? queue.files;
  const showFooter = hasReady || allBlocked || hasUploaded || hasActiveUpload;

  return (
    <>
      {filesToShow.length > 0 && (
        <UploadProgressTable<T>
          files={filesToShow}
          columns={columns}
          collapsible
          maxHeightVh={maxHeightVh}
          showProcessingNote={showProcessingNote}
          headerText={headerText}
          rowWrapper={rowWrapper}
        />
      )}

      {showFooter && (
        <div className="mb-8 flex justify-end gap-2">
          {hasActiveUpload ? (
            <Button
              variant="outline"
              size="lg"
              onClick={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling ? 'Cancelling…' : 'Cancel'}
            </Button>
          ) : (
            <>
              {hasUploaded && (
                <Button variant="outline" size="lg" onClick={clearUploaded}>
                  Clear Uploaded
                </Button>
              )}
              {(hasReady || allBlocked) && (
                <Button variant="outline" size="lg" onClick={clearAll}>
                  Clear
                </Button>
              )}
              {hasReady && (
                <Button onClick={handleUploadClick} size="lg">
                  Upload Documents
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <div className={hasActiveUpload ? 'hidden' : undefined}>
        <FileDropZone
          ref={dropZoneRef}
          onFiles={handleFiles}
          compact={hasFiles}
          variant={variant}
          isActive={isActive && !hasActiveUpload}
          maxFiles={maxFiles}
        />
      </div>

      {!hideStaminaNote && (
        <Alert variant="info" className="mt-4">
          <AlertDescription>{STAMINA_NOTE}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
