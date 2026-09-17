'use client';

import { useMemo, useState } from 'react';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ChevronDown,
  ChevronRight,
  HourglassIcon,
  MinusIcon,
  PlusIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UploadingFile } from './types';

interface UploadProgressTableProps<T extends UploadingFile> {
  files: T[];
  columns: ColumnDef<T, unknown>[];
  collapsible?: boolean;
  headerText?: string;
  rowWrapper?: (file: T, children: React.ReactNode) => React.ReactNode;
  maxHeightVh?: number;
  showProcessingNote?: boolean;
}

export function UploadProgressTable<T extends UploadingFile>({
  files,
  columns,
  collapsible = true,
  headerText = "We're preparing your document(s) for use.",
  rowWrapper,
  maxHeightVh,
  showProcessingNote = true,
}: UploadProgressTableProps<T>) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [skippedExpanded, setSkippedExpanded] = useState(false);

  const skippedFiles = useMemo(
    () => files.filter((f) => f.status === 'unsupported'),
    [files],
  );
  const activeFiles = useMemo(
    () => files.filter((f) => f.status !== 'unsupported'),
    [files],
  );
  const uploadedCount = useMemo(
    () => activeFiles.filter((f) => f.status === 'uploaded').length,
    [activeFiles],
  );
  const hasStartedUploading = useMemo(
    () => activeFiles.some((f) => f.status !== 'ready'),
    [activeFiles],
  );
  const skippedExtensions = useMemo(() => {
    const exts = new Set<string>();
    for (const f of skippedFiles) {
      const dot = f.fileName.lastIndexOf('.');
      exts.add(
        dot >= 0 ? f.fileName.slice(dot + 1).toUpperCase() : 'no extension',
      );
    }
    return Array.from(exts).sort();
  }, [skippedFiles]);

  const table = useReactTable({
    data: activeFiles,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const skippedTable = useReactTable({
    data: skippedFiles,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (files.length === 0) return null;

  const tableJsx = (
    <Table stickyHeader className="w-full table-fixed">
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const metaClassName = (
                header.column.columnDef.meta as
                  | { className?: string }
                  | undefined
              )?.className;
              return (
                <TableHead
                  key={header.id}
                  className={cn('py-2 text-xs', metaClassName)}
                  style={
                    !metaClassName && header.getSize() !== 150
                      ? { width: header.getSize() }
                      : undefined
                  }
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {skippedFiles.length > 0 && (
          <>
            <TableRow
              className="cursor-pointer bg-amber-300/50 hover:bg-amber-300/70 dark:bg-amber-400/30 dark:hover:bg-amber-400/40"
              onClick={() => setSkippedExpanded((v) => !v)}
            >
              <TableCell colSpan={columns.length} className="py-2">
                <div className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-200">
                  {skippedExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span>
                    {skippedFiles.length}{' '}
                    {skippedFiles.length === 1 ? 'file' : 'files'} will be
                    skipped
                    {skippedExtensions.length > 0 && (
                      <>
                        {' '}
                        — unsupported file types: {skippedExtensions.join(', ')}
                      </>
                    )}
                  </span>
                </div>
              </TableCell>
            </TableRow>
            {skippedExpanded &&
              skippedTable.getRowModel().rows.map((row) => {
                const rowContent = (
                  <TableRow
                    key={row.id}
                    className="border-b-amber-600/30 bg-amber-400/20 text-amber-900 hover:bg-amber-400/30 dark:border-b-amber-500/20 dark:text-amber-200 [&_button:hover]:bg-amber-300/50 dark:[&_button:hover]:bg-amber-900/40 [&_button]:border-amber-700/40 [&_button]:text-amber-900 dark:[&_button]:border-amber-500/40 dark:[&_button]:text-amber-200"
                  >
                    {row.getVisibleCells().map((cell, idx) => (
                      <TableCell
                        key={cell.id}
                        className={idx === 0 ? 'pl-10' : undefined}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
                return rowWrapper
                  ? rowWrapper(row.original, rowContent)
                  : rowContent;
              })}
          </>
        )}
        {table.getRowModel().rows.map((row) => {
          const rowContent = (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          );
          return rowWrapper ? rowWrapper(row.original, rowContent) : rowContent;
        })}
      </TableBody>
    </Table>
  );

  return (
    <div className="mb-4">
      {collapsible && (
        <div className="flex items-center justify-between rounded-md border bg-secondary px-3 py-2">
          <div className="inline-flex gap-3 font-sans">
            <button
              onClick={() => setIsExpanded((v) => !v)}
              className="bg-transparent p-0 hover:bg-transparent"
            >
              {isExpanded ? (
                <MinusIcon
                  className="min-w-6 cursor-pointer rounded-full bg-primary p-1 text-background"
                  width={24}
                  height={24}
                />
              ) : (
                <PlusIcon
                  className="min-w-6 cursor-pointer rounded-full bg-primary/15 p-1 text-primary"
                  width={24}
                  height={24}
                />
              )}
            </button>
            <span className="pt-[2px] text-base">{headerText}</span>
            <Badge variant={'secondary'} className="px-4">
              {hasStartedUploading
                ? `${uploadedCount} / ${activeFiles.length}`
                : activeFiles.length}
            </Badge>
          </div>
          {showProcessingNote && (
            <div className="inline-flex items-center text-xs">
              <HourglassIcon className="mr-2 size-3" />
              <span>
                Processing might take a couple of hours — we&apos;ll notify you.
              </span>
            </div>
          )}
        </div>
      )}

      {(!collapsible || isExpanded) && (
        <div
          className={
            collapsible
              ? 'overflow-hidden border-x border-b'
              : 'rounded-md border'
          }
        >
          {maxHeightVh ? (
            // The viewport inherits the cap so it scrolls past it; without
            // that it would size to its content and overflow the clipped root.
            <ScrollArea
              className="[&>[data-radix-scroll-area-viewport]]:max-h-[inherit] [&_[data-orientation=vertical]]:z-20"
              style={{ maxHeight: `${maxHeightVh}vh` }}
            >
              {tableJsx}
            </ScrollArea>
          ) : (
            tableJsx
          )}
        </div>
      )}
    </div>
  );
}
