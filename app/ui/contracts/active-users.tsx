import { useMemo, useState, useContext } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
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
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import ExportActiveUsersCSVButton from '@/components/contracts/ExportActiveUsersCSVButton';
import { VendorProduct, VendorProductUser } from '@/constants/types';
import { useContractUsers } from '@/app/hooks/useContractUsers';
import { useAbility } from '@/components/providers/AbilityProvider';
import { EmployeeAssignmentDialog } from '@/components/contracts/EmployeeAssignmentDialog';
import ContractUsersByProductTable from '@/components/contracts/ContractUsersByProductTable';
import { getCountryName } from '@/constants/countries';
import { UserContext } from '@/app/userProvider';

const bannerButtonClasses =
  'border-amber-600/40 text-amber-800 hover:bg-amber-500/10 hover:text-amber-900 dark:border-amber-400/40 dark:text-amber-200 dark:hover:bg-amber-400/10 dark:hover:text-amber-100';

export function ActiveUsers({
  contract,
  orgGroups,
  disabled = false,
  contractUsers,
}: {
  contract: {
    id: number;
    vendor_products_users?: VendorProductUser[];
    vendor_products?: VendorProduct[];
  };
  orgGroups?: Array<{ id: number; name: string }>;
  disabled?: boolean;
  contractUsers: ReturnType<typeof useContractUsers>;
}) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isReleaseDialogOpen, setIsReleaseDialogOpen] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const ability = useAbility();
  const canManageUsers = ability.can('manage', 'ContractUser');
  const userContext = useContext(UserContext);
  const organizationId = userContext?.userMetadata?.organizationId ?? '';

  const {
    users,
    loading,
    isAddingUser,
    isUpdatingUser,
    errors,
    resetForm,
    resetErrors,
    clearFieldError,
    handleAssignEmployees,
    handleUpdateUser,
    handleDeleteUser,
    handleReleaseUser,
    handleReleaseUsers,
  } = contractUsers;

  const inactiveUsers = useMemo(
    () => users.filter((u) => u.status === 'inactive'),
    [users],
  );

  const hasVendorProducts =
    contract.vendor_products && contract.vendor_products.length > 0;

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <CardTitle className="flex h-8">Active Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(1)].map((_, i) => (
              <div
                key={i}
                className="text-foreground-muted flex h-10 items-center justify-center rounded-sm bg-muted text-sm"
              >
                Loading users...
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const formDisabled = disabled || !canManageUsers || !hasVendorProducts;

  const handleCloseDialog = () => {
    resetForm();
    setIsDialogOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row justify-between">
        <CardTitle className="flex gap-2">Active Users</CardTitle>
        <div className="flex items-center gap-2">
          {!formDisabled && (
            <>
              <Dialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                  if (!open) handleCloseDialog();
                  setIsDialogOpen(open);
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm">Assign Users</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Assign Users</DialogTitle>
                  </DialogHeader>
                  <EmployeeAssignmentDialog
                    organizationId={organizationId}
                    vendorProducts={contract.vendor_products}
                    orgGroups={orgGroups}
                    onAssign={handleAssignEmployees}
                    onClose={handleCloseDialog}
                    disabled={disabled || isAddingUser}
                    existingUserEmails={users
                      .map((u) => u.email)
                      .filter((e): e is string => !!e)}
                    existingOrgEmployeeIds={users
                      .map((u) => u.org_employee_id)
                      .filter((id): id is number => id != null)}
                  />
                </DialogContent>
              </Dialog>
            </>
          )}

          {users.length > 0 && (
            <ExportActiveUsersCSVButton
              id={contract.id}
              size="sm"
              users={users.map((user) => ({
                name: user.name,
                email: user.email ?? '',
                product: user.vendor_products?.name,
                employee_id: user.employee_id ?? '',
                region: user.region ?? '',
                country: user.country
                  ? (getCountryName(user.country) ?? user.country)
                  : '',
                division: user.division ?? '',
                department: user.department ?? '',
                cost_center: user.cost_center ?? '',
                business_group: user.businessGroup?.name,
                start_date: user.start_date ?? '',
                leave_date: user.leave_date ?? '',
              }))}
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        {inactiveUsers.length > 0 && !formDisabled && (
          <Alert
            variant="warning"
            className="mb-4 flex flex-wrap items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
              {inactiveUsers.length === 1
                ? '1 seat is held by an employee who has left the company.'
                : `${inactiveUsers.length} seats are held by employees who have left the company.`}
            </span>
            <Button
              size="sm"
              variant="outline"
              className={bannerButtonClasses}
              onClick={() => setIsReleaseDialogOpen(true)}
            >
              Release {inactiveUsers.length} Seat
              {inactiveUsers.length > 1 ? 's' : ''}
            </Button>
          </Alert>
        )}
        <AlertDialog
          open={isReleaseDialogOpen}
          onOpenChange={(open) => {
            if (!isReleasing) setIsReleaseDialogOpen(open);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Release {inactiveUsers.length} seat
                {inactiveUsers.length > 1 ? 's' : ''}?
              </AlertDialogTitle>
            </AlertDialogHeader>
            <Table stickyHeader scrollClassName="max-h-96 rounded-md border">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2">Name</TableHead>
                  <TableHead className="px-2">Email</TableHead>
                  <TableHead className="px-2">Product</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inactiveUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="max-w-40 truncate px-2 py-1.5">
                      {user.name}
                    </TableCell>
                    <TableCell className="text-foreground-muted max-w-48 truncate px-2 py-1.5">
                      {user.email}
                    </TableCell>
                    <TableCell className="text-foreground-muted max-w-48 truncate px-2 py-1.5">
                      {user.vendor_products?.name}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <AlertDialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsReleaseDialogOpen(false)}
                disabled={isReleasing}
              >
                Cancel
              </Button>
              <Button
                disabled={isReleasing}
                onClick={async () => {
                  setIsReleasing(true);
                  try {
                    const released = await handleReleaseUsers(
                      inactiveUsers.map((u) => u.id),
                    );
                    if (released) setIsReleaseDialogOpen(false);
                  } finally {
                    setIsReleasing(false);
                  }
                }}
              >
                {isReleasing
                  ? 'Releasing...'
                  : `Release ${inactiveUsers.length} Seat${inactiveUsers.length > 1 ? 's' : ''}`}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <ContractUsersByProductTable
          users={users}
          vendorProductsUsers={contract.vendor_products_users ?? []}
          onDeleteUser={handleDeleteUser}
          onReleaseUser={handleReleaseUser}
          disabled={formDisabled}
          vendorProducts={contract.vendor_products}
          orgGroups={orgGroups}
          onEditUser={(userId, draft) => handleUpdateUser(userId, draft)}
          isUpdatingUser={isUpdatingUser}
          editErrors={errors}
          resetEditErrors={resetErrors}
          clearEditFieldError={clearFieldError}
        />
      </CardContent>
    </Card>
  );
}
