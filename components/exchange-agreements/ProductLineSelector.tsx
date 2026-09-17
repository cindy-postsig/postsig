'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import SidebarDropdown, { SidebarRadioDot } from './SidebarDropdown';
import { ALL_PRODUCT_LINES } from '@/lib/exchange-agreement/feeScheduleQueries';

interface Props {
  productLines: string[];
  value: string;
  onChange: (value: string) => void;
}

export default function ProductLineSelector({
  productLines,
  value,
  onChange,
}: Props) {
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const lines = productLines.filter((line) =>
      line.toLowerCase().includes(needle),
    );
    return ALL_PRODUCT_LINES.toLowerCase().includes(needle)
      ? [ALL_PRODUCT_LINES, ...lines]
      : lines;
  }, [productLines, query]);

  return (
    <SidebarDropdown
      label="Product Line"
      displayValue={
        <span className="font-medium text-base text-foreground">{value}</span>
      }
    >
      <div className="relative mx-4 mb-2">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          type="text"
          placeholder="Search product lines..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
        />
      </div>
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={option}
            type="button"
            className="flex w-full items-start gap-3 px-4 py-2 text-left text-sm text-foreground hover:bg-hover"
            onClick={() => onChange(option)}
          >
            <SidebarRadioDot selected={selected} />
            <span className="text-left">{option}</span>
          </button>
        );
      })}
    </SidebarDropdown>
  );
}
