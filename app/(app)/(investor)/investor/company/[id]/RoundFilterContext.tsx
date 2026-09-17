'use client';

import React, { createContext, useContext, useState } from 'react';
import type { FinancingRoundSummary } from '../../types';

export type RoundFilterValue = 'all' | number; // 'all' or financing round id

interface RoundFilterContextType {
  selectedRound: RoundFilterValue;
  setSelectedRound: (value: RoundFilterValue) => void;
  rounds: FinancingRoundSummary[];
}

const RoundFilterContext = createContext<RoundFilterContextType | null>(null);

export function useRoundFilter() {
  const ctx = useContext(RoundFilterContext);
  if (!ctx) {
    throw new Error('useRoundFilter must be used within a RoundFilterProvider');
  }
  return ctx;
}

interface RoundFilterProviderProps {
  rounds: FinancingRoundSummary[];
  children: React.ReactNode;
}

export function RoundFilterProvider({
  rounds,
  children,
}: RoundFilterProviderProps) {
  const [selectedRound, setSelectedRound] = useState<RoundFilterValue>('all');

  return (
    <RoundFilterContext.Provider
      value={{ selectedRound, setSelectedRound, rounds }}
    >
      {children}
    </RoundFilterContext.Provider>
  );
}
