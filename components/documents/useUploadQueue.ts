'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/components/ui/use-toast';
import { classifyFile, type ClassifyResult } from './file-validation';
import type { UploadingFile } from './types';

const DEFAULT_MAX_FILES = 500;
const DEFAULT_MAX_CONCURRENCY = 1;

function truncateName(name: string): string {
  return name.length > 20 ? `${name.substring(0, 17)}...` : name;
}

export function readQueuedFile(meta: UploadingFile['meta']): File | undefined {
  return (meta as { file?: File } | undefined)?.file;
}

export interface UploadQueueOptions<T extends UploadingFile> {
  /** Caller is responsible for patching its own row state. */
  runUpload: (file: File, id: string) => Promise<void>;
  abortInFlight?: (row: T) => void;
  /** Extend the base row shape when T has fields beyond UploadingFile. */
  createRow?: (base: UploadingFile, file: File) => T;
  maxFiles?: number;
  maxConcurrency?: number;
  onFilesAdded?: () => void;
}

export interface UploadQueue<T extends UploadingFile> {
  files: T[];
  setFiles: Dispatch<SetStateAction<T[]>>;
  patchFile: (id: string, patch: Partial<T>) => void;
  handleFiles: (incoming: File[]) => void;
  handleUploadClick: () => void;
  handleCancel: () => void;
  clearAll: () => void;
  clearUploaded: () => void;
  removeFile: (id: string) => void;
  hasFiles: boolean;
  hasReady: boolean;
  hasUploaded: boolean;
  /** True for the whole batch, including inter-iteration gaps. */
  hasActiveUpload: boolean;
  isCancelling: boolean;
  allBlocked: boolean;
}

