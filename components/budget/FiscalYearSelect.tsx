'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function fiscalYearOptions(
  oldestFiscalYear: number | null,
  currentFiscalYear: number,
): number[] {
  const oldest = Math.min(
    oldestFiscalYear ?? currentFiscalYear,
    currentFiscalYear,
  );
  const years: number[] = [];
  for (let year = currentFiscalYear; year >= oldest; year--) years.push(year);
  return years;
}

export function FiscalYearSelect({
  fiscalYear,
  years,
  onChange,
}: {
  fiscalYear: number;
  years: number[];
  onChange: (fiscalYear: number) => void;
}) {
  // No label: the FY{year} value is self-explanatory.
  return (
    <Select
      value={String(fiscalYear)}
      onValueChange={(value) => onChange(Number(value))}
    >
      <SelectTrigger className="h-8 w-[110px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {years.map((year) => (
          <SelectItem key={year} value={String(year)} className="text-xs">
            FY{year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
