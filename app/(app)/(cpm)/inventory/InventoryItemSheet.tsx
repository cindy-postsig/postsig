'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import VendorIcon from '@/components/vendors/VendorIcon';
import { formatCurrency, getDaysUntilDate } from '@/app/lib/utils';
import { InventoryItem } from './columns';
import { formatDate, DATE_FORMAT_DEFAULT } from '@/lib/date-format';
import { AmendmentIndicator } from '@/components/ui/amendment-indicator';
import ExportActiveUsersCSVButton from '@/components/contracts/ExportActiveUsersCSVButton';
import { Alert } from '@/components/ui/alert';
import { UserManagementForm } from '@/components/contracts/UserManagementForm';
import { EmployeeAssignmentDialog } from '@/components/contracts/EmployeeAssignmentDialog';
import { useContractUsers } from '@/app/hooks/useContractUsers';
import { getProductYearLabel } from '@/app/lib/budget';
import { useAbility } from '@/components/providers/AbilityProvider';
import CostAllocationTab from '@/components/contracts/cost-allocation/CostAllocationTab';
import { getCountryName } from '@/constants/countries';
import { useOrgBusinessGroups } from '@/hooks/api/useOrgGroups';

interface InventoryItemSheetProps {
  item: InventoryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onDataChange?: () => void;
  userMetadata?: any;
  costAllocationEnabled?: boolean;
}

// Generate alerts based on item data (same logic as the table columns)
const getItemAlerts = (item: InventoryItem) => {
  const alerts = [];
  const alertRange = 90; // This should match the alert range used in columns

  // Check for nearing renewal date (end date approaching)
  if (item.endDate && item.status === 'Active') {
    const daysDifference = getDaysUntilDate(item.endDate);

    if (daysDifference <= alertRange && daysDifference > 0) {
      alerts.push({
        type: 'Renewal Approaching',
        message: `Contract expires in ${daysDifference} days`,
        severity: 'warning' as const,
      });
    }
  }

  // Check for low utilization (below 50% when there are assigned users)
  // Skip for enterprise-licensed products (no seat-based tracking)
  if (
    !item.enterprise &&
    item.activeUsers.length > 0 &&
    item.licensesCount > 0
  ) {
    const utilization = (item.activeUsers.length / item.licensesCount) * 100;
    if (utilization < 50) {
      alerts.push({
        type: 'Low Utilization',
        message: `Low Utilization: ${item.activeUsers.length}/${item.licensesCount} seats used (${Math.round(utilization)}%)`,
        severity: 'warning' as const,
      });
    }
  }

  return alerts;
};