export function useUploadQueue<T extends UploadingFile = UploadingFile>(
  opts: UploadQueueOptions<T>,
): UploadQueue<T> {
  const {
    runUpload,
    abortInFlight,
    createRow,
    maxFiles = DEFAULT_MAX_FILES,
    maxConcurrency = DEFAULT_MAX_CONCURRENCY,
    onFilesAdded,
  } = opts;
  const { toast } = useToast();
  const [files, setFiles] = useState<T[]>([]);
  const filesRef = useRef<T[]>(files);
  filesRef.current = files;
  const [isCancelling, setIsCancelling] = useState(false);
  const [isQueueRunning, setIsQueueRunning] = useState(false);
  const cancelRef = useRef(false);

  const buildRow = useCallback(
    (file: File, kind: ClassifyResult['kind'], message?: string): T => {
      const base: UploadingFile = {
        id: uuidv4(),
        fileName: file.name,
        status:
          kind === 'ready'
            ? 'ready'
            : kind === 'unsupported'
              ? 'unsupported'
              : 'error',
        meta: { file },
      };
      if (kind === 'error' && message) base.errorMessage = message;
      return createRow ? createRow(base, file) : (base as T);
    },
    [createRow],
  );

  const patchFile = useCallback((id: string, patch: Partial<T>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? ({ ...f, ...patch } as T) : f)),
    );
  }, []);

  const handleFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      // Compute the additions and notifications outside setFiles — under
      // StrictMode (dev), updater bodies re-run, so any toast/onFilesAdded
      // inside the updater would fire twice.
      const prev = filesRef.current;
      const existingNames = new Set(prev.map((f) => f.fileName));
      // Skipped rows (unsupported / oversize / failed) don't take a slot —
      // only count rows that are or could become an uploaded file.
      const countableInPrev = prev.filter(
        (f) =>
          f.status === 'ready' ||
          f.status === 'uploading' ||
          f.status === 'processing' ||
          f.status === 'uploaded',
      ).length;
      const cap = Math.max(0, maxFiles - countableInPrev);
      const sorted = [...incoming].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        }),
      );

      const additions: T[] = [];
      let readyTaken = 0;
      let droppedFromCap = 0;
      for (const file of sorted) {
        const result = classifyFile(file, existingNames);
        if (result.kind === 'empty') {
          toast({
            variant: 'destructive',
            title: `Empty File: ${truncateName(file.name)}`,
            description: 'Cannot upload an empty file',
          });
          continue;
        }
        if (result.kind === 'duplicate') {
          toast({
            variant: 'destructive',
            title: 'Duplicate File',
            description: 'This file has already been added.',
          });
          continue;
        }
        if (result.kind === 'ready') {
          if (readyTaken >= cap) {
            droppedFromCap++;
            continue;
          }
          readyTaken++;
        }
        existingNames.add(file.name);
        additions.push(
          buildRow(
            file,
            result.kind,
            result.kind === 'error' ? result.message : undefined,
          ),
        );
      }

      if (droppedFromCap > 0) {
        toast({
          variant: 'destructive',
          title: 'File Limit Reached',
          description:
            cap === 0
              ? `You can upload a maximum of ${maxFiles} files at a time.`
              : `Only ${cap} more file${cap === 1 ? '' : 's'} could be added (max ${maxFiles}).`,
        });
      }

      if (additions.length === 0) return;
      onFilesAdded?.();
      setFiles((cur) => [...cur, ...additions]);
    },
    [maxFiles, toast, buildRow, onFilesAdded],
  );

  const handleUploadClick = useCallback(() => {
    if (isQueueRunning) return;
    if (!filesRef.current.some((f) => f.status === 'ready')) return;
    cancelRef.current = false;
    setIsQueueRunning(true);

    // Workers read filesRef each iteration so rows that become 'ready' mid-
    // flight (e.g. via retry) get picked up by the next available slot.
    const claimed = new Set<string>();
    const claimNext = (): T | null => {
      for (const f of filesRef.current) {
        if (f.status === 'ready' && !claimed.has(f.id)) {
          claimed.add(f.id);
          return f;
        }
      }
      return null;
    };
    const worker = async () => {
      while (!cancelRef.current) {
        const next = claimNext();
        if (!next) return;
        const file = readQueuedFile(next.meta);
        if (file) await runUpload(file, next.id);
      }
    };

    const limit = Math.max(1, maxConcurrency);
    void Promise.all(Array.from({ length: limit }, () => worker())).finally(
      () => setIsQueueRunning(false),
    );
  }, [isQueueRunning, maxConcurrency, runUpload]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
    setIsCancelling(true);
    // Read filesRef so a row that flipped to 'uploading' between the last
    // render and this click still gets aborted. Processing rows are past the
    // point where abort means anything.
    filesRef.current.forEach((f) => {
      if (f.status === 'uploading') abortInFlight?.(f);
    });
  }, [abortInFlight]);

  const clearAll = useCallback(() => {
    setFiles([]);
  }, []);

  const clearUploaded = useCallback(() => {
    setFiles((prev) => prev.filter((f) => f.status !== 'uploaded'));
  }, []);

  const removeFile = useCallback(
    (id: string) => {
      const target = files.find((f) => f.id === id);
      if (
        target &&
        (target.status === 'uploading' || target.status === 'processing')
      ) {
        abortInFlight?.(target);
      }
      setFiles((prev) => prev.filter((f) => f.id !== id));
    },
    [files, abortInFlight],
  );

  const hasActiveUpload =
    isQueueRunning ||
    files.some((f) => f.status === 'uploading' || f.status === 'processing');

  useEffect(() => {
    if (isCancelling && !hasActiveUpload) setIsCancelling(false);
  }, [isCancelling, hasActiveUpload]);

  return useMemo(() => {
    const hasFiles = files.length > 0;
    const hasReady = files.some((f) => f.status === 'ready');
    const hasUploaded = files.some((f) => f.status === 'uploaded');
    const allBlocked =
      hasFiles &&
      files.every((f) => f.status === 'error' || f.status === 'unsupported');
    return {
      files,
      setFiles,
      patchFile,
      handleFiles,
      handleUploadClick,
      handleCancel,
      clearAll,
      clearUploaded,
      removeFile,
      hasFiles,
      hasReady,
      hasUploaded,
      hasActiveUpload,
      isCancelling,
      allBlocked,
    };
  }, [
    files,
    patchFile,
    handleFiles,
    handleUploadClick,
    handleCancel,
    clearAll,
    clearUploaded,
    removeFile,
    hasActiveUpload,
    isCancelling,
  ]);
}
