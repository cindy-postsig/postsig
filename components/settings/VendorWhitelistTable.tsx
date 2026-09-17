'use client';

import { useMemo, useState, useCallback } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  RowSelectionState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Trash2, ArrowUpDown } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  useRemoveVendor,
  useRemoveVendors,
} from '@/hooks/api/useVendorWhitelist';
import type { VendorWhitelistEntry } from '@/lib/v2/organization-preferences/types';
import { Can, useAbility } from '@/components/providers/AbilityProvider';

interface VendorWhitelistTableProps {
  whitelist: VendorWhitelistEntry[];
  canUpdate: boolean;
}

export function VendorWhitelistTable({
  whitelist,
  canUpdate,
}: VendorWhitelistTableProps) {
  const ability = useAbility();
  const { toast } = useToast();
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);
  const removeVendor = useRemoveVendor();
  const removeVendors = useRemoveVendors();

  const selectedCount = Object.keys(rowSelection).length;
  const isBulkDelete = (deleteTarget?.length ?? 0) > 1;
  const isDeleting = removeVendor.isPending || removeVendors.isPending;

  const openDeleteDialog = useCallback((emails: string[]) => {
    setDeleteTarget(emails);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || deleteTarget.length === 0) return;

    try {
      if (deleteTarget.length === 1) {
        await removeVendor.mutateAsync(deleteTarget[0]);
      } else {
        await removeVendors.mutateAsync({
          emails: deleteTarget,
          currentWhitelist: whitelist,
        });
        setRowSelection({});
      }
      toast({
        title: 'Success',
        description:
          deleteTarget.length > 1
            ? `Removed ${deleteTarget.length} vendors from whitelist`
            : 'Vendor removed from whitelist',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to remove vendor${isBulkDelete ? 's' : ''}`,
      });
    }
    setDeleteTarget(null);
  }, [
    deleteTarget,
    whitelist,
    removeVendor,
    removeVendors,
    toast,
    isBulkDelete,
  ]);

  const columns: ColumnDef<VendorWhitelistEntry>[] = useMemo(
    () => [
      ...(canUpdate
        ? [
            {
              id: 'select',
              header: ({
                table,
              }: {
                table: ReturnType<typeof useReactTable<VendorWhitelistEntry>>;
              }) => (
                <div className="flex">
                  <Checkbox
                    checked={
                      table.getIsAllPageRowsSelected() ||
                      (table.getIsSomePageRowsSelected() && 'indeterminate')
                    }
                    onCheckedChange={(value) =>
                      table.toggleAllPageRowsSelected(!!value)
                    }
                    aria-label="Select all"
                  />
                </div>
              ),
              cell: ({
                row,
              }: {
                row: {
                  getIsSelected: () => boolean;
                  toggleSelected: (value?: boolean) => void;
                };
              }) => (
                <div className="flex">
                  <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label="Select row"
                  />
                </div>
              ),
              enableSorting: false,
            } satisfies ColumnDef<VendorWhitelistEntry>,
          ]
        : []),
      {
        accessorKey: 'email',
        header: ({ column }) => (
          <button
            type="button"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Email / Domain
            <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        cell: ({ row }) => (
          <span className="text-sm">{row.getValue('email')}</span>
        ),
      },
      {
        accessorKey: 'vendorName',
        header: 'Vendor Name',
        cell: ({ row }) => (
          <span className="text-sm">{row.getValue('vendorName') || '—'}</span>
        ),
      },
      {
        accessorKey: 'addedAt',
        header: ({ column }) => (
          <button
            type="button"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Added
            <ArrowUpDown className="h-3 w-3" />
          </button>
        ),
        cell: ({ row }) => {
          const date = new Date(row.getValue('addedAt'));
          return (
            <span className="text-sm text-muted-foreground">
              {date.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="text-right">
            <Can I="update" a="OrganizationPreference" ability={ability}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => openDeleteDialog([row.original.email])}
                disabled={!canUpdate || isDeleting}
                aria-label="Remove vendor"
                title="Remove from whitelist"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Can>
          </div>
        ),
        enableSorting: false,
      },
    ],
    [canUpdate, isDeleting, ability],
  );

  const table = useReactTable({
    data: whitelist,
    columns,
    state: {
      globalFilter,
      sorting,
      rowSelection,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = filterValue.toLowerCase();
      const email = row.original.email?.toLowerCase() || '';
      const name = row.original.vendorName?.toLowerCase() || '';
      return email.includes(search) || name.includes(search);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search vendors..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-9 pl-10 text-sm"
          />
        </div>
        {canUpdate && selectedCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const emails = Object.keys(rowSelection).map(
                (index) => whitelist[parseInt(index)].email,
              );
              openDeleteDialog(emails);
            }}
            disabled={isDeleting}
            className="text-red-600 dark:text-red-400"
          >
            Remove {selectedCount} Selected
          </Button>
        )}
      </div>

      <Table stickyHeader scrollClassName="rounded border">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="py-2 text-xs">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="font-sans">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="bg-card py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-32 text-center text-muted-foreground"
              >
                {globalFilter
                  ? 'No vendors match your search'
                  : 'No vendors in whitelist'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBulkDelete
                ? `Remove ${deleteTarget?.length} vendors?`
                : 'Remove vendor?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isBulkDelete ? (
                <>
                  This will remove {deleteTarget?.length} vendors from your
                  whitelist.
                </>
              ) : (
                <>
                  This will remove <strong>{deleteTarget?.[0]}</strong> from
                  your whitelist.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
