'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import ExportActiveUsersCSVButton from './ExportActiveUsersCSVButton';
import UploadActiveUsersCSVButton from './UploadActiveUsersCSVButton';
import ContractUsersTable from './ContractUsersTable';
import { EditUserDraft } from './EditContractUserDialog';
import { VendorProduct } from '@/constants/types';
import { User, FormErrors } from '@/app/hooks/useContractUsers';
import { useAbility } from '@/components/providers/AbilityProvider';

interface UserManagementFormProps {
  contractId: number;
  users: User[];
  loading: boolean;
  newUser: {
    name: string;
    email: string;
    product_id: string;
    employee_id: string;
    region: string;
    country: string;
    division: string;
    department: string;
    cost_center: string;
    entity: string;
    business_unit: string;
    team: string;
    business_group_node_id: string;
    start_date: string;
    leave_date: string;
  };
  setNewUser: React.Dispatch<
    React.SetStateAction<UserManagementFormProps['newUser']>
  >;
  errors: FormErrors;
  onAddUser: () => void;
  onDeleteUser: (userId: number) => void;
  loadUsers: () => Promise<void>;
  vendorProducts?: VendorProduct[];
  orgGroups?: Array<{ id: number; name: string }>;
  disabled?: boolean;
  showImport?: boolean;
  hideProductSelect?: boolean;
  defaultProductId?: number;
  hideHeader?: boolean;
  hideAddForm?: boolean;
  showViewEdit?: boolean;
  onEditUser?: (userId: number, draft: EditUserDraft) => Promise<boolean>;
  isUpdatingUser?: boolean;
  editErrors?: FormErrors;
  resetEditErrors?: () => void;
  clearEditFieldError?: (field: keyof FormErrors) => void;
}

export function UserManagementForm({
  contractId,
  users,
  loading,
  newUser,
  setNewUser,
  errors,
  onAddUser,
  onDeleteUser,
  loadUsers,
  vendorProducts = [],
  orgGroups = [],
  disabled = false,
  showImport = true,
  hideProductSelect = false,
  defaultProductId,
  hideHeader = false,
  hideAddForm = false,
  showViewEdit = false,
  onEditUser,
  isUpdatingUser = false,
  editErrors,
  resetEditErrors,
  clearEditFieldError,
}: UserManagementFormProps) {
  const ability = useAbility();
  const canManageUsers = ability.can('manage', 'ContractUser');
  const hasVendorProducts = vendorProducts && vendorProducts.length > 0;
  const formDisabled =
    disabled || !canManageUsers || (!hasVendorProducts && !hideProductSelect);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[...Array(1)].map((_, i) => (
          <div key={i} className="h-10 rounded-sm bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Export/Import buttons */}
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-sm">Manage Users</h4>
          <div className="flex items-center gap-2">
            {showImport && !formDisabled && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="xs">
                    Import Users
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl">
                  <DialogHeader>
                    <div className="flex items-center justify-between">
                      <DialogTitle>Import Users</DialogTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="mr-6"
                      >
                        <a
                          href="/templates/sample_import_users.csv"
                          download="sample_import_users.csv"
                        >
                          Download Sample CSV
                        </a>
                      </Button>
                    </div>
                  </DialogHeader>
                  <UploadActiveUsersCSVButton
                    id={contractId}
                    initialUsers={users}
                    vendorProducts={vendorProducts}
                    loadUsers={loadUsers}
                    onClose={() => {}}
                    defaultProductId={defaultProductId}
                    orgGroups={orgGroups || []}
                  />
                </DialogContent>
              </Dialog>
            )}

            {users.length > 0 && (
              <ExportActiveUsersCSVButton
                id={contractId}
                users={users.map((user) => ({
                  name: user.name,
                  email: user.email ?? '',
                  product: user.vendor_products?.name,
                }))}
                size="xs"
              />
            )}
          </div>
        </div>
      )}

      {/* Add User Form */}
      {!hideAddForm && (
        <div className="flex items-start gap-2">
          <div className={hideProductSelect ? 'flex-1' : 'flex-1'}>
            <Input
              placeholder="Name"
              value={newUser.name}
              onChange={(e) =>
                setNewUser((prev) => ({ ...prev, name: e.target.value }))
              }
              className={`h-8 text-sm ${errors.name ? 'border-pink-600' : ''}`}
              disabled={formDisabled}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-pink-600">{errors.name}</p>
            )}
          </div>
          <div className={hideProductSelect ? 'flex-1' : 'flex-1'}>
            <Input
              placeholder="Email"
              value={newUser.email}
              onChange={(e) =>
                setNewUser((prev) => ({ ...prev, email: e.target.value }))
              }
              className={`h-8 text-sm ${errors.email ? 'border-pink-600' : ''}`}
              disabled={formDisabled}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-pink-600">{errors.email}</p>
            )}
          </div>
          {/* No business-group select: this form adds unlinked contract_users
              seats, which cannot carry one now that membership lives on the
              org-unit path — only the assign-employee flow does. */}
          {!hideProductSelect && (
            <div className="flex flex-1 gap-2">
              <Select
                value={newUser.product_id}
                onValueChange={(value) =>
                  setNewUser((prev) => ({ ...prev, product_id: value }))
                }
                disabled={formDisabled}
                defaultValue="ALL_PRODUCTS"
              >
                <SelectTrigger
                  className={`h-8 text-sm ${errors.product_id ? 'border-pink-600' : ''}`}
                >
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Select a product</SelectLabel>
                    <SelectSeparator />
                    <SelectItem value="ALL_PRODUCTS">All Products</SelectItem>
                    <SelectSeparator />
                    {Array.from(new Set(vendorProducts.map((p) => p.id)))
                      .map((id) => vendorProducts.find((p) => p.id === id))
                      .filter((p): p is VendorProduct => p !== undefined)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((product) => (
                        <SelectItem
                          key={product.id}
                          value={product.id.toString()}
                        >
                          {product.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={onAddUser}
                className="h-8 whitespace-nowrap px-3 text-sm"
                disabled={formDisabled}
              >
                Add
              </Button>
            </div>
          )}
          {hideProductSelect && (
            <Button
              size="sm"
              onClick={onAddUser}
              className="h-8 whitespace-nowrap px-3 text-sm"
              disabled={formDisabled}
            >
              Add
            </Button>
          )}
        </div>
      )}
      {!hideAddForm && !hideProductSelect && errors.product_id && (
        <p className="text-xs text-pink-600">{errors.product_id}</p>
      )}

      {/* Users Table */}
      {users.length > 0 && (
        <div className="mt-4">
          <ContractUsersTable
            users={users}
            onDeleteUser={onDeleteUser}
            disabled={formDisabled}
            orgGroups={orgGroups}
            hideProductColumn={hideProductSelect}
            showViewEdit={showViewEdit}
            onEditUser={onEditUser}
            isUpdatingUser={isUpdatingUser}
            editErrors={editErrors}
            resetEditErrors={resetEditErrors}
            clearEditFieldError={clearEditFieldError}
          />
        </div>
      )}

      {formDisabled && (
        <p className="font-label text-sm text-muted-foreground">
          {!hasVendorProducts && !hideProductSelect
            ? 'Active Users can only be added for existing products.'
            : 'You do not have permission to manage active users.'}
        </p>
      )}
    </div>
  );
}
