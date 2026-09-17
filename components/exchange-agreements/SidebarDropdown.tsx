'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  displayValue: React.ReactNode;
  children: React.ReactNode;
}

// Selected/unselected indicator shared by ExchangeSelector and
// ProductLineSelector's option lists.
export function SidebarRadioDot({
  selected,
  muted,
}: {
  selected: boolean;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
        muted && 'opacity-40',
        selected
          ? 'border-foreground bg-foreground'
          : 'border-border bg-background',
      )}
    >
      {selected && <span className="h-1.5 w-1.5 rounded-full bg-background" />}
    </span>
  );
}

// Shared shell for the sidebar's toggle-button-that-expands-into-a-list
// pattern, used by ExchangeSelector and ProductLineSelector.
export default function SidebarDropdown({
  label,
  displayValue,
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <div className="px-4 pb-1 pt-3">
        <p className="font-label text-xs uppercase tracking-wide text-foreground/85">
          {label}
        </p>
      </div>
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 pb-4 text-left"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        {displayValue}
        <ChevronDown
          className={cn(
            'h-4 w-4 text-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}
