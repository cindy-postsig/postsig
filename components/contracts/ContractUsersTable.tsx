import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ColumnDef,
  type Column,
  type Row,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, ArrowUp, ArrowDown } from 'lucide-react';
import { ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { VendorProduct } from '@/constants/types';
import { cn } from '@/lib/utils';
import { ViewContractUserDialog } from '@/components/contracts/ViewContractUserDialog';
import {
  EditContractUserDialog,
  EditUserDraft,
} from '@/components/contracts/EditContractUserDialog';
import { VendorProduct as VendorProductType } from '@/constants/types';
import { FormErrors } from '@/app/hooks/useContractUsers';

type EmployeeStatus = 'active' | 'inactive' | 'on_leave';

type User = {
  id: number;
  name: string;
  email: string | null;
  product_id?: number | null;
  vendor_products?: VendorProduct | null;
  contract_id: number | null;
  created_at: string;
  updated_at: string | null;
  employee_id?: string | null;
  region?: string | null;
  country?: string | null;
  division?: string | null;
  department?: string | null;
  cost_center?: string | null;
  entity?: string | null;
  business_unit?: string | null;
  team?: string | null;
  businessGroup?: { id: number; name: string } | null;
  start_date?: string | null;
  leave_date?: string | null;
  status?: EmployeeStatus;
  org_employee_id?: number | null;
};

const statusVariant = (status: EmployeeStatus) =>
  status === 'active' ? ('secondary' as const) : ('outline' as const);

const statusLabel = (status: EmployeeStatus) =>
  status === 'on_leave'
    ? 'On Leave'
    : status.charAt(0).toUpperCase() + status.slice(1);

interface ContractUsersTableProps {
  users: User[];
  onDeleteUser: (id: number) => void;
  disabled?: boolean;
  isContractOwnerTab?: boolean;
  vendorProducts?: VendorProductType[];
  orgGroups?: Array<{ id: number; name: string }>;
  onEditUser?: (userId: number, draft: EditUserDraft) => Promise<boolean>;
  isUpdatingUser?: boolean;
  editErrors?: FormErrors;
  resetEditErrors?: () => void;
  clearEditFieldError?: (field: keyof FormErrors) => void;
  hideProductColumn?: boolean;
  showViewEdit?: boolean;
}

export default function ContractUsersTable({
  users,
  onDeleteUser,
  disabled = false,
  isContractOwnerTab = false,
  vendorProducts,
  orgGroups = [],
  onEditUser,
  isUpdatingUser = false,
  editErrors,
  resetEditErrors,
  clearEditFieldError,
  hideProductColumn = false,
  showViewEdit = false,
}: ContractUsersTableProps) {
  const canViewEdit = isContractOwnerTab || showViewEdit;
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'name', desc: false },
  ]);

  const [viewUserId, setViewUserId] = React.useState<number | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = React.useState(false);
  const viewUser = React.useMemo(
    () => users.find((u) => u.id === viewUserId) ?? null,
    [users, viewUserId],
  );

  const [editUserId, setEditUserId] = React.useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const editUser = React.useMemo(
    () => users.find((u) => u.id === editUserId) ?? null,
    [users, editUserId],
  );

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => {
        const isSorted = column.getIsSorted();
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(isSorted === 'asc')}
            className={`h-auto p-0 text-[0.8rem] hover:bg-transparent ${
              isSorted ? 'font-medium text-foreground' : 'font-normal'
            }`}
          >
            Name
            {isSorted && (
              <span className="ml-1">
                {isSorted === 'asc' ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <ArrowDown className="h-4 w-4" />
                )}
              </span>
            )}
          </Button>
        );
      },
    },
    ...(!isContractOwnerTab
      ? [
          {
            accessorKey: 'email',
            header: ({ column }: { column: any }) => {
              const isSorted = column.getIsSorted();
              return (
                <Button
                  variant="ghost"
                  onClick={() => column.toggleSorting(isSorted === 'asc')}
                  className={`h-auto p-0 text-[0.8rem] hover:bg-transparent ${
                    isSorted ? 'font-medium text-foreground' : 'font-normal'
                  }`}
                >
                  Email
                  {isSorted && (
                    <span className="ml-1">
                      {isSorted === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )}
                    </span>
                  )}
                </Button>
              );
            },
          } as ColumnDef<User>,
        ]
      : []),
    ...(!hideProductColumn
      ? [
          {
            id: 'vendor_products',
            accessorFn: (row) => row.vendor_products?.name || '',
            header: ({ column }) => {
              const isSorted = column.getIsSorted();
              return (
                <Button
                  variant="ghost"
                  onClick={() => column.toggleSorting(isSorted === 'asc')}
                  className={`h-auto p-0 text-[0.8rem] hover:bg-transparent ${
                    isSorted ? 'font-medium text-foreground' : 'font-normal'
                  }`}
                >
                  Product
                  {isSorted && (
                    <span className="ml-1">
                      {isSorted === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )}
                    </span>
                  )}
                </Button>
              );
            },
            cell: ({ row }) => (
              <div className="line-clamp-1 leading-tight">
                {row.original.vendor_products?.name || (
                  <span className="text-muted-foreground">All Products</span>
                )}
              </div>
            ),
          } as ColumnDef<User>,
        ]
      : []),
    ...(isContractOwnerTab
      ? [
          {
            accessorKey: 'region',
            header: ({ column }: { column: any }) => {
              const isSorted = column.getIsSorted();
              return (
                <Button
                  variant="ghost"
                  onClick={() => column.toggleSorting(isSorted === 'asc')}
                  className={`h-auto p-0 text-[0.8rem] hover:bg-transparent ${
                    isSorted ? 'font-medium text-foreground' : 'font-normal'
                  }`}
                >
                  Region
                  {isSorted && (
                    <span className="ml-1">
                      {isSorted === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )}
                    </span>
                  )}
                </Button>
              );
            },
          },
          {
            accessorKey: 'department',
            header: ({ column }: { column: any }) => {
              const isSorted = column.getIsSorted();
              return (
                <Button
                  variant="ghost"
                  onClick={() => column.toggleSorting(isSorted === 'asc')}
                  className={`h-auto p-0 text-[0.8rem] hover:bg-transparent ${
                    isSorted ? 'font-medium text-foreground' : 'font-normal'
                  }`}
                >
                  Department
                  {isSorted && (
                    <span className="ml-1">
                      {isSorted === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )}
                    </span>
                  )}
                </Button>
              );
            },
          },
          {
            accessorKey: 'cost_center',
            header: ({ column }: { column: any }) => {
              const isSorted = column.getIsSorted();
              return (
                <Button
                  variant="ghost"
                  onClick={() => column.toggleSorting(isSorted === 'asc')}
                  className={`h-auto p-0 text-[0.8rem] hover:bg-transparent ${
                    isSorted ? 'font-medium text-foreground' : 'font-normal'
                  }`}
                >
                  Cost Center
                  {isSorted && (
                    <span className="ml-1">
                      {isSorted === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )}
                    </span>
                  )}
                </Button>
              );
            },
          },
          {
            id: 'business_group',
            accessorFn: (row: User) => row.businessGroup?.name || '',
            header: ({ column }: { column: any }) => {
              const isSorted = column.getIsSorted();
              return (
                <Button
                  variant="ghost"
                  onClick={() => column.toggleSorting(isSorted === 'asc')}
                  className={`h-auto p-0 text-[0.8rem] hover:bg-transparent ${
                    isSorted ? 'font-medium text-foreground' : 'font-normal'
                  }`}
                >
                  Business Group
                  {isSorted && (
                    <span className="ml-1">
                      {isSorted === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )}
                    </span>
                  )}
                </Button>
              );
            },
            cell: ({ row }: { row: any }) => {
              const group = row.original.businessGroup;
              if (group?.name) return group.name;
              return;
            },
          },
          {
            accessorKey: 'status',
            header: ({ column }: { column: Column<User, unknown> }) => {
              const isSorted = column.getIsSorted();
              return (
                <Button
                  variant="ghost"
                  onClick={() => column.toggleSorting(isSorted === 'asc')}
                  className={`h-auto p-0 text-[0.8rem] hover:bg-transparent ${
                    isSorted ? 'font-medium text-foreground' : 'font-normal'
                  }`}
                >
                  Status
                  {isSorted && (
                    <span className="ml-1">
                      {isSorted === 'asc' ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : (
                        <ArrowDown className="h-4 w-4" />
                      )}
                    </span>
                  )}
                </Button>
              );
            },
            cell: ({ row }: { row: Row<User> }) => {
              const status = (row.original.status ??
                'active') as EmployeeStatus;
              return (
                <Badge
                  variant={statusVariant(status)}
                  className="px-2 py-0 text-xs"
                >
                  {statusLabel(status)}
                </Badge>
              );
            },
          } as ColumnDef<User>,
        ]
      : []),
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={disabled}>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canViewEdit && (
                <DropdownMenuItem
                  onClick={() => {
                    setViewUserId(row.original.id);
                    setViewDialogOpen(true);
                  }}
                  disabled={disabled}
                >
                  View Details
                </DropdownMenuItem>
              )}
              {canViewEdit && (
                <DropdownMenuItem
                  onClick={() => {
                    resetEditErrors?.();
                    setEditUserId(row.original.id);
                    setEditDialogOpen(true);
                  }}
                  disabled={disabled}
                >
                  Edit Details
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDeleteUser(row.original.id)}
                disabled={disabled}
              >
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: users,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 15,
      },
      sorting: [{ id: 'name', desc: false }],
    },
    state: {
      sorting,
    },
  });

  return (
    <>
      {viewUser && (
        <ViewContractUserDialog
          user={viewUser}
          open={viewDialogOpen}
          onOpenChange={(open) => {
            setViewDialogOpen(open);
            if (!open) setViewUserId(null);
          }}
          onEdit={
            canViewEdit
              ? () => {
                  setViewDialogOpen(false);
                  resetEditErrors?.();
                  setEditUserId(viewUser.id);
                  setEditDialogOpen(true);
                }
              : undefined
          }
        />
      )}
      {editUser && (
        <EditContractUserDialog
          user={editUser}
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) {
              setEditUserId(null);
              resetEditErrors?.();
            }
          }}
          vendorProducts={vendorProducts}
          orgGroups={orgGroups}
          disabled={disabled}
          isSaving={isUpdatingUser}
          errors={editErrors}
          onClearError={clearEditFieldError}
          onSave={async (draft) => {
            if (!onEditUser || editUserId === null) return false;
            return onEditUser(editUserId, draft);
          }}
        />
      )}
      <div
        className={cn(
          'overflow-auto rounded border',
          users.length > 10 && 'max-h-[390px]',
        )}
      >
        <Table className="min-w-[800px]">
          <TableHeader
            className={users.length > 10 ? 'sticky top-0 z-10 bg-card' : ''}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="py-2">
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
                    <TableCell key={cell.id} className="py-1">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between space-x-2 py-2">
          <div className="flex-1 font-label text-xs text-muted-foreground">
            {table.getState().pagination.pageIndex *
              table.getState().pagination.pageSize +
              1}{' '}
            to{' '}
            {Math.min(
              (table.getState().pagination.pageIndex + 1) *
                table.getState().pagination.pageSize,
              table.getFilteredRowModel().rows.length,
            )}{' '}
            of {table.getFilteredRowModel().rows.length} users
          </div>
          <div className="space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
