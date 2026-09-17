'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmployeeDetailsBody } from '@/components/settings/EmployeeDetailsBody';

export type ContractUser = {
  id: number;
  name: string;
  email: string | null;
  vendor_products?: { id: number; name: string } | null;
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
};

interface ViewContractUserDialogProps {
  user: ContractUser;
  triggerLabel?: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onEdit?: () => void;
}

export function ViewContractUserDialog({
  user,
  triggerLabel = 'View',
  disabled = false,
  open,
  onOpenChange,
  onEdit,
}: ViewContractUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open === undefined && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" disabled={disabled}>
            {triggerLabel}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>User details</DialogTitle>
        </DialogHeader>

        <EmployeeDetailsBody
          values={{
            name: user.name,
            email: user.email,
            employee_id: user.employee_id,
            region: user.region,
            country: user.country,
            division: user.division,
            department: user.department,
            cost_center: user.cost_center,
            entity: user.entity,
            business_unit: user.business_unit,
            team: user.team,
            group_name: user.businessGroup?.name,
            start_date: user.start_date,
            leave_date: user.leave_date,
          }}
          badge={
            <Badge variant="secondary" className="text-sm">
              {user.vendor_products?.name ?? 'All Products'}
            </Badge>
          }
          onEdit={onEdit}
        />
      </DialogContent>
    </Dialog>
  );
}
