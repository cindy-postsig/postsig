'use client';

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
} from 'react';
import { useDropzone } from 'react-dropzone';
import { fromEvent } from 'file-selector';
import { cn } from '@/lib/utils';
import { IGNORED_FILE_NAMES } from './file-validation';

export interface FileDropZoneHandle {
  browse: () => void;
  browseFolder: () => void;
}

interface FileDropZoneProps {
  onFiles: (files: File[]) => void;
  isActive?: boolean;
  compact?: boolean;
  multiple?: boolean;
  variant?: 'default' | 'cpm' | 'aumni';
  /** Catch drops anywhere on the document, not just on the zone. */
  dropOnPage?: boolean;
  labelMain?: string;
  labelTypes?: string;
  labelLimit?: string;
  maxFiles?: number;
  showAumniBadge?: boolean;
  className?: string;
}

function filterIgnored(files: File[]): File[] {
  return files.filter((f) => !IGNORED_FILE_NAMES.has(f.name.toLowerCase()));
}

// Mirrors file-selector's drag-drop folder traversal for clipboard paste —
// FileSystemDirectoryEntry.createReader() returns batches of <= 100 entries,
// so we keep reading until the batch is empty.
function readEntryRecursive(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file(
        (f) => resolve([f]),
        () => resolve([]),
      );
    });
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    return new Promise((resolve) => {
      const collected: FileSystemEntry[] = [];
      const readBatch = () => {
        reader.readEntries(
          (batch) => {
            if (batch.length === 0) {
              Promise.all(collected.map(readEntryRecursive))
                .then((nested) => resolve(nested.flat()))
                .catch(() => resolve([]));
            } else {
              collected.push(...batch);
              readBatch();
            }
          },
          () => resolve([]),
        );
      };
      readBatch();
    });
  }
  return Promise.resolve([]);
}

function defaultLabels(
  variant: 'default' | 'cpm' | 'aumni',
  maxFiles: number | undefined,
) {
  if (variant === 'aumni') {
    return {
      main: 'Drag and drop your Aumni export ZIP file or click here',
      types: 'Supported file type: ZIP only up to 5GB',
      limit: 'Only one ZIP file can be uploaded at a time',
    };
  }
  // The two modules keep different types out of a ZIP: contracts processing
  // discards everything that is not a PDF, while investor processing also
  // keeps CSV and XLSX. The copy states what each will actually upload.
  const supported =
    variant === 'cpm'
      ? 'PDF up to 50MB for each file'
      : 'PDF, CSV, XLSX up to 50MB for each file';
  const kept =
    variant === 'cpm'
      ? 'Only PDF files within the ZIP will be uploaded.'
      : 'Only PDF, CSV, and XLSX files within the ZIP will be uploaded.';
  return {
    main: 'Drag and drop your document(s) or click here',
    types:
      `Supported file types: ${supported} · ZIP up to 5GB — ${kept} ` +
      'Unsupported file types will be skipped.',
    limit: maxFiles ? `Maximum of ${maxFiles} files per upload` : '',
  };
}

