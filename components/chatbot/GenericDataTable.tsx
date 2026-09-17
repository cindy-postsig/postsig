'use client';

import type { ReactNode } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';
import { csvField } from '@/lib/csv-export/escape';

type RowRecord = Record<string, unknown>;

export interface ColumnConfig<T extends RowRecord = RowRecord> {
  key: keyof T & string;
  header?: string;
  render?: (value: unknown, row: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
  exportFormat?: (value: unknown, row: T) => string;
}

export interface FooterCell {
  key: string;
  label?: string;
  value: ReactNode;
  className?: string;
}

export interface DataTableProps<T extends RowRecord = RowRecord> {
  data: T[];
  columns?: ColumnConfig<T>[];
  title?: string;
  icon?: ReactNode;
  showExport?: boolean;
  exportFilename?: string;
  emptyMessage?: string;
  className?: string;
  /** Tailwind classes to control vertical scroll/height, e.g. `max-h-[420px] overflow-y-auto`. */
  scrollAreaClassName?: string;
  striped?: boolean;
  hoverable?: boolean;
  /** Footer row for displaying totals. Maps column keys to their footer values. */
  footerRow?: FooterCell[];
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function DataTable<T extends RowRecord = RowRecord>({
  data,
  columns,
  title,
  icon,
  showExport = true,
  exportFilename,
  emptyMessage = 'No data available',
  className,
  scrollAreaClassName,
  striped = false,
  hoverable = true,
  footerRow,
}: DataTableProps<T>) {
  const canExport = useCanExportCsv('cpm');

  const finalColumns: ColumnConfig<T>[] =
    columns ??
    (data.length > 0
      ? (Object.keys(data[0]) as Array<keyof T & string>).map((key) => ({
          key,
          header: formatHeader(key),
        }))
      : []);

  const exportToCSV = () => {
    const headers = finalColumns.map(
      (col) => col.header || formatHeader(col.key),
    );

    const csvRows = data.map((row) =>
      finalColumns.map((col) => {
        const value = row[col.key];
        const formattedValue = col.exportFormat
          ? col.exportFormat(value, row)
          : formatCellValue(value);
        return csvField(formattedValue);
      }),
    );

    const csvContent = [
      headers.join(','),
      ...csvRows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `${exportFilename || title || 'data'}-${Date.now()}.csv`,
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!data || data.length === 0) {
    return (
      <Card className={cn('my-4', className)}>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'not-prose my-4 max-w-full overflow-hidden bg-card/60',
        className,
      )}
    >
      {(title || showExport) && (
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/20 p-2">
          <div className="flex min-w-0 items-center gap-2">
            {icon ?? (
              <FileSpreadsheet
                size={16}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            {title && (
              <CardTitle className="font-medium truncate text-sm">
                {title}
              </CardTitle>
            )}
          </div>

          {showExport && canExport && (
            <Button
              variant="ghost"
              size="sm"
              onClick={exportToCSV}
              className="h-8 gap-1.5"
            >
              <Download size={14} aria-hidden="true" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
          )}
        </CardHeader>
      )}

      <CardContent className="p-0">
        <Table stickyHeader scrollClassName={scrollAreaClassName}>
          <TableHeader>
            <TableRow>
              {finalColumns.map((column) => (
                <TableHead key={column.key} className="bg-background">
                  <div className={cn(column.headerClassName)}>
                    {column.header || formatHeader(column.key)}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="font-sans-neue leading-tight">
            {data.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                className={cn(
                  striped && rowIndex % 2 === 1 && 'bg-muted/15',
                  !hoverable && 'hover:bg-transparent',
                )}
              >
                {finalColumns.map((column) => {
                  const value = row[column.key];
                  const fallback = formatCellValue(value);

                  return (
                    <TableCell
                      key={column.key}
                      className={cn(column.className)}
                    >
                      {column.render
                        ? column.render(value, row, rowIndex)
                        : fallback || '-'}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
          {footerRow && footerRow.length > 0 && (
            <TableFooter>
              <TableRow className="font-semibold bg-muted/30">
                {finalColumns.map((column) => {
                  const footerCell = footerRow.find(
                    (cell) => cell.key === column.key,
                  );
                  return (
                    <TableCell
                      key={column.key}
                      className={cn(column.className, footerCell?.className)}
                    >
                      {footerCell?.label && (
                        <span className="mr-1 text-muted-foreground">
                          {footerCell.label}
                        </span>
                      )}
                      {footerCell?.value ?? ''}
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}

function formatHeader(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
