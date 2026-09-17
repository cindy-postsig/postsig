'use client';

import React from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRoundFilter } from './RoundFilterContext';
import { getStageColor } from '@/app/(app)/(investor)/investor/colors';
import type { InvestmentStage } from '../../types';

export function RoundSelector() {
  const { selectedRound, setSelectedRound, rounds } = useRoundFilter();

  // Don't render if there's 0 or 1 round (not selectable per requirements)
  if (rounds.length <= 1) {
    return null;
  }

  const selectedLabel =
    selectedRound === 'all'
      ? 'All Rounds'
      : (rounds.find((r) => r.id === selectedRound)?.stageName ?? 'All Rounds');
  const selectedColor =
    selectedRound === 'all'
      ? 'hsl(var(--foreground))'
      : getStageColor(selectedLabel as InvestmentStage);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="font-medium inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm transition-colors hover:bg-muted focus:outline-none">
        <Layers
          className="font-medium mr-1 inline-block h-3.5 w-3.5"
          style={{ color: selectedColor }}
        />
        {selectedLabel}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-[160px]">
        <DropdownMenuItem
          onClick={() => setSelectedRound('all')}
          className={selectedRound === 'all' ? 'font-medium' : ''}
        >
          All Rounds (Current)
        </DropdownMenuItem>
        {rounds.map((round) => (
          <DropdownMenuItem
            key={round.id}
            onClick={() => setSelectedRound(round.id)}
            className={selectedRound === round.id ? 'font-medium' : ''}
          >
            {round.stageName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
