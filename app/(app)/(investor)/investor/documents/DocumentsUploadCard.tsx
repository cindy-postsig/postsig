'use client';

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/utils/supabase/client';
import {
  sanitizeFileName,
  buildSafePath,
  PathTraversalError,
} from '@/utils/helpers';
import { useToast } from '@/components/ui/use-toast';
import { useWarnBeforeUnload } from '@/hooks/useWarnBeforeUnload';
import { useProcessInvestorDocument } from '@/hooks/api/useProcessInvestorDocument';
import { v4 as uuidv4 } from 'uuid';
import {
  startUpload,
  subscribe as subscribeUploadManager,
  abort as managerAbort,
  clearSnapshot,
  UploadAbortedError,
  type SupaClient,
} from '@/app/(app)/(investor)/investor/documents/documents-upload-manager';
import {
  findPendingUploadMatch,
  loadPending,
  removePending,
} from '@/app/(app)/(investor)/investor/documents/documents-upload-state';
import {
  FileDropZone,
  type FileDropZoneHandle,
} from '@/components/documents/FileDropZone';
import {
  fileNameColumn,
  statusColumn,
  removeColumn,
} from '@/components/documents/upload-columns';
import { UploadQueueShell } from '@/components/documents/UploadQueueShell';
import {
  useUploadQueue,
  readQueuedFile,
} from '@/components/documents/useUploadQueue';
import { type ColumnDef } from '@tanstack/react-table';
import { RotateCcw } from 'lucide-react';
import type { UploadingFile } from '@/components/documents/types';

const MAX_FILES = 500;
const MAX_CONCURRENCY = 1;
const RESUME_ROW_MESSAGE = 'Upload interrupted — re-select the file to resume';

function isResumeRow(f: UploadingFile): boolean {
  return f.status === 'error' && f.errorMessage === RESUME_ROW_MESSAGE;
}

export interface UploadingDocument {
  id: string;
  fileName: string;
  status: 'ready' | 'uploading' | 'processing' | 'uploaded' | 'error';
  documentId?: string;
}

export interface DocumentsUploadCardHandle {
  browse: () => void;
  clear: () => void;
}

interface DocumentsUploadCardProps {
  onUploadStart?: (doc: UploadingDocument) => void;
  onUploadProgress?: (id: string, data: Partial<UploadingDocument>) => void;
  onUploadComplete?: (id: string, data: UploadingDocument) => void;
  onFilesAdded?: () => void;
  organizationId: string;
  isActive?: boolean;
}

export const DocumentsUploadCard = forwardRef<
  DocumentsUploadCardHandle,
  DocumentsUploadCardProps
