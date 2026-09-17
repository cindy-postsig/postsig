'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { getCountryName } from '@/constants/countries';
import { useDateFormat } from '@/hooks/useDateFormat';

export interface EmployeeDetailsValues {
  name: string;
  email?: string | null;
  employee_id?: string | null;
  region?: string | null;
  country?: string | null;
  division?: string | null;
  department?: string | null;
  cost_center?: string | null;
  business_unit?: string | null;
  entity?: string | null;
  team?: string | null;
  group_name?: string | null;
  start_date?: string | null;
  leave_date?: string | null;
}

interface EmployeeDetailsBodyProps {
  values: EmployeeDetailsValues;
  badge: ReactNode;
  onEdit?: () => void;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b px-1 py-2 last:border-b-0">
      <p className="font-label text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="col-span-2 break-words font-sans-neue text-sm leading-tight">
        {value && value.trim() !== '' ? (
          value
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </p>
    </div>
  );
}

export function EmployeeDetailsBody({
  values,
  badge,
  onEdit,
}: EmployeeDetailsBodyProps) {
  const { formatDate } = useDateFormat();
  const countryName = values.country
    ? (getCountryName(values.country) ?? values.country)
    : null;

  return (
    <>
      <div className="min-w-0 pb-4 pr-8">
        <h3 className="font-medium break-words text-xl leading-tight">
          {values.name}
        </h3>
        {values.email && (
          <p className="break-words text-sm text-muted-foreground">
            {values.email}
          </p>
        )}
        <div className="mt-3">{badge}</div>
      </div>

      <div>
        <Field label="Employee ID" value={values.employee_id} />
        <Field label="Country" value={countryName} />
        <Field label="Region" value={values.region} />
        <Field label="Entity" value={values.entity} />
        <Field label="Business Group" value={values.group_name} />
        <Field label="Division" value={values.division} />
        <Field label="Business Unit" value={values.business_unit} />
        <Field label="Department" value={values.department} />
        <Field label="Team" value={values.team} />
        <Field label="Cost Center" value={values.cost_center} />
        <Field
          label="Start Date"
          value={
            values.start_date
              ? formatDate(values.start_date, '')
              : values.start_date
          }
        />
        <Field
          label="Leave Date"
          value={
            values.leave_date
              ? formatDate(values.leave_date, '')
              : values.leave_date
          }
        />
      </div>

      {onEdit && (
        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Edit
          </Button>
        </div>
      )}
    </>
  );
}
