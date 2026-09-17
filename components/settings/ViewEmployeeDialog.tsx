'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EmployeeDetailsBody } from '@/components/settings/EmployeeDetailsBody';
import type { OrgEmployee } from '@/constants/types';

interface ViewEmployeeDialogProps {
  employee: OrgEmployee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
}

const statusVariant = (status: string) => {
  switch (status) {
    case 'active':
      return 'secondary' as const;
    default:
      return 'outline' as const;
  }
};

const statusLabel = (status: string) => {
  if (status === 'on_leave') return 'On Leave';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

export function ViewEmployeeDialog({
  employee,
  open,
  onOpenChange,
  onEdit,
}: ViewEmployeeDialogProps) {
  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Employee details</DialogTitle>
        </DialogHeader>

        <EmployeeDetailsBody
          values={{
            name: `${employee.first_name} ${employee.last_name}`,
            email: employee.email,
            employee_id: employee.employee_id,
            region: employee.region,
            country: employee.country,
            division: employee.division,
            department: employee.department,
            cost_center: employee.cost_center,
            business_unit: employee.business_unit,
            entity: employee.entity,
            team: employee.team,
            group_name: employee.businessGroup?.name,
            start_date: employee.start_date,
            leave_date: employee.leave_date,
          }}
          badge={
            <Badge
              variant={statusVariant(employee.status)}
              className="whitespace-nowrap px-2 py-0 text-xs"
            >
              {statusLabel(employee.status)}
            </Badge>
          }
          onEdit={onEdit}
        />
      </DialogContent>
    </Dialog>
  );
}
