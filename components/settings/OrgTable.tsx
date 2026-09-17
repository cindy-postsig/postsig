'use client';

import { useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  userColumns,
  groupColumns,
  folderColumns,
  contractColumns,
} from './orgColumns';

interface OrgTableProps<T = any> {
  data: T[];
  columns: string[] | ColumnDef<T>[];
  // Legacy callback props for backward compatibility with existing usages
  onRemoveUser?: (id: string) => void;
  onRemoveGroup?: (id: string | number) => void;
  onRemoveFolder?: (id: string) => void;
  onRemoveContract?: (id: string) => void;
  onRoleChange?: (id: string, role: string) => void;
  onAppRoleChange?: (id: string, role: string) => void;
  canUpdateUsers?: boolean;
  // Generic meta for new usages passing columns directly
  meta?: Record<string, any>;
  emptyStateMessage?: string;
}

export function OrgTable<T extends { id: string | number }>({
  data,
  columns,
  onRemoveUser,
  onRemoveGroup,
  onRemoveFolder,
  onRemoveContract,
  onRoleChange,
  onAppRoleChange,
  canUpdateUsers,
  meta = {},
  emptyStateMessage = 'No data found',
}: OrgTableProps<T>) {
  const columnsToUse = useMemo(() => {
    // If columns are already ColumnDef objects, use them directly
    if (columns.length > 0 && typeof columns[0] !== 'string') {
      return columns as ColumnDef<T>[];
    }

    // Otherwise, look up column IDs from the registry
    const allColumns = [
      ...userColumns,
      ...groupColumns,
      ...folderColumns,
      ...contractColumns,
    ];

    const columnMap = allColumns.reduce(
      (acc, col) => {
        if (col.id) {
          acc[col.id] = col;
        }
        return acc;
      },
      {} as { [key: string]: ColumnDef<any> },
    );

    return (columns as string[])
      .map((colId) => columnMap[colId])
      .filter(Boolean);
  }, [columns]);

  // Merge legacy callback props with meta for backward compatibility
  const tableMeta = {
    onRemoveUser,
    onRemoveGroup,
    onRemoveFolder,
    onRemoveContract,
    onRoleChange,
    onAppRoleChange,
    canUpdateUsers,
    ...meta,
  };

  if (data.length === 0) {
    return (
      <div className="rounded border p-8 text-center">
        <p className="text-xs text-muted-foreground">{emptyStateMessage}</p>
      </div>
    );
  }

  return (
    <Table stickyHeader scrollClassName="rounded border">
      <TableHeader>
        <TableRow>
          {columnsToUse.map((column) => (
            <TableHead
              key={column.id}
              className={`py-2 text-xs ${(column.meta as any)?.className || ''} ${column.id === 'actions' ? 'text-right' : ''}`}
            >
              {typeof column.header === 'string'
                ? column.header
                : typeof column.header === 'function'
                  ? column.header({} as any)
                  : column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => (
          <TableRow key={item.id} className="font-sans">
            {columnsToUse.map((column) => (
              <TableCell key={column.id} className="bg-card py-2">
                {typeof column.cell === 'function'
                  ? column.cell({
                      row: { original: item },
                      table: {
                        options: {
                          meta: tableMeta,
                        },
                      },
                    } as any)
                  : column.cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
