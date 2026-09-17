'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreHorizontal,
  ExternalLink,
  FolderIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import VendorIcon from '@/components/vendors/VendorIcon';
import { formatCurrency } from '@/app/lib/utils';
import { RoleSelector } from '@/components/settings/RoleSelector';
import { UserRole } from '@/constants/types';
import {
  ADMIN,
  MANAGER,
  VIEWER,
  POSTSIG_ADMIN,
  POSTSIG_REVIEWER,
  POSTSIG_EXTRACTOR,
} from '@/constants/data';
import { UserAvatar } from '@/components/ui/user-avatar';

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  job_title?: string | null;
  jobTitle?: string;
  businessGroup?: string;
  role?: string;
  appRole?: UserRole;
  addedAt?: string;
  isCurrentUser?: boolean;
}

export interface Group {
  id: number;
  publicUuid: string;
  name: string;
  memberCount?: number;
}

export interface Folder {
  id: string;
  name: string;
  contractCount?: number;
}

export interface Contract {
  id: string;
  vendorName: string;
  vendorDomain?: string;
  product: string;
  annualCost: number;
  currency: string;
}

const formatAddedDate = (dateString: string) => {
  try {
    return format(new Date(dateString), 'MMM d, yyyy');
  } catch {
    return 'Unknown';
  }
};

