'use client';

import type { ReactNode } from 'react';
import { Archive, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FeeScheduleVersion } from '@/lib/exchange-agreement/types';

interface Props {
  label: string | null;
  versions: FeeScheduleVersion[];
  selectedVersionId: string | null;
  onSelect: (versionId: string | null) => void;
  // Optional per-item trailing annotation (e.g. My List's saved-product
  // count) rendered before the checkmark; omitted where a caller has none.
  renderTrailing?: (version: FeeScheduleVersion | null) => ReactNode;
}

// The badge + "view a previous version" control shared by Product Explorer
// and My List -- picking a version re-scopes that view to a snapshot of the
// fee schedule as of that release instead of always showing "latest".
export default function FeeScheduleVersionSwitcher({
  label,
  versions,
  selectedVersionId,
  onSelect,
  renderTrailing,
}: Props) {
  return (
    <div className="mb-2 flex items-center gap-2">
      {label && (
        <span className="rounded-full border border-border px-3 py-1 text-sm text-foreground">
          {label}
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="View a previous version"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 w-56 overflow-y-auto"
        >
          <DropdownMenuLabel>Fee schedule version</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex items-center justify-between gap-2"
            onClick={() => onSelect(null)}
          >
            <span>Latest (per product)</span>
            <span className="flex items-center gap-2">
              {renderTrailing?.(null)}
              {selectedVersionId === null && (
                <Check className="h-4 w-4 shrink-0" />
              )}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {versions.map((version) => (
            <DropdownMenuItem
              key={version.id}
              className="flex items-center justify-between gap-2"
              onClick={() => onSelect(version.id)}
            >
              <span>{version.label}</span>
              <span className="flex items-center gap-2">
                {renderTrailing?.(version)}
                {selectedVersionId === version.id && (
                  <Check className="h-4 w-4 shrink-0" />
                )}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