>(function DocumentsUploadCard(
  {
    onUploadStart,
    onUploadProgress,
    onUploadComplete,
    onFilesAdded,
    organizationId,
    isActive = true,
  },
  ref,
) {
  const dropZoneRef = useRef<FileDropZoneHandle>(null);
  const supabase = createClient();
  const { toast } = useToast();
  const { mutateAsync: processDocument } = useProcessInvestorDocument();

  const onUploadStartRef = useRef(onUploadStart);
  const onUploadProgressRef = useRef(onUploadProgress);
  const onUploadCompleteRef = useRef(onUploadComplete);
  useEffect(() => {
    onUploadStartRef.current = onUploadStart;
    onUploadProgressRef.current = onUploadProgress;
    onUploadCompleteRef.current = onUploadComplete;
  }, [onUploadStart, onUploadProgress, onUploadComplete]);

  const buildUploadPaths = useCallback(
    (file: File, sanitizedFileName: string, fileId: string) => {
      // Match persisted entries by (name, size, type) so a fresh uuid in this
      // session can still resume a tus upload from a prior session.
      const pending = organizationId ? loadPending(organizationId) : [];
      const match = findPendingUploadMatch(pending, {
        fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });
      const documentPublicId = match?.documentPublicId ?? uuidv4();
      const previousPendingFileId =
        match && match.fileId !== fileId ? match.fileId : undefined;
      const filePath = buildSafePath([
        organizationId,
        'investor',
        documentPublicId,
        'primary',
        sanitizedFileName,
      ]);
      return { documentPublicId, filePath, previousPendingFileId };
    },
    [organizationId],
  );

  // Ref so the manager subscription (wired once) can reach patchFile, which
  // is recreated each render.
  const patchFileRef = useRef<
    ((id: string, patch: Partial<UploadingFile>) => void) | null
  >(null);

  const runUpload = useCallback(
    async (file: File, fileId: string) => {
      if (!organizationId) throw new Error('Organization ID not available');
      const sanitizedFileName = sanitizeFileName(file.name);
      onUploadStartRef.current?.({
        id: fileId,
        fileName: sanitizedFileName,
        status: 'uploading',
      });

      try {
        const { documentPublicId, filePath, previousPendingFileId } =
          buildUploadPaths(file, sanitizedFileName, fileId);
        const result = await startUpload({
          file,
          fileId,
          documentPublicId,
          filePath,
          organizationId,
          previousPendingFileId,
          sb: supabase as unknown as SupaClient,
          processDocument,
        });
        const meta = result.documentId
          ? { documentId: result.documentId, file }
          : { file };
        patchFileRef.current?.(fileId, { status: 'uploaded', meta });
        const payload: UploadingDocument = {
          id: fileId,
          fileName: sanitizedFileName,
          status: 'uploaded',
        };
        if (result.documentId) payload.documentId = result.documentId;
        onUploadCompleteRef.current?.(fileId, payload);
      } catch (err) {
        // The user asked for this, so it is not a failure: leave the row (if
        // it still exists — a per-row cancel already removed it) marked
        // cancelled and retryable, and let the queue move to the next file.
        if (err instanceof UploadAbortedError) {
          patchFileRef.current?.(fileId, {
            status: 'error',
            errorMessage: 'Upload cancelled',
          });
          return;
        }
        const isSecurityError = err instanceof PathTraversalError;
        const isOffline =
          typeof navigator !== 'undefined' && navigator.onLine === false;
        const message = isOffline
          ? 'Incomplete upload due to lost network connection.'
          : isSecurityError
            ? 'Invalid file path detected'
            : err instanceof Error
              ? err.message
              : 'Upload failed';
        patchFileRef.current?.(fileId, {
          status: 'error',
          errorMessage: message,
        });
        onUploadProgressRef.current?.(fileId, { status: 'error' });
        toast({
          variant: 'destructive',
          title: 'Upload failed',
          description: message,
        });
      } finally {
        clearSnapshot(fileId);
      }
    },
    [organizationId, supabase, processDocument, buildUploadPaths, toast],
  );

  const queue = useUploadQueue<UploadingFile>({
    runUpload,
    abortInFlight: (row) => managerAbort(row.id),
    maxFiles: MAX_FILES,
    maxConcurrency: MAX_CONCURRENCY,
    onFilesAdded,
  });
  patchFileRef.current = queue.patchFile;

  // Preserve resume rows; tear down manager state for everything else.
  const clearAll = useCallback(() => {
    queue.setFiles((prev) => {
      if (organizationId) {
        prev.forEach((f) => {
          if (isResumeRow(f)) return;
          managerAbort(f.id);
          removePending(organizationId, f.id);
        });
      }
      return prev.filter(isResumeRow);
    });
  }, [organizationId, queue]);

  const removeFile = useCallback(
    (id: string) => {
      managerAbort(id);
      if (organizationId) removePending(organizationId, id);
      queue.setFiles((prev) => prev.filter((f) => f.id !== id));
    },
    [organizationId, queue],
  );

  // Drop the persisted pending entry for aborted rows so we don't surface a
  // resume prompt next session for an upload the user explicitly cancelled.
  const handleCancel = useCallback(() => {
    if (organizationId) {
      queue.files.forEach((f) => {
        if (f.status === 'uploading') removePending(organizationId, f.id);
      });
    }
    queue.handleCancel();
  }, [organizationId, queue]);

  // Re-selecting a file replaces its stale resume row with a live one.
  const handleFiles = useCallback(
    (incoming: File[]) => {
      queue.handleFiles(incoming);
      queue.setFiles((prev) => {
        const incomingNames = new Set(
          incoming.map((f) => sanitizeFileName(f.name)),
        );
        return prev.filter(
          (p) =>
            !(
              isResumeRow(p) && incomingNames.has(sanitizeFileName(p.fileName))
            ),
        );
      });
    },
    [queue],
  );

  useImperativeHandle(ref, () => ({
    browse: () => dropZoneRef.current?.browse(),
    clear: clearAll,
  }));

  useWarnBeforeUnload(queue.hasActiveUpload);

  useEffect(() => {
    if (!organizationId) return;
    const pending = loadPending(organizationId);
    if (pending.length === 0) return;
    queue.setFiles((prev) => {
      const existingIds = new Set(prev.map((f) => f.id));
      const additions: UploadingFile[] = pending
        .filter((p) => !existingIds.has(p.fileId))
        .map((p) => ({
          id: p.fileId,
          fileName: p.fileName,
          status: 'error' as const,
          errorMessage: RESUME_ROW_MESSAGE,
        }));
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });
    // queue.setFiles identity is stable across renders; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    const unsubscribe = subscribeUploadManager((snap) => {
      const patchFile = patchFileRef.current;
      if (!patchFile) return;
      if (snap.status === 'uploading') {
        const pct =
          snap.total > 0 ? Math.round((snap.loaded / snap.total) * 100) : 0;
        patchFile(snap.fileId, {
          status: 'uploading',
          errorMessage: snap.errorMessage,
          progress: pct,
        });
      } else if (snap.status === 'processing') {
        patchFile(snap.fileId, { status: 'processing' });
        onUploadProgressRef.current?.(snap.fileId, { status: 'processing' });
      }
    });
    return () => unsubscribe();
  }, []);

  const handleRetry = useCallback(
    (row: UploadingFile) => {
      if (!readQueuedFile(row.meta)) return;
      queue.patchFile(row.id, { status: 'ready', errorMessage: undefined });
      queue.handleUploadClick();
    },
    [queue],
  );

  const retryColumn: ColumnDef<UploadingFile, unknown> = useMemo(
    () => ({
      id: 'retry',
      header: '',
      size: 120,
      cell: ({ row }) => {
        const file = row.original;
        const canRetry =
          file.status === 'error' && Boolean(readQueuedFile(file.meta));
        if (!canRetry) return null;
        return (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRetry(file)}
              aria-label="Retry upload"
            >
              <RotateCcw />
              Retry
            </Button>
          </div>
        );
      },
    }),
    [handleRetry],
  );

  const columns = useMemo(
    () => [
      fileNameColumn<UploadingFile>(),
      statusColumn<UploadingFile>(),
      retryColumn,
      removeColumn<UploadingFile>(removeFile),
    ],
    [retryColumn, removeFile],
  );

  return (
    <UploadQueueShell
      queue={{ ...queue, clearAll, removeFile, handleFiles, handleCancel }}
      columns={columns}
      headerText={
        queue.hasActiveUpload ? 'Upload in progress' : 'Documents to upload'
      }
      maxHeightVh={66}
      showProcessingNote={false}
      dropZoneRef={dropZoneRef}
      maxFiles={MAX_FILES}
      isActive={isActive}
      hideStaminaNote
    />
  );
});