// User columns
export const userColumns: ColumnDef<User>[] = [
  // User column - unified for all contexts
  {
    accessorKey: 'user',
    id: 'user',
    header: 'User',
    cell: ({ row }) => {
      const user = row.original;
      const isCurrentUser = user.isCurrentUser;
      const name =
        user.name || (user.email ? user.email.split('@')[0] : 'Unnamed User');

      return (
        <div className="flex items-center gap-3">
          <UserAvatar
            name={user.name}
            email={user.email}
            userId={user.id}
            size="md"
          />
          <div>
            <div className="font-medium flex items-center gap-2 text-sm">
              {/* <Link
                className="hover:underline"
                href={`/settings/organization/users/${user.id}`}
              >
                {name}
              </Link> */}
              {name}
            </div>
            <div className="text-xs text-muted-foreground">
              {user.email || 'No email'}
            </div>
          </div>
        </div>
      );
    },
    meta: {
      className: 'w-1/3',
    },
    filterFn: (row, id, value) => {
      const user = row.original;
      const searchValue = value.toLowerCase();
      const name = user.name?.toLowerCase() || '';
      const email = user.email?.toLowerCase() || '';
      return name.includes(searchValue) || email.includes(searchValue);
    },
  },
  // Title column
  {
    accessorKey: 'jobTitle',
    id: 'title',
    header: 'Title',
    cell: ({ row }) => {
      const user = row.original;
      const jobTitle = user.jobTitle || user.job_title;
      return <div className="text-sm">{jobTitle}</div>;
    },
    filterFn: (row, id, value) => {
      const user = row.original;
      const searchValue = value.toLowerCase();
      const jobTitle = (user.jobTitle || user.job_title || '').toLowerCase();
      return jobTitle.includes(searchValue);
    },
  },
  // Business Group column
  {
    accessorKey: 'businessGroup',
    id: 'businessGroup',
    header: 'Group',
    cell: ({ row }) => {
      const businessGroup = row.original.businessGroup || 'Group';
      return <div className="text-sm">{businessGroup}</div>;
    },
    filterFn: (row, id, value) => {
      if (value === 'all') return true;
      return row.original.businessGroup === value;
    },
  },
  // Role column (read-only badge for group contexts)
  {
    accessorKey: 'role',
    id: 'role',
    header: 'App Role',
    cell: ({ row }) => {
      const role = row.original.role || 'Role';
      return (
        <Badge
          variant={role === 'Admin' ? 'default' : 'outline'}
          className="font-normal"
        >
          {role}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      if (value === 'all') return true;
      return row.original.role === value;
    },
  },
  // Editable role column for user groups context
  {
    accessorKey: 'role',
    id: 'roleEditable',
    header: 'Role',
    cell: ({ row, table }) => {
      const role = row.original.role || VIEWER;
      const onRoleChange = table.options.meta?.onRoleChange;

      return (
        <Select
          defaultValue={role}
          onValueChange={(newRole) => onRoleChange?.(row.original.id, newRole)}
        >
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ADMIN}>Admin</SelectItem>
            <SelectItem value={MANAGER}>Manager</SelectItem>
            <SelectItem value={VIEWER}>Viewer</SelectItem>
          </SelectContent>
        </Select>
      );
    },
    filterFn: (row, id, value) => {
      if (value === 'all') return true;
      return row.original.role === value;
    },
  },
  // Editable app role column for main users table
  {
    accessorKey: 'appRole',
    id: 'appRoleEditable',
    header: 'Role',
    cell: ({ row, table }) => {
      const appRole = row.original.appRole || 'Viewer (Old)';
      const onAppRoleChange = table.options.meta?.onAppRoleChange;
      const canUpdateUsers = table.options.meta?.canUpdateUsers;
      const isCurrentUser = row.original.isCurrentUser;

      const isPostSigRole = [
        POSTSIG_ADMIN,
        POSTSIG_REVIEWER,
        POSTSIG_EXTRACTOR,
      ].includes(appRole);

      if (!canUpdateUsers || isCurrentUser || isPostSigRole) {
        return <>{appRole}</>;
      }

      return (
        <RoleSelector
          value={appRole}
          onValueChange={(newRole) =>
            onAppRoleChange?.(row.original.id, newRole)
          }
          disabled={false}
          className="font-normal h-8 min-w-36 justify-between text-sm"
        />
      );
    },
    filterFn: (row, id, value) => {
      if (value === 'all') return true;
      return row.original.appRole === value;
    },
  },
  // Added date column
  {
    accessorKey: 'addedAt',
    id: 'addedAt',
    header: 'Added',
    cell: ({ row }) => {
      const addedAt = row.original.addedAt;
      return (
        <span className="text-sm text-muted-foreground">
          {addedAt ? formatAddedDate(addedAt) : 'Unknown'}
        </span>
      );
    },
  },
  // Actions column with manage button (organization context)
  {
    id: 'actionsWithManage',
    header: '',
    cell: ({ row, table }) => {
      const user = row.original;
      const onRemoveUser = table.options.meta?.onRemoveUser;

      return (
        <div className="text-right">
          <div className="flex items-center justify-end gap-4">
            {/* TODO: Add manage button */}
            {/* <Button variant={'outline'} size={'sm'} asChild>
              <Link href={`/settings/organization/users/${user.id}`}>
                Manage
              </Link>
            </Button> */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onRemoveUser?.(user.id)}
                >
                  Remove User
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
  // Actions column without manage button (group context)
  {
    id: 'actionsGroupUsers',
    header: '',
    cell: ({ row, table }) => {
      const user = row.original;
      const onRemoveUser = table.options.meta?.onRemoveUser;

      return (
        <div className="text-right">
          <div className="flex items-center justify-end gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onRemoveUser?.(user.id)}
                >
                  Remove from Group
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
  // Actions column for user groups context
  {
    id: 'actionsUserGroups',
    header: '',
    cell: ({ row, table }) => {
      const user = row.original;
      const onRemoveUser = table.options.meta?.onRemoveUser;

      return (
        <div className="text-right">
          <div className="flex items-center justify-end gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onRemoveUser?.(user.id)}
                >
                  Remove from Group
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
  // User name only column (for group context)
  {
    accessorKey: 'user',
    id: 'userName',
    header: 'User',
    cell: ({ row }) => {
      const user = row.original;
      const displayName =
        user.name || (user.email ? user.email.split('@')[0] : 'Unnamed User');

      return (
        <div className="font-medium text-sm">
          <Link
            className="hover:underline"
            href={`/settings/organization/users/${user.id}`}
          >
            {displayName}
          </Link>
        </div>
      );
    },
    meta: {
      className: 'w-1/4',
    },
    filterFn: (row, id, value) => {
      const user = row.original;
      const searchValue = value.toLowerCase();
      const name = user.name?.toLowerCase() || '';
      const email = user.email?.toLowerCase() || '';
      return name.includes(searchValue) || email.includes(searchValue);
    },
  },
];

// Group columns
export const groupColumns: ColumnDef<Group>[] = [
  // Group column
  {
    accessorKey: 'name',
    id: 'group',
    header: 'Group',
    cell: ({ row, table }) => {
      const group = row.original as Group;
      const settingsBasePath =
        table.options.meta?.settingsBasePath ?? '/settings';
      return (
        <div className="font-medium flex items-center gap-2 text-sm">
          <UsersIcon className="h-4 w-4" />
          <Link
            className="hover:underline"
            href={`${settingsBasePath}/groups/${group.publicUuid}`}
          >
            {group.name}
          </Link>
        </div>
      );
    },
    meta: {
      className: 'w-1/3',
    },
    filterFn: (row, id, value) => {
      const group = row.original as Group;
      const searchValue = value.toLowerCase();
      const name = group.name?.toLowerCase() || '';
      return name.includes(searchValue);
    },
  },
  // Member count column
  {
    accessorKey: 'memberCount',
    id: 'memberCount',
    header: 'Users',
    cell: ({ row }) => {
      const group = row.original as Group;
      const count = group.memberCount || 0;
      return (
        <div className="text-sm">
          <span className="font-medium">{count}</span>{' '}
          <span className="text-muted-foreground">
            {count === 1 ? 'user' : 'users'}
          </span>
        </div>
      );
    },
  },
  // Actions for groups
  {
    id: 'actionsGroups',
    header: '',
    cell: ({ row, table }) => {
      const group = row.original as Group;
      const onRemoveGroup = table.options.meta?.onRemoveGroup;
      const settingsBasePath =
        table.options.meta?.settingsBasePath ?? '/settings';

      return (
        <div className="text-right">
          <div className="flex items-center justify-end gap-4">
            <Button variant="outline" size="sm" asChild>
              <Link href={`${settingsBasePath}/groups/${group.publicUuid}`}>
                Manage
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onRemoveGroup?.(group.id)}
                >
                  Delete Group
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
  // Actions for user groups context (remove user from group)
  {
    id: 'actionsUserGroups',
    header: '',
    cell: ({ row, table }) => {
      const group = row.original as Group;
      const onRemoveGroup = table.options.meta?.onRemoveGroup;

      return (
        <div className="text-right">
          <div className="flex items-center justify-end gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onRemoveGroup?.(group.id)}
                >
                  Remove from Group
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
];

// Folder columns
export const folderColumns: ColumnDef<Folder>[] = [
  // Folder column
  {
    accessorKey: 'name',
    id: 'folder',
    header: 'Folder',
    cell: ({ row }) => {
      const folder = row.original as Folder;
      return (
        <div className="font-medium flex items-center gap-2 text-sm">
          <FolderIcon className="h-4 w-4" /> {folder.name}
        </div>
      );
    },
    meta: {
      className: 'w-1/3',
    },
    filterFn: (row, id, value) => {
      const folder = row.original as Folder;
      const searchValue = value.toLowerCase();
      const name = folder.name?.toLowerCase() || '';
      return name.includes(searchValue);
    },
  },
  // Contract count column
  {
    accessorKey: 'contractCount',
    id: 'contractCount',
    header: 'Contracts',
    cell: ({ row }) => {
      const folder = row.original as Folder;
      const count = folder.contractCount || 0;
      return (
        <div className="text-sm">
          <span className="font-medium">{count}</span>{' '}
          <span className="text-muted-foreground">
            {count === 1 ? 'contract' : 'contracts'}
          </span>
        </div>
      );
    },
  },
  // Actions for folders
  {
    id: 'actionsFolders',
    header: '',
    cell: ({ row, table }) => {
      const folder = row.original as Folder;
      const onRemoveFolder = table.options.meta?.onRemoveFolder;

      const handleOpenFolder = () => {
        window.open(`/contracts/folder/${folder.id}`, '_blank');
      };

      return (
        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenFolder}
              className="px-2 text-xs"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onRemoveFolder?.(folder.id)}
                >
                  Revoke Access
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      );
    },
    enableSorting: false,
    meta: {
      className: 'text-right',
    },
  },
];

// Contract columns
export const contractColumns: ColumnDef<Contract>[] = [
  // Vendor & Product column
  {
    accessorKey: 'vendor',
    id: 'vendor',
    header: 'Vendor & Product',
    cell: ({ row }) => {
      const contract = row.original as Contract;
      return (
        <div className="flex items-center gap-2">
          <VendorIcon
            name={contract.vendorName}
            domain={contract.vendorDomain}
            width={20}
            height={20}
          />
          <div>
            <div className="font-medium text-sm">{contract.vendorName}</div>
            <div className="text-xs text-muted-foreground">
              {contract.product}
            </div>
          </div>
        </div>
      );
    },
    meta: {
      className: 'w-1/2',
    },
    filterFn: (row, id, value) => {
      const contract = row.original as Contract;
      const searchValue = value.toLowerCase();
      const vendorName = contract.vendorName?.toLowerCase() || '';
      const product = contract.product?.toLowerCase() || '';
      return vendorName.includes(searchValue) || product.includes(searchValue);
    },
  },
  // Annual cost column
  {
    accessorKey: 'annualCost',
    id: 'annualCost',
    header: 'Annual Cost',
    cell: ({ row }) => {
      const contract = row.original as Contract;
      return (
        <div className="font-medium text-right">
          {formatCurrency(contract.annualCost, contract.currency)}
        </div>
      );
    },
    meta: {
      className: 'text-right',
    },
  },
  // Actions for contracts
  {
    id: 'actionsContracts',
    header: '',
    cell: ({ row, table }) => {
      const contract = row.original as Contract;
      const onRemoveContract = table.options.meta?.onRemoveContract;

      const handleOpenContract = () => {
        window.open(`/contracts/${contract.id}`, '_blank');
      };

      return (
        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenContract}
              className="text-xs"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onRemoveContract?.(contract.id)}
                >
                  Revoke Access
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      );
    },
    enableSorting: false,
    meta: {
      className: 'text-right',
    },
  },
];