export const FileDropZone = forwardRef<FileDropZoneHandle, FileDropZoneProps>(
  function FileDropZone(
    {
      onFiles,
      isActive = true,
      compact = false,
      multiple = true,
      variant = 'default',
      dropOnPage = true,
      labelMain,
      labelTypes,
      labelLimit,
      maxFiles = 500,
      showAumniBadge = false,
      className,
    },
    ref,
  ) {
    const folderInputRef = useRef<HTMLInputElement>(null);
    const rootContainerRef = useRef<HTMLDivElement>(null);
    const onFilesRef = useRef(onFiles);
    useEffect(() => {
      onFilesRef.current = onFiles;
    }, [onFiles]);

    const handleDrop = useCallback((accepted: File[]) => {
      const filtered = filterIgnored(accepted);
      if (filtered.length > 0) onFilesRef.current(filtered);
    }, []);

    const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
      onDrop: handleDrop,
      multiple,
      noClick: false,
      noKeyboard: false,
      disabled: !isActive,
    });

    // file-selector flattens folders the same way react-dropzone does for the
    // local zone — without it, dropping a folder on the page produces a single
    // zero-byte entry instead of recursing into its files.
    useEffect(() => {
      if (!isActive || !dropOnPage) return;
      function onDragOver(e: DragEvent) {
        if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
      }
      function onDocDrop(e: DragEvent) {
        if (!e.dataTransfer?.types?.includes('Files')) return;
        const target = e.target as Node | null;
        if (target && rootContainerRef.current?.contains(target)) return;
        e.preventDefault();
        void fromEvent(e).then((items) => {
          const files = items.filter((i): i is File => i instanceof File);
          const arr = filterIgnored(files);
          if (arr.length > 0) onFilesRef.current(arr);
        });
      }
      function onPaste(e: ClipboardEvent) {
        const target = e.target as Element | null;
        // Don't hijack pastes into text inputs, textareas, contentEditable.
        if (
          target &&
          (target.matches?.(
            'input, textarea, [contenteditable=""], [contenteditable=true]',
          ) ||
            target.closest?.('[contenteditable=""], [contenteditable=true]'))
        ) {
          return;
        }
        const items = e.clipboardData?.items;
        if (!items) return;
        // Pull entries synchronously before the event is recycled — the async
        // traversal below can outlive the event handler.
        const entries: (FileSystemEntry | null)[] = [];
        const fallbackFiles: File[] = [];
        for (const item of Array.from(items)) {
          if (item.kind !== 'file') continue;
          const entry = item.webkitGetAsEntry?.();
          if (entry) entries.push(entry);
          else {
            const f = item.getAsFile();
            if (f) fallbackFiles.push(f);
          }
        }
        if (entries.length === 0 && fallbackFiles.length === 0) return;
        e.preventDefault();
        void Promise.all(
          entries.map((entry) =>
            entry ? readEntryRecursive(entry) : Promise.resolve([] as File[]),
          ),
        ).then((nested) => {
          const arr = filterIgnored([...fallbackFiles, ...nested.flat()]);
          if (arr.length > 0) onFilesRef.current(arr);
        });
      }
      document.addEventListener('dragover', onDragOver);
      document.addEventListener('drop', onDocDrop);
      document.addEventListener('paste', onPaste);
      return () => {
        document.removeEventListener('dragover', onDragOver);
        document.removeEventListener('drop', onDocDrop);
        document.removeEventListener('paste', onPaste);
      };
    }, [isActive, dropOnPage]);

    const handleFolderSelect = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        const arr = filterIgnored(Array.from(files));
        if (arr.length > 0) onFilesRef.current(arr);
        e.target.value = '';
      },
      [],
    );

    useImperativeHandle(ref, () => ({
      browse: open,
      browseFolder: () => folderInputRef.current?.click(),
    }));

    const labels = defaultLabels(variant, multiple ? maxFiles : undefined);
    const main = labelMain ?? labels.main;
    const types = labelTypes ?? labels.types;
    const limit = labelLimit ?? labels.limit;

    const gradient =
      variant === 'aumni'
        ? isDragActive
          ? 'bg-gradient-to-b from-blue-500/[0.14] to-blue-500/[0.22] dark:from-blue-500/20 dark:to-blue-500/30'
          : 'bg-gradient-to-b from-blue-500/[0.06] to-blue-500/[0.12] dark:from-blue-500/10 dark:to-blue-500/20'
        : isDragActive
          ? 'bg-gradient-to-b from-black/[0.07] to-black/[0.12] dark:from-foreground/10 dark:to-foreground/20'
          : 'bg-gradient-to-b from-black/[0.03] to-black/[0.06] dark:from-foreground/5 dark:to-foreground/10';

    return (
      <>
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error -- webkitdirectory is non-standard but widely supported
          webkitdirectory=""
          multiple
          accept=".pdf,.csv,.xlsx,.zip,application/pdf,application/zip,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={handleFolderSelect}
        />
        <div ref={rootContainerRef} className="contents">
          <div
            {...getRootProps({
              className: cn(
                'relative flex cursor-pointer flex-col rounded-[10px] transition-colors',
                gradient,
                compact ? 'h-[20vh]' : 'h-[40vh]',
                !isActive && 'pointer-events-none opacity-60',
                className,
              ),
            })}
          >
            <input {...getInputProps()} />
            {showAumniBadge && (
              <span className="absolute left-3 top-3 z-10 inline-flex items-center rounded-md border border-blue-500/40 bg-background/80 px-2 py-0.5 text-xs text-blue-600 backdrop-blur-sm dark:text-blue-400">
                Aumni Import
              </span>
            )}
            <div className="font-light flex h-full w-full flex-col items-center justify-center gap-1.5 px-4 text-center font-sans-neue text-2xl text-muted-foreground">
              <span className="tracking-tight">{main}</span>
              {types ? <small className="text-base">{types}</small> : null}
              {limit ? <small className="text-base">{limit}</small> : null}
            </div>
          </div>
        </div>
      </>
    );
  },
);
