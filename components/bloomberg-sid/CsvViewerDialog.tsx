'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { TABLE_HEADER_CLASS } from '@/components/bloomberg-sid/bits';
import Loading from '@/components/Loading';
import { TablePagination } from '@/components/ui/data-table/components/TablePagination';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { decodeSidCsv, parseCsvText } from '@/lib/v2/bloomberg-sid/csv-text';
import type { SidReportFile } from '@/lib/v2/bloomberg-sid/report';

type CsvRow = string[];

interface CsvSheet {
  header: string[];
  rows: CsvRow[];
}

async function loadCsv(url: string, signal: AbortSignal): Promise<CsvSheet> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`The file could not be loaded (${response.status}).`);
  }
  const [header = [], ...rows] = parseCsvText(
    decodeSidCsv(await response.arrayBuffer()),
  );
  return { header, rows };
}

function CsvTable({ sheet }: { sheet: CsvSheet }) {
  const columns = useMemo<ColumnDef<CsvRow>[]>(
    () =>
      sheet.header.map((name, index) => ({
        id: `${index}`,
        header: name.trim() || `Column ${index + 1}`,
        accessorFn: (row) => row[index] ?? '',
      })),
    [sheet.header],
  );

  const table = useReactTable({
    data: sheet.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto rounded border border-border bg-card">
        <Table
          stickyHeader
          scrollClassName={null}
          className="[&>thead]:bg-card"
        >
          <TableHeader className={TABLE_HEADER_CLASS}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="sticky top-0 z-10 bg-muted"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="even:bg-white/70 dark:even:bg-white/[0.04]"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className="whitespace-nowrap font-mono text-xs"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <TablePagination table={table} showSizeSelector />
    </div>
  );
}

export function CsvViewerDialog({
  file,
  onClose,
}: {
  /** The file to show; null closes the dialog. */
  file: SidReportFile | null;
  onClose: () => void;
}) {
  const [sheet, setSheet] = useState<CsvSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = file?.signedUrl ?? null;

  useEffect(() => {
    setSheet(null);
    setError(null);
    if (!url) return;

    const controller = new AbortController();
    loadCsv(url, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setSheet(loaded);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Unknown error');
        }
      });
    return () => {
      controller.abort();
    };
  }, [url]);

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[90vh] max-w-[min(96vw,1600px)] flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">
            {file?.fileName}
          </DialogTitle>
          <DialogDescription className="font-sans-neue text-xs">
            {file ? `${file.rowCount.toLocaleString()} rows` : ''}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-muted-foreground">
            {error} Reload the page to request a fresh link.
          </p>
        ) : sheet ? (
          <CsvTable sheet={sheet} />
        ) : (
          <Loading />
        )}
      </DialogContent>
    </Dialog>
  );
}