export function InventoryItemSheet({
  item,
  isOpen,
  onClose,
  onDataChange,
  userMetadata,
  costAllocationEnabled = false,
}: InventoryItemSheetProps) {
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  // Radix locks scrolling to the sheet's own subtree, so the target picker's
  // popover has to portal in here rather than into the body.
  const [sheetNode, setSheetNode] = useState<HTMLDivElement | null>(null);
  const ability = useAbility();
  // Inventory fees arrive already converted (the item's own currency field is
  // the conversion target), so every amount here reads in the org base.
  const dateFormat = userMetadata?.dateFormat ?? DATE_FORMAT_DEFAULT;

  // Extract contract ID and product ID (with fallbacks for when item is null)
  const contractId = Number(
    item?.contractId || item?.id.split('-product-')[0] || 0,
  );
  const productId = item?.product_id || 1;

  // Load hook for management operations and updated user data
  const {
    users: allUsers,
    loading,
    isAddingUser,
    isUpdatingUser,
    newUser,
    setNewUser,
    errors,
    resetForm,
    resetErrors,
    clearFieldError,
    handleAddUser,
    handleAssignEmployees,
    handleDeleteUser,
    handleUpdateUser,
    loadUsers,
  } = useContractUsers(contractId, [], productId, true, !!item);
  const orgGroupsQuery = useOrgBusinessGroups(
    userMetadata?.organizationId ?? '',
  );
  const orgGroups = orgGroupsQuery.data?.groups ?? [];

  // The sheet is reused for every row, so a new item lands on Overview rather
  // than on whichever tab the previous one was left on.
  useEffect(() => setActiveTab('overview'), [item?.id]);

  // Early return after hooks
  if (!item) return null;

  const alerts = getItemAlerts(item);

  // Get users from hook (after management operations)
  const hookUsers = allUsers.filter((user) => user.product_id === productId);

  // Prepare server data with compatible structure
  const serverUsers = (item.activeUsers || []).map((user) => ({
    ...user,
    contract_id: contractId,
    created_at: '',
    updated_at: null,
    vendor_products: null,
    status: 'active' as const,
  }));

  // Use hook data only when it has actual users, otherwise use server data
  const users = hookUsers.length > 0 ? hookUsers : serverUsers;

  const userCount = users.length;

  // Check if user management should be disabled using CASL permissions
  const canManageUsers = ability.can('manage', 'ContractUser');
  const isUserManagementDisabled = !canManageUsers;

  // Custom loadUsers function that also refreshes inventory data
  const handleLoadUsers = async () => {
    await loadUsers();
    // Refresh the entire page to get updated data
    onDataChange?.();
  };

  const overview = (
    <div className="mt-6 space-y-4">
      {/* Open Alerts */}
      {alerts.map((alert, index) => (
        <Alert
          key={index}
          variant={'warning'}
          className="flex items-center gap-2 p-2"
        >
          <div className="mb-[1px] h-1.5 w-1.5 rounded-full bg-amber-500" />
          <p className="text-xs">{alert.message}</p>
        </Alert>
      ))}

      {/* Status & Key Info */}
      <Card>
        <CardContent className="mt-6 space-y-4">
          <div className="flex h-24 gap-6">
            {/* License Count - Square box */}
            <div className="flex h-24 flex-shrink-0 flex-col items-center justify-center border-r pl-6 pr-10">
              <p className="flex items-center gap-0.5 text-2xl">
                {item.enterprise
                  ? ''
                  : item.licensesCount === 0
                    ? '-'
                    : item.licensesCount}
                {!item.enterprise && item.amendments?.licensesCount && (
                  <AmendmentIndicator
                    amendment={item.amendments.licensesCount}
                    fieldLabel="Licenses"
                    formatOriginal={(v) => String(v || '-')}
                  />
                )}
              </p>
              <p className="font-medium my-1 font-label text-sm leading-tight">
                {item.enterprise ? 'Enterprise' : 'Licenses'}
              </p>
            </div>

            {/* Data grid - fills remaining space */}
            <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-4">
              {/* Top row: Annual Cost and Annual Increase */}
              <div>
                <p className="font-bold font-label text-xs uppercase tracking-wide">
                  Annual Cost
                </p>
                <p className="flex items-center gap-0.5 font-serif">
                  {/* One product on one contract: unconverted, in the
                          fee-source contract's currency (PSK-1796). */}
                  {formatCurrency(item.costNative, item.currency)}
                  {item.amendments?.cost && (
                    <AmendmentIndicator
                      amendment={item.amendments.cost}
                      fieldLabel="Annual cost"
                      formatOriginal={(v) =>
                        formatCurrency(v.amount, v.currency) || '-'
                      }
                    />
                  )}
                </p>
              </div>
              <div>
                <p className="font-bold font-label text-xs uppercase tracking-wide">
                  Annual Increase
                </p>
                <p className="flex items-center gap-0.5 font-serif">
                  {item.annualIncrease && item.annualIncrease > 0 ? (
                    `${item.annualIncrease}%`
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                  {item.amendments?.annualIncrease && (
                    <AmendmentIndicator
                      amendment={item.amendments.annualIncrease}
                      fieldLabel="Annual increase"
                      formatOriginal={(v) => (v && v > 0 ? `${v}%` : '-')}
                    />
                  )}
                </p>
              </div>

              {/* Bottom row: Start Date and End Date */}
              <div>
                <p className="font-bold font-label text-xs uppercase tracking-wide">
                  Start Date
                </p>
                <p className="flex items-center gap-0.5 font-serif">
                  {item.startDate ? (
                    formatDate(item.startDate, dateFormat)
                  ) : (
                    <span className="text-muted-foreground">N/A</span>
                  )}
                  {item.amendments?.startDate && (
                    <AmendmentIndicator
                      amendment={item.amendments.startDate}
                      fieldLabel="Start date"
                      formatOriginal={(v) =>
                        v ? formatDate(v, dateFormat) : 'N/A'
                      }
                    />
                  )}
                </p>
              </div>
              <div>
                <p className="font-bold font-label text-xs uppercase tracking-wide">
                  End Date
                </p>
                <p className="flex items-center gap-0.5 font-serif">
                  {item.endDate ? (
                    formatDate(item.endDate, dateFormat)
                  ) : (
                    <span className="text-muted-foreground">N/A</span>
                  )}
                  {item.amendments?.endDate && (
                    <AmendmentIndicator
                      amendment={item.amendments.endDate}
                      fieldLabel="End date"
                      formatOriginal={(v) =>
                        v ? formatDate(v, dateFormat) : 'N/A'
                      }
                    />
                  )}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Linked Contract */}
      <Card>
        <CardHeader>
          <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
            Linked Contract
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href={`/contracts/${contractId}`}
            className="font-medium flex w-full items-center justify-between rounded-sm border px-3 py-2 text-sm transition-colors hover:bg-secondary/25"
          >
            <span>{item.contractType || 'View Contract'}</span>
            <span>&rarr;</span>
          </Link>
        </CardContent>
      </Card>

      {/* Current Term Fees */}
      {item.currentTermProducts &&
        item.currentTermProducts.sortedYears.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
                Current Term Fees ({item.currency})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {item.currentTermProducts.sortedYears
                .filter((year) =>
                  item.currentTermProducts?.productsByYear[year]?.some(
                    (product) => product.product_id === productId,
                  ),
                )
                .map((year) => (
                  <div
                    key={year}
                    className="my-1 flex border-t border-t-foreground/10 pt-1 first:border-t-0"
                  >
                    {item.currentTermProducts?.hasValidTermDate && (
                      <div className="mr-2 flex w-auto shrink-0 items-center justify-between border-r pr-3">
                        <p className="font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                          {getProductYearLabel(
                            parseInt(year, 10),
                            item.currentTermProducts?.termStartDate || [],
                            item.currentTermProducts?.fiscalYearStartMonth || 1,
                          )}
                        </p>
                      </div>
                    )}
                    <div
                      className={
                        item.currentTermProducts?.hasValidTermDate
                          ? 'flex-1'
                          : 'w-full'
                      }
                    >
                      {item.currentTermProducts?.productsByYear[year]
                        ?.filter((product) => product.product_id === productId)
                        ?.map((product, index) => (
                          <div
                            key={index}
                            className="flex justify-between gap-2 px-1 font-label leading-snug"
                          >
                            <div className="font-sans text-[.9rem] tracking-[0.02rem]">
                              {product.vendor_products.name}
                            </div>
                            <div className="flex items-center gap-0.5 font-label text-sm">
                              {/* Recorded product fees are native amounts;
                                      the base symbol would mislabel them
                                      (PSK-1796). */}
                              {formatCurrency(
                                product.compoundedFee,
                                item.currency,
                              )}
                              {product.originalFees !== undefined &&
                                item.pricingSourceContractId && (
                                  <AmendmentIndicator
                                    amendment={{
                                      original: product.originalFees,
                                      amendedBy: {
                                        contractId:
                                          item.pricingSourceContractId,
                                        contractType:
                                          item.pricingSourceContractType,
                                      },
                                    }}
                                    fieldLabel="Fee"
                                    formatOriginal={(v) =>
                                      formatCurrency(v, item.currency) || '-'
                                    }
                                  />
                                )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        )}

      {/* Active Users */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
          <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
            Active Users ({userCount})
          </CardTitle>
          <div className="flex items-center gap-2">
            {!isUserManagementDisabled && (
              <>
                <Dialog
                  open={isAddUserDialogOpen}
                  onOpenChange={(open) => {
                    if (!open) resetForm();
                    setIsAddUserDialogOpen(open);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button size="xs">Assign Users</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Assign Users</DialogTitle>
                    </DialogHeader>
                    <EmployeeAssignmentDialog
                      organizationId={userMetadata?.organizationId ?? ''}
                      hideProductSelect={true}
                      defaultProductId={productId}
                      orgGroups={orgGroups}
                      onAssign={async (params) => {
                        const ok = await handleAssignEmployees(params);
                        if (ok) onDataChange?.();
                        return ok;
                      }}
                      onClose={() => {
                        resetForm();
                        setIsAddUserDialogOpen(false);
                      }}
                      disabled={isAddingUser}
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
                id={contractId}
                users={users.map((user) => ({
                  name: user.name,
                  email: user.email ?? '',
                  product: Array.isArray(item.productName)
                    ? item.productName.join(', ')
                    : item.productName,
                  employee_id: user.employee_id ?? '',
                  region: user.region ?? '',
                  country: user.country
                    ? (getCountryName(user.country) ?? user.country)
                    : '',
                  division: user.division ?? '',
                  department: user.department ?? '',
                  cost_center: user.cost_center ?? '',
                  entity: user.entity ?? '',
                  business_unit: user.business_unit ?? '',
                  team: user.team ?? '',
                  business_group: user.businessGroup?.name,
                  start_date: user.start_date ?? '',
                  leave_date: user.leave_date ?? '',
                }))}
                size="xs"
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <UserManagementForm
            contractId={contractId}
            users={users}
            loading={
              loading && hookUsers.length === 0 && serverUsers.length === 0
            }
            newUser={newUser}
            setNewUser={setNewUser}
            errors={errors}
            onAddUser={async (...args) => {
              await handleAddUser(...args);
              onDataChange?.();
            }}
            onDeleteUser={async (...args) => {
              await handleDeleteUser(...args);
              onDataChange?.();
            }}
            loadUsers={async () => {
              await loadUsers();
              onDataChange?.();
            }}
            vendorProducts={[]}
            disabled={isUserManagementDisabled}
            showImport={false}
            hideProductSelect={true}
            defaultProductId={productId}
            hideHeader={true}
            hideAddForm={true}
            orgGroups={orgGroups}
            showViewEdit={true}
            isUpdatingUser={isUpdatingUser}
            editErrors={errors}
            resetEditErrors={resetErrors}
            clearEditFieldError={clearFieldError}
            onEditUser={async (userId, draft) => {
              const ok = await handleUpdateUser(userId, draft);
              if (ok) onDataChange?.();
              return ok;
            }}
          />
        </CardContent>
      </Card>

      {/* Delivery Methods */}
      <Card>
        <CardHeader>
          <CardTitle className="font-bold flex items-center gap-0.5 font-label text-xs uppercase tracking-wide">
            Delivery Methods
            {item.amendments?.deliveryMethods && (
              <AmendmentIndicator
                amendment={item.amendments.deliveryMethods}
                fieldLabel="Delivery methods"
                formatOriginal={(v) =>
                  v && v.length > 0 ? v.join(', ') : 'None'
                }
              />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {item.deliveryMethods.length > 0 ? (
              item.deliveryMethods.map((method, index) => (
                <Badge key={index} variant="outline">
                  {method}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No delivery methods.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Business Sponsor */}
      <Card>
        <CardHeader>
          <CardTitle className="font-bold font-label text-xs uppercase tracking-wide">
            Business Sponsor
          </CardTitle>
        </CardHeader>
        <CardContent>
          {item.businessSponsor && item.businessSponsor.length > 0 ? (
            <div className="font-serif">
              {Array.isArray(item.businessSponsor)
                ? item.businessSponsor.join(', ')
                : item.businessSponsor}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No business sponsor.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        ref={setSheetNode}
        className="w-[600px] overflow-y-auto sm:max-w-[600px]"
      >
        <SheetHeader className="space-y-2 py-2">
          <SheetTitle className="font-medium flex items-center gap-2 text-left leading-none">
            {item.productName}{' '}
            <Badge
              className="h-5 px-2"
              variant={item.status === 'Active' ? 'secondary' : 'outline'}
            >
              {item.status}
            </Badge>
          </SheetTitle>
          {/* asChild: the vendor icon is a block, which a <p> cannot contain. */}
          <SheetDescription asChild>
            <div className="flex items-center gap-[6px] text-xs text-foreground">
              {item.vendorId ? (
                <Link
                  href={`/vendors/${item.vendorId}`}
                  className="flex items-center gap-[6px] hover:opacity-80"
                >
                  <VendorIcon
                    name={item.vendor}
                    domain={item.vendorDomain}
                    width={18}
                    height={18}
                  />
                  {item.vendor}
                </Link>
              ) : (
                <>
                  <VendorIcon
                    name={item.vendor}
                    domain={item.vendorDomain}
                    width={18}
                    height={18}
                  />
                  {item.vendor}
                </>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        {costAllocationEnabled ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
            <TabsList className="w-full justify-start border-b">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="cost-allocation">Cost Allocation</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">{overview}</TabsContent>
            <TabsContent value="cost-allocation">
              <CostAllocationTab
                contractId={contractId}
                canEdit={ability.can('manage', 'Organization')}
                pickerContainer={sheetNode}
              />
            </TabsContent>
          </Tabs>
        ) : (
          overview
        )}
      </SheetContent>
    </Sheet>
  );
}
