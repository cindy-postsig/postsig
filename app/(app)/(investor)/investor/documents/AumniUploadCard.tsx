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
import { useToast } from '@/components/ui/use-toast';
import { UploadProgressTable } from '@/components/documents/UploadProgressTable';
import {
  fileNameColumn,
  statusColumn,
  removeColumn,
} from '@/components/documents/upload-columns';
import { retryColumn } from '@/app/(app)/(investor)/investor/documents/aumni-upload-columns';
import type { UploadingFile } from '@/components/documents/types';
import {
  FileDropZone,
  type FileDropZoneHandle,
} from '@/components/documents/FileDropZone';
import {
  getSnapshot,
  subscribe,
  startUpload,
  isActive,
  reset,
  toastRef,
  type UploadSnapshot,
  type SupaClient,
} from '@/app/(app)/(investor)/investor/documents/aumni-upload-manager';
import { useWarnBeforeUnload } from '@/hooks/useWarnBeforeUnload';
import {
  loadPending,
  clearPending,
} from '@/app/(app)/(investor)/investor/documents/aumni-upload-state';

const MAX_FILE_SIZE_GB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024;

function isZipFile(file: File): boolean {
  if (file.type === 'application/zip') return true;
  if (file.type === 'application/x-zip-compressed') return true;
  return file.name.toLowerCase().endsWith('.zip');
}

export interface AumniUploadCardHandle {
  browse: () => void;
  clear: () => void;
}

interface AumniUploadCardProps {
  onUploadComplete?: () => void;
  organizationId: string;
  isActive?: boolean;
}

function snapshotToFile(snap: UploadSnapshot): UploadingFile | null {
  if (snap.status === 'idle' || !snap.fileName) return null;
  const statusMap = {
    uploading: 'uploading',
    uploaded: 'uploaded',
    error: 'error',
  } as const;
  const progress =
    snap.total > 0 ? Math.round((snap.loaded / snap.total) * 100) : 0;
  return {
    id: 'manager',
    fileName: snap.fileName,
    status: statusMap[snap.status],
    errorMessage: snap.errorMessage,
    progress,
  };
}

function pendingToFile(pending: { fileName: string }): UploadingFile {
  return {
    id: 'pending-recovery',
    fileName: pending.fileName,
    status: 'error',
    errorMessage: 'Upload interrupted — re-select the file to resume',
  };
}

export const AumniUploadCard = forwardRef<
  AumniUploadCardHandle,
  AumniUploadCardProps
>(function AumniUploadCard(
  { onUploadComplete, organizationId, isActive: isCardActive = true },
  ref,
) {
  const dropZoneRef = useRef<FileDropZoneHandle>(null);
  const [managerFile, setManagerFile] = useState<UploadingFile | null>(null);
  const [localFile, setLocalFile] = useState<File | null>(null);
  const sb = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const onUploadCompleteRef = useRef(onUploadComplete);
  useEffect(() => {
    onUploadCompleteRef.current = onUploadComplete;
  }, [onUploadComplete]);

  const handleClear = useCallback(() => {
    clearPending(organizationId);
    reset();
    setManagerFile(null);
    setLocalFile(null);
  }, [organizationId]);

  useImperativeHandle(ref, () => ({
    browse: () => dropZoneRef.current?.browse(),
    clear: handleClear,
  }));

  useEffect(() => {
    toastRef.current = toast;
    return () => {
      toastRef.current = null;
    };
  }, [toast]);

  useEffect(() => {
    const snap = getSnapshot();
    const existing = snapshotToFile(snap);
    if (existing) {
      setManagerFile(existing);
    } else {
      const pending = loadPending(organizationId);
      if (pending) setManagerFile(pendingToFile(pending));
    }
    return subscribe((s) => setManagerFile(snapshotToFile(s)));
  }, [organizationId]);

  const handleFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      // FileDropZone is configured with multiple=false; defensively take the
      // first file in case the browser delivers more.
      const file = incoming[0];

      if (!isZipFile(file)) {
        toast({
          variant: 'destructive',
          title: 'Unsupported file type',
          description: 'Only ZIP files are supported for Aumni import',
        });
        return;
      }
      if (file.size === 0) {
        toast({
          variant: 'destructive',
          title: 'Empty file',
          description: 'Cannot upload an empty file',
        });
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast({
          variant: 'destructive',
          title: 'File too large',
          description: `Maximum file size is ${MAX_FILE_SIZE_GB}GB`,
        });
        return;
      }

      // Picking a new file clears any stale "interrupted — re-select to
      // resume" row from a prior session.
      if (managerFile && !isActive()) {
        reset();
        setManagerFile(null);
      }
      setLocalFile(file);
    },
    [managerFile, toast],
  );

  const handleImportClick = useCallback(() => {
    if (!localFile || isActive()) return;
    startUpload(localFile, organizationId, sb as SupaClient).catch(() => {
      // reportFail inside the manager already emits an error snapshot
    });
  }, [localFile, organizationId, sb]);

  const isComplete = managerFile?.status === 'uploaded';

  // Release the staged File (up to 5GB) once it has landed; the completed row
  // is driven by the manager snapshot from here on.
  useEffect(() => {
    if (!isComplete) return;
    setLocalFile(null);
    onUploadCompleteRef.current?.();
  }, [isComplete]);

  const isPendingRecovery = managerFile?.id === 'pending-recovery';
  const hasManagerFile = managerFile !== null;
  const hasLocalFile = localFile !== null;
  // A finished import keeps its row but hands the drop zone back, so another
  // archive can be imported without leaving Aumni mode.
  const hideDropZone =
    (hasManagerFile && !isPendingRecovery && !isComplete) || hasLocalFile;
  const isReady = hasLocalFile && !isActive() && !isComplete;
  const isUploading = managerFile?.status === 'uploading';

  useWarnBeforeUnload(isUploading);

  const handleRetry = useCallback(() => {
    if (!localFile) return;
    reset();
    setManagerFile(null);
    startUpload(localFile, organizationId, sb as SupaClient).catch(() => {
      // reportFail inside the manager already emits an error snapshot
    });
  }, [localFile, organizationId, sb]);

  const tableFiles: UploadingFile[] = useMemo(() => {
    if (managerFile) return [managerFile];
    if (localFile)
      return [
        { id: 'local', fileName: localFile.name, status: 'ready' as const },
      ];
    return [];
  }, [managerFile, localFile]);

  const columns = useMemo(
    () => [
      fileNameColumn<UploadingFile>(),
      statusColumn<UploadingFile>(),
      retryColumn<UploadingFile>(handleRetry),
      removeColumn<UploadingFile>(handleClear),
    ],
    [handleRetry, handleClear],
  );

  return (
    <>
      {(hasManagerFile || hasLocalFile) && (
        <UploadProgressTable
          files={tableFiles}
          columns={columns}
          collapsible={false}
        />
      )}

      {isReady && (
        <div className="mb-4 flex justify-end gap-2">
          <Button variant="outline" size="lg" onClick={handleClear}>
            Clear
          </Button>
          <Button onClick={handleImportClick} disabled={isUploading} size="lg">
            Upload Aumni Archive
          </Button>
        </div>
      )}

      {!hideDropZone && (
        <FileDropZone
          ref={dropZoneRef}
          onFiles={handleFiles}
          isActive={isCardActive}
          multiple={false}
          variant="aumni"
          showAumniBadge
        />
      )}
    </>
  );
});
