'use client';

import { Layers, X } from 'lucide-react';
import { useRoundFilter } from './RoundFilterContext';

export function RoundFilterBanner() {
  const { selectedRound, setSelectedRound, rounds } = useRoundFilter();

  if (selectedRound === 'all') {
    return null;
  }

  const round = rounds.find((r) => r.id === selectedRound);
  if (!round) {
    return null;
  }

  return (
    <div className="mx-auto flex items-center justify-between border-b border-indigo-200 bg-indigo-50 px-8 py-2 dark:border-indigo-800 dark:bg-indigo-950/30">
      <p className="text-xs text-indigo-700 dark:text-indigo-300">
        <Layers className="mr-2 inline-block h-3.5 w-3.5" />
        <span className="font-medium">
          Viewing: {round.stageName} terms only
        </span>
        <span className="ml-2 opacity-75">
          &mdash; Showing data as of the {round.stageName} round
        </span>
      </p>
      <button
        type="button"
        onClick={() => setSelectedRound('all')}
        className="font-medium flex items-center gap-1 text-xs text-indigo-700 transition-colors hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-100"
      >
        <X className="h-3.5 w-3.5" />
        View All Rounds
      </button>
    </div>
  );
}
