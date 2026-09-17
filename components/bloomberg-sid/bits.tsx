'use client';

import type { ReactNode } from 'react';
import { formatCurrency } from '@/app/lib/utils';
import { Button } from '@/components/ui/button';
import { useDateFormat } from '@/hooks/useDateFormat';
import {
  cancelByDate,
  isWithinDaysOfToday,
} from '@/lib/v2/bloomberg-sid/transforms';

export const usd = (value: number) => formatCurrency(value, 'USD');

// The size ColumnHeader renders sortable headers at. Plain headers inherit
// the thead's smaller default, so a table mixing the two shows two sizes;
// the cost-allocation tables set the same override.
export const TABLE_HEADER_CLASS = 'text-[0.75rem] 3xl:text-[0.8rem]';

export function DateCell({ value }: { value: string | Date }) {
  const { formatDate } = useDateFormat();
  return <span className="text-muted-foreground">{formatDate(value)}</span>;
}

export function CancelByCell({ renewalDate }: { renewalDate: string }) {
  const { formatDate } = useDateFormat();
  const date = cancelByDate(renewalDate);
  const warning = isWithinDaysOfToday(date, 30);
  return (
    <span
      className={warning ? 'font-medium text-red-600' : 'text-muted-foreground'}
    >
      {formatDate(date)}
    </span>
  );
}

export function hasActiveFilters<T extends object>(
  filters: T,
  defaults: T,
): boolean {
  return (Object.keys(defaults) as Array<keyof T>).some(
    (key) => filters[key] !== defaults[key],
  );
}

export function ClearFiltersButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  if (!active) return null;
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      Reset
    </Button>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium text-sm">{value}</dd>
    </>
  );
}

export function PriceCell({
  amount,
  masked,
}: {
  amount: number | null;
  masked: boolean;
}) {
  if (masked) {
    return (
      <span className="font-medium text-xs text-amber-700">
        *** Masked / requires price
      </span>
    );
  }
  return <span className="font-mono">{amount != null ? usd(amount) : ''}</span>;
}
