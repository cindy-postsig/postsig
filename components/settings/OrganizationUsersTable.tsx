'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Search, MoreHorizontal } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { userColumns, type User } from './orgColumns';
import { UserAvatar } from '@/components/ui/user-avatar';
import { OrgTable } from './OrgTable';
import {
  deleteOrganizationUser,
  updateOrganizationUser,
  resendUserInvite,
} from '@/app/lib/actions/organization-users';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { UserRole } from '@/constants/types';
import { useSharingDialog } from '@/app/(app)/SharingDialogContext';
import {
  ADMIN,
  MANAGER,
  VIEWER,
  POSTSIG_ADMIN,
  POSTSIG_REVIEWER,
  POSTSIG_EXTRACTOR,
} from '@/constants/data';
import { useAbility } from '@/components/providers/AbilityProvider';

export interface PendingInvite {
  id: string;
  userId?: string;
  name: string | null;
  email: string | null;
  businessGroup?: string;
  role?: string;
  invitedAt: string;
  status: 'pending' | 'expired';
}

interface OrganizationUsersTableProps {
  orgUsers: User[];
  pendingInvites?: PendingInvite[];
}

export function OrganizationUsersTable({
  orgUsers,
  pendingInvites = [],
}: OrganizationUsersTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const ability = useAbility();
  const { refreshOrgData } = useSharingDialog();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [isProcessing, setIsProcessing] = useState(false);

  const canUpdateUsers = ability.can('update', 'User');
  const canResendInvite = ability.can('resend_invite', 'User');

  const roleOptions = useMemo(() => {
    const roles = Array.from(
      new Set(
        [
          ...orgUsers.map((user) => user.appRole),
          ...pendingInvites.map((invite) => invite.role),
        ].filter(Boolean),
      ),
    ) as string[];

    // Sort roles in the desired order: Admin, Manager, Viewer, then PostSig roles
    const roleOrder = [
      ADMIN,
      MANAGER,
      VIEWER,
      POSTSIG_ADMIN,
      POSTSIG_REVIEWER,
      POSTSIG_EXTRACTOR,
    ];
    const sortedRoles = roles.sort((a, b) => {
      const indexA = roleOrder.indexOf(a);
      const indexB = roleOrder.indexOf(b);
      // If a role is not in the order array, put it at the end
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    return [
      { value: 'all', label: 'All Roles' },
      ...sortedRoles.map((role) => ({ value: role, label: role })),
    ];
  }, [orgUsers, pendingInvites]);

  const handleRemoveUser = useCallback(
    async (userId: string) => {
      if (!confirm('Are you sure you want to remove this user?')) {
        return;
      }

      setIsProcessing(true);
      try {
        await deleteOrganizationUser(userId);
        refreshOrgData();

        toast({
          title: 'Success',
          description: 'User removed successfully',
        });
        router.refresh();
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to remove user',
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [toast, router, refreshOrgData],
  );

  const handleAppRoleChange = useCallback(
    async (userId: string, newRole: string) => {
      setIsProcessing(true);
      try {
        await updateOrganizationUser(userId, {
          appRole: newRole as UserRole,
        });
        refreshOrgData();

        toast({
          title: 'Success',
          description: 'User role updated successfully',
        });
        router.refresh();
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to update user role',
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [toast, router, refreshOrgData],
  );

  const handleResendInvite = useCallback(
    async (userId: string) => {
      setIsProcessing(true);
      try {
        await resendUserInvite(userId);
        toast({
          title: 'Success',
          description: 'Invite resent successfully',
        });
        router.refresh();
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to resend invite',
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [toast, router],
  );

  const columns = useMemo(
    () => ['user', 'title', 'appRoleEditable' /* , 'actionsWithManage' */],
    [],
  );

  // Create columns for pending invites
  const pendingColumns = useMemo(
    () => [
      {
        accessorKey: 'user',
        id: 'user',
        header: 'User',
        cell: ({ row }: { row: any }) => {
          const invite = row.original;
          return (
            <div className="flex items-center gap-3">
              <UserAvatar
                name={invite.name}
                email={invite.email}
                userId={invite.userId || invite.email || invite.id}
                size="md"
              />
              <div>
                <div className="font-medium text-sm">
                  {invite.name || invite.email || ''}
                </div>
                {invite.name && (
                  <div className="text-xs text-muted-foreground">
                    {invite.email || 'No email'}
                  </div>
                )}
              </div>
            </div>
          );
        },
        meta: {
          className: 'w-1/3',
        },
        filterFn: (row: any, id: string, value: string) => {
          const invite = row.original;
          const searchValue = value.toLowerCase();
          const name = invite.name?.toLowerCase() || '';
          const email = invite.email?.toLowerCase() || '';
          return name.includes(searchValue) || email.includes(searchValue);
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }: { row: any }) => {
          const invite = row.original;
          return (
            <Badge
              variant={
                invite.status === 'pending' ? 'secondary' : 'destructive'
              }
              className="px-2 py-0 text-xs"
            >
              {invite.status === 'pending' ? 'Pending' : 'Expired'}
            </Badge>
          );
        },
        filterFn: (row: any, id: string, value: string) => {
          if (value === 'all') return true;
          return row.original.status === value;
        },
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }: { row: any }) => {
          const role = row.original.role;
          return <div className="text-sm">{role || '—'}</div>;
        },
        filterFn: (row: any, id: string, value: string) => {
          if (value === 'all') return true;
          return row.original.role === value;
        },
      },
      {
        id: 'actions',
        header: 'Invite sent at',
        cell: ({ row }: { row: any }) => {
          const invite = row.original;

          // Format date if invitedAt exists
          let formattedDate = '';
          let formattedTime = '';

          if (invite.invitedAt) {
            const inviteDate = new Date(invite.invitedAt);
            formattedDate = inviteDate.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
            formattedTime = inviteDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZoneName: 'short',
            });
          }

          return (
            <div>
              <div className="flex items-center justify-between gap-4">
                {invite.status === 'expired' && invite.userId ? (
                  <Button
                    variant={'outline'}
                    size={'sm'}
                    onClick={() => handleResendInvite(invite.userId)}
                    disabled={isProcessing || !canResendInvite}
                  >
                    Resend Invite
                  </Button>
                ) : invite.invitedAt ? (
                  <div className="text-sm text-muted-foreground">
                    {formattedDate} at {formattedTime}
                  </div>
                ) : (
                  <div />
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={isProcessing}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() =>
                        invite.userId && handleRemoveUser(invite.userId)
                      }
                    >
                      Cancel Invitation
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        },
        enableSorting: false,
        meta: {
          className: '',
        },
      },
    ],
    [handleRemoveUser, handleResendInvite, isProcessing, canResendInvite],
  );

  // Custom global filter function
  const customGlobalFilter = (row: any, columnId: string, value: string) => {
    const search = value.toLowerCase();
    const user = row.original;

    // Search in name and email
    const name = user.name?.toLowerCase() || '';
    const email = user.email?.toLowerCase() || '';

    return name.includes(search) || email.includes(search);
  };

  const columnsToUse = useMemo(() => {
    const columnMap = userColumns.reduce(
      (acc, col) => {
        if (col.id) {
          acc[col.id] = col;
        }
        return acc;
      },
      {} as { [key: string]: any },
    );

    return columns.map((colId) => columnMap[colId]).filter(Boolean);
  }, [columns]);

  const filteredOrgUsers = useMemo(
    () =>
      selectedRole === 'all'
        ? orgUsers
        : orgUsers.filter((user) => user.appRole === selectedRole),
    [orgUsers, selectedRole],
  );

  const filteredPendingInvites = useMemo(
    () =>
      selectedRole === 'all'
        ? pendingInvites
        : pendingInvites.filter((invite) => invite.role === selectedRole),
    [pendingInvites, selectedRole],
  );

  const usersTable = useReactTable({
    data: filteredOrgUsers,
    columns: columnsToUse,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: customGlobalFilter,
    state: {
      columnFilters,
      globalFilter,
    },
    meta: {
      onRemoveUser: handleRemoveUser,
      onAppRoleChange: handleAppRoleChange,
      canUpdateUsers,
    },
  });

  const pendingTable = useReactTable({
    data: filteredPendingInvites,
    columns: pendingColumns,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: customGlobalFilter,
    state: {
      columnFilters,
      globalFilter,
    },
  });

  const handleBusinessGroupChange = useCallback(
    (value: string) => {
      const usersColumn = usersTable.getColumn('businessGroup');
      const pendingColumn = pendingTable.getColumn('businessGroup');
      const filterValue = value === 'all' ? undefined : value;

      if (usersColumn) {
        usersColumn.setFilterValue(filterValue);
      }
      if (pendingColumn) {
        pendingColumn.setFilterValue(filterValue);
      }
    },
    [usersTable, pendingTable],
  );

  const FilterComponent = useMemo(
    () => (
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="relative lg:w-1/2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="h-9 pl-10 text-sm"
          />
        </div>

        <div className="flex gap-3 lg:w-1/2">
          <div className="flex-1">
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) => (
                  <div key={option.value}>
                    <SelectItem
                      value={option.value}
                      className={option.value === 'all' ? 'font-medium' : ''}
                    >
                      {option.label}
                    </SelectItem>
                    {option.value === 'all' && <Separator className="my-1" />}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    ),
    [globalFilter, roleOptions, selectedRole],
  );

  return (
    <Tabs defaultValue="users" className="space-y-4">
      <TabsList className="w-full justify-start border-b">
        <TabsTrigger value="users">
          PostSig users ({orgUsers.length})
        </TabsTrigger>
        <TabsTrigger value="pending" disabled={pendingInvites.length === 0}>
          Pending Invites ({pendingInvites.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="users" className="space-y-4">
        {FilterComponent}
        <OrgTable
          data={usersTable
            .getFilteredRowModel()
            .rows.map((row) => row.original)}
          columns={columns}
          onRemoveUser={handleRemoveUser}
          onAppRoleChange={handleAppRoleChange}
          canUpdateUsers={canUpdateUsers}
          emptyStateMessage="No PostSig users found"
        />
      </TabsContent>

      <TabsContent value="pending" className="space-y-4">
        {FilterComponent}
        <Table stickyHeader scrollClassName="rounded border">
          <TableHeader>
            {pendingTable.getHeaderGroups().map((headerGroup: any) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header: any) => (
                  <TableHead
                    key={header.id}
                    className={`py-3 text-xs ${header.column.columnDef.meta?.className}`}
                  >
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
            {pendingTable.getRowModel().rows?.length ? (
              pendingTable.getRowModel().rows.map((row: any) => (
                <TableRow key={row.id} className="font-sans">
                  {row.getVisibleCells().map((cell: any) => (
                    <TableCell
                      key={cell.id}
                      className={`bg-card ${cell.column.columnDef.meta?.className}`}
                    >
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
                  colSpan={pendingColumns.length}
                  className="h-96 text-center"
                >
                  No pending invites found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TabsContent>
    </Tabs>
  );
}
