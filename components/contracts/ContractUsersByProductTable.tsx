import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MoreHorizontal, ChevronDown, ChevronRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  VendorProduct as VendorProductType,
  VendorProduct,
  VendorProductUser,
} from '@/constants/types';
import { cn } from '@/lib/utils';
import { ViewContractUserDialog } from '@/components/contracts/ViewContractUserDialog';
import {
  EditContractUserDialog,
  EditUserDraft,
} from '@/components/contracts/EditContractUserDialog';
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
  businessGroup?: { id: number; name: string } | null;
  start_date?: string | null;
  leave_date?: string | null;
  status?: EmployeeStatus;
};

type ProductGroup = {
  productId: number;
  productName: string;
  cap: number | null;
  users: User[];
  usedCount: number;
  hasInactiveUsers: boolean;
};

const statusVariant = (status: EmployeeStatus) => {
  if (status === 'inactive') return 'notice' as const;
  if (status === 'active') return 'secondary' as const;
  return 'outline' as const;
};

const statusLabel = (status: EmployeeStatus) =>
  status === 'on_leave'
    ? 'On Leave'
    : status.charAt(0).toUpperCase() + status.slice(1);

const usageTextColor = (used: number, cap: number | null) => {
  if (cap == null || cap <= 0) return 'text-foreground';
  if (used > cap) return 'text-pink-700';
  return 'text-foreground';
};

function buildProductGroups(
  users: User[],
  vendorProductsUsers: VendorProductUser[],
): ProductGroup[] {
  const groups = new Map<number, ProductGroup>();

  for (const sub of vendorProductsUsers) {
    groups.set(sub.product_id, {
      productId: sub.product_id,
      productName: sub.vendor_products.name,
      cap: sub.number_of_users || 0,
      users: [],
      usedCount: 0,
      hasInactiveUsers: false,
    });
  }

  for (const u of users) {
    if (u.product_id == null) continue;
    if (!groups.has(u.product_id)) {
      groups.set(u.product_id, {
        productId: u.product_id,
        productName: u.vendor_products?.name || `Product ${u.product_id}`,
        cap: null,
        users: [],
        usedCount: 0,
        hasInactiveUsers: false,
      });
    }
  }

  const allProductUsers = users.filter((u) => u.product_id == null);
  const isInactive = (u: User) => (u.status ?? 'active') === 'inactive';
  const sortInactiveFirstThenName = (a: User, b: User) => {
    if (isInactive(a) !== isInactive(b)) return isInactive(a) ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  };

  for (const group of groups.values()) {
    const direct = users.filter((u) => u.product_id === group.productId);
    group.users = [...direct, ...allProductUsers].sort(
      sortInactiveFirstThenName,
    );
    group.usedCount = group.users.filter(
      (u) => (u.status ?? 'active') !== 'inactive',
    ).length;
    group.hasInactiveUsers = group.users.some(
      (u) => (u.status ?? 'active') === 'inactive',
    );
  }

  return [...groups.values()].sort((a, b) =>
    a.productName.localeCompare(b.productName),
  );
}

interface ContractUsersByProductTableProps {
  users: User[];
  vendorProductsUsers: VendorProductUser[];
  onDeleteUser: (id: number) => void;
  onReleaseUser?: (id: number) => void;
  disabled?: boolean;
  vendorProducts?: VendorProductType[];
  orgGroups?: Array<{ id: number; name: string }>;
  onEditUser?: (userId: number, draft: EditUserDraft) => Promise<boolean>;
  isUpdatingUser?: boolean;
  editErrors?: FormErrors;
  resetEditErrors?: () => void;
  clearEditFieldError?: (field: keyof FormErrors) => void;
}

const COLUMN_COUNT = 8;

