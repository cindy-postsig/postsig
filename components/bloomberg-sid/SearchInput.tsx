'use client';

import { useId } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Free-text search sitting in the same filter row as `FilterSelect`. */
export function SearchInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <Label
        htmlFor={id}
        className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground"
      >
        Search
      </Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-[220px] bg-accent pl-8 font-sans-neue text-[0.825rem]"
        />
      </div>
    </div>
  );
}
