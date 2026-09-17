'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UserManagementFormDialog } from '@/components/contracts/UserManagementFormDialog';
import { VendorProduct } from '@/constants/types';
import { FormErrors } from '@/app/hooks/useContractUsers';

type EditableUser = {
  id: number;
  name: string;
  email: string | null;
  product_id?: number | null;
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
  org_employee_id?: number | null;
};

export type EditUserDraft = {
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

function toDraft(user: EditableUser): EditUserDraft {
  return {
    name: user.name ?? '',
    email: user.email ?? '',
    product_id:
      user.product_id === null || user.product_id === undefined
        ? 'ALL_PRODUCTS'
        : String(user.product_id),
    employee_id: user.employee_id ?? '',
    region: user.region ?? '',
    country: user.country ?? '',
    division: user.division ?? '',
    department: user.department ?? '',
    cost_center: user.cost_center ?? '',
    entity: user.entity ?? '',
    business_unit: user.business_unit ?? '',
    team: user.team ?? '',
    business_group_node_id: user.businessGroup
      ? String(user.businessGroup.id)
      : '',
    start_date: user.start_date ?? '',
    leave_date: user.leave_date ?? '',
  };
}

interface EditContractUserDialogProps {
  user: EditableUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorProducts?: VendorProduct[];
  orgGroups?: Array<{ id: number; name: string }>;
  disabled?: boolean;
  isSaving?: boolean;
  errors?: FormErrors;
  onSave: (draft: EditUserDraft) => Promise<boolean> | boolean;
  onClearError?: (field: keyof FormErrors) => void;
}

export function EditContractUserDialog({
  user,
  open,
  onOpenChange,
  vendorProducts,
  orgGroups,
  disabled = false,
  isSaving = false,
  errors,
  onSave,
  onClearError,
}: EditContractUserDialogProps) {
  const [draft, setDraft] = React.useState<EditUserDraft>(() => toDraft(user));

  React.useEffect(() => {
    if (open) setDraft(toDraft(user));
  }, [open, user]);

  const formDisabled = disabled || isSaving;
  const mergedErrors: FormErrors = errors ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit User Details</DialogTitle>
        </DialogHeader>

        <UserManagementFormDialog
          loading={false}
          newUser={draft}
          setNewUser={setDraft}
          errors={mergedErrors}
          vendorProducts={vendorProducts}
          orgGroups={orgGroups}
          disabled={formDisabled}
          onClose={() => onOpenChange(false)}
          hideProductSelect={true}
          disableOrgEmployeeFields={user.org_employee_id == null}
          onAddUser={async () => {
            const ok = await onSave(draft);
            if (ok) onOpenChange(false);
          }}
          loadUsers={async () => {}}
          onClearError={onClearError}
        />
      </DialogContent>
    </Dialog>
  );
}