export default function ContractUsersByProductTable({
  users,
  vendorProductsUsers,
  onDeleteUser,
  onReleaseUser,
  disabled = false,
  vendorProducts,
  orgGroups = [],
  onEditUser,
  isUpdatingUser = false,
  editErrors,
  resetEditErrors,
  clearEditFieldError,
}: ContractUsersByProductTableProps) {
  const groups = React.useMemo(
    () => buildProductGroups(users, vendorProductsUsers),
    [users, vendorProductsUsers],
  );

  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());
  const toggle = (productId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

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
          onEdit={() => {
            setViewDialogOpen(false);
            resetEditErrors?.();
            setEditUserId(viewUser.id);
            setEditDialogOpen(true);
          }}
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
      <Table
        stickyHeader
        scrollClassName="rounded border"
        className="min-w-[800px]"
      >
        <TableHeader>
          <TableRow>
            <TableHead className="font-normal w-[28%] py-2 text-[0.8rem]">
              Product / User
            </TableHead>
            <TableHead className="font-normal py-2 text-[0.8rem]">
              Seat Usage
            </TableHead>
            <TableHead className="font-normal py-2 text-[0.8rem]">
              Region
            </TableHead>
            <TableHead className="font-normal py-2 text-[0.8rem]">
              Department
            </TableHead>
            <TableHead className="font-normal py-2 text-[0.8rem]">
              Cost Center
            </TableHead>
            <TableHead className="font-normal py-2 text-[0.8rem]">
              Business Group
            </TableHead>
            <TableHead className="font-normal py-2 text-[0.8rem]">
              Status
            </TableHead>
            <TableHead className="py-2" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={COLUMN_COUNT}
                className="h-24 text-center text-muted-foreground"
              >
                No products allocated to this contract.
              </TableCell>
            </TableRow>
          ) : (
            groups.map((group) => {
              const isOpen = expanded.has(group.productId);
              return (
                <React.Fragment key={group.productId}>
                  <TableRow
                    onClick={() => toggle(group.productId)}
                    className={cn(
                      'cursor-pointer font-sans',
                      isOpen && 'hover:bg-transparent',
                    )}
                  >
                    <TableCell className="py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(group.productId);
                        }}
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium line-clamp-1 text-sm">
                          {group.productName}
                        </span>
                        {group.hasInactiveUsers && (
                          <TooltipProvider>
                            <Tooltip delayDuration={0}>
                              <TooltipTrigger asChild>
                                <div className="h-2 w-2 rounded-full bg-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                Has inactive users
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="py-3 font-label text-sm tabular-nums">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-sm tabular-nums',
                          usageTextColor(group.usedCount, group.cap),
                        )}
                      >
                        {group.usedCount}
                      </Badge>
                      <span className="text-muted-foreground">
                        {group.cap != null && group.cap > 0
                          ? ' / ' + group.cap
                          : ''}
                      </span>
                    </TableCell>
                    <TableCell colSpan={COLUMN_COUNT - 2} className="py-3" />
                  </TableRow>
                  {isOpen && group.users.length === 0 && (
                    <TableRow className="bg-muted/30">
                      <TableCell
                        colSpan={COLUMN_COUNT}
                        className="py-3 pl-10 text-sm italic text-muted-foreground"
                      >
                        No users assigned.
                      </TableCell>
                    </TableRow>
                  )}
                  {isOpen &&
                    group.users.map((user) => {
                      const status = (user.status ??
                        'active') as EmployeeStatus;
                      return (
                        <TableRow
                          key={`${group.productId}-${user.id}`}
                          className={cn(
                            'font-sans',
                            status === 'inactive'
                              ? 'bg-muted/60 hover:bg-muted/70'
                              : 'bg-muted/30 hover:bg-muted/50',
                          )}
                        >
                          <TableCell className="py-1 pl-10">
                            <span
                              className={cn(
                                status === 'inactive' &&
                                  'text-muted-foreground',
                              )}
                            >
                              {user.name}
                            </span>
                          </TableCell>
                          <TableCell className="py-1" />
                          <TableCell className="py-1">{user.region}</TableCell>
                          <TableCell className="py-1">
                            {user.department}
                          </TableCell>
                          <TableCell className="py-1">
                            {user.cost_center}
                          </TableCell>
                          <TableCell className="py-1">
                            {user.businessGroup?.name}
                          </TableCell>
                          <TableCell className="py-1">
                            <Badge
                              variant={statusVariant(status)}
                              className="px-2 py-0 text-xs"
                            >
                              {statusLabel(status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1">
                            <div className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  asChild
                                  disabled={disabled}
                                >
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setViewUserId(user.id);
                                      setViewDialogOpen(true);
                                    }}
                                    disabled={disabled}
                                  >
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      resetEditErrors?.();
                                      setEditUserId(user.id);
                                      setEditDialogOpen(true);
                                    }}
                                    disabled={disabled}
                                  >
                                    Edit Details
                                  </DropdownMenuItem>
                                  {onReleaseUser && status === 'inactive' && (
                                    <DropdownMenuItem
                                      onClick={() => onReleaseUser(user.id)}
                                      disabled={disabled}
                                    >
                                      Release Seat
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => onDeleteUser(user.id)}
                                    disabled={disabled}
                                  >
                                    Remove
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </React.Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </>
  );
}
