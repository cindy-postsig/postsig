'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { FileText } from 'lucide-react';
import { formatDateTime } from '@/utils/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import {
  DocumentStatusBadge,
  type DocumentStatusCategory,
} from './DocumentStatusBadge';

export function nameColumn<T extends { name: string }>(opts?: {
  header?: string;
}): ColumnDef<T, unknown> {
  return {
    id: 'name',
    header: opts?.header ?? 'Name',
    cell: ({ row }) => (
      <div className="flex h-8 max-w-md items-center gap-2">
        <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <span className="font-medium truncate text-[1.05em] leading-tight">
          {row.original.name}
        </span>
      </div>
    ),
  };
}

/**
 * Cell component rather than inline JSX: column definitions are often built at
 * module scope, so reading the date preference has to happen during the cell's
 * own render.
 */
function DateTimeCell({ value }: { value: string }) {
  const { dateFormat } = useDateFormat();
  if (!value) {
    return <span className="text-xs text-muted-foreground">&mdash;</span>;
  }
  const { text, isRecent } = formatDateTime(value, dateFormat);
  return (
    <span
      className={`whitespace-nowrap text-xs ${isRecent ? '' : 'tabular-nums'}`}
    >
      {text}
    </span>
  );
}

export function dateColumn<T>(
  accessor: (row: T) => string,
  opts?: { header?: string },
): ColumnDef<T, unknown> {
  return {
    id: opts?.header?.toLowerCase().replace(/\s+/g, '-') ?? 'date',
    header: opts?.header ?? 'Date',
    cell: ({ row }) => <DateTimeCell value={accessor(row.original)} />,
  };
}

export function personColumn<T>(
  accessor: (row: T) => string,
  opts?: { header?: string; size?: number },
): ColumnDef<T, unknown> {
  return {
    id: opts?.header?.toLowerCase().replace(/\s+/g, '-') ?? 'person',
    header: opts?.header ?? 'Person',
    size: opts?.size,
    cell: ({ row }) => (
      <span className="truncate text-sm">{accessor(row.original) || '—'}</span>
    ),
  };
}

export function statusColumn<T>(
  accessor: (row: T) => {
    label: string;
    category: DocumentStatusCategory;
    failureMessage?: string;
  },
  opts?: { header?: string; size?: number },
): ColumnDef<T, unknown> {
  return {
    id: 'status',
    header: opts?.header ?? 'Status',
    size: opts?.size,
    cell: ({ row }) => {
      const { label, category, failureMessage } = accessor(row.original);
      return (
        <DocumentStatusBadge
          label={label}
          category={category}
          failureMessage={failureMessage}
        />
      );
    },
  };
}
