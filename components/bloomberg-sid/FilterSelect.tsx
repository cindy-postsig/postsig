'use client';

import { useId } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface FilterOption {
  value: string;
  label: string;
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: readonly (string | FilterOption)[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  const items = options
    .map((option) =>
      typeof option === 'string' ? { value: option, label: option } : option,
    )
    .filter((item) => item.value !== '');

  return (
    <div className="flex flex-col gap-1">
      <Label
        htmlFor={id}
        className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className={className ?? 'min-w-[140px]'}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
