'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  isSharedRoute,
  getLastActiveModule,
  setLastActiveModule,
} from '@/lib/module-persistence';

export type AppMode = 'contracts' | 'venture';

// Fund ID can be 'all' or any numeric entity ID
export type FundId = 'all' | number;

export interface Fund {
  id: FundId;
  name: string;
  shortName: string;
}

// Default "All Funds" option
const ALL_FUNDS_OPTION: Fund = {
  id: 'all',
  name: 'All Funds',
  shortName: 'All Funds',
};

interface ModeContextValue {
  mode: AppMode;
  isVentureMode: boolean;
  isContractsMode: boolean;
  homeRoute: string;
  selectedFunds: FundId[];
  setSelectedFunds: (funds: FundId[]) => void;
  selectedFundsLabel: string;
  funds: Fund[];
  isLoadingFunds: boolean;
}

const ModeContext = createContext<ModeContextValue | null>(null);

/**
 * Derives the app mode from the current pathname.
 * For shared routes, reads from the persisted cookie; otherwise derives from the path.
 */
function getModeFromPath(pathname: string): AppMode {
  // For shared routes, use the persisted module from cookie
  if (isSharedRoute(pathname)) {
    const persistedMode = getLastActiveModule();
    return persistedMode ?? 'contracts';
  }

  // For module-specific routes, derive from the path
  if (pathname.startsWith('/investor')) {
    return 'venture';
  }
  return 'contracts';
}

function getHomeRoute(mode: AppMode): string {
  switch (mode) {
    case 'venture':
      return '/investor/documents';
    case 'contracts':
    default:
      return '/dashboard';
  }
}

async function fetchFunds(): Promise<Fund[]> {
  const response = await fetch('/api/v2/investor/inv/funds');
  if (!response.ok) {
    throw new Error('Failed to fetch funds');
  }
  const data = await response.json();
  return (data.funds || []).map(
    (f: { id: number; name: string; shortName: string | null }) => ({
      id: f.id,
      name: f.name,
      shortName: f.shortName ?? f.name,
    }),
  );
}

interface ModeProviderProps {
  children: ReactNode;
}

export function ModeProvider({ children }: ModeProviderProps) {
  const pathname = usePathname();
  const [selectedFunds, setSelectedFunds] = useState<FundId[]>(['all']);
  const mode = getModeFromPath(pathname);

  // Persist the active module when on module-specific routes
  useEffect(() => {
    if (!isSharedRoute(pathname)) {
      setLastActiveModule(mode);
    }
  }, [pathname, mode]);

  // Fetch funds from API when in venture mode
  const { data: apiFunds = [], isLoading: isLoadingFunds } = useQuery({
    queryKey: ['funds'],
    queryFn: fetchFunds,
    enabled: mode === 'venture',
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Combine "All Funds" option with API funds
  const funds = useMemo<Fund[]>(
    () => [ALL_FUNDS_OPTION, ...apiFunds],
    [apiFunds],
  );

  const value = useMemo<ModeContextValue>(() => {
    // Build label for selected funds
    let selectedFundsLabel: string;
    if (selectedFunds.includes('all') || selectedFunds.length === 0) {
      selectedFundsLabel = 'All Funds';
    } else if (selectedFunds.length === 1) {
      const fund = funds.find((f) => f.id === selectedFunds[0]);
      selectedFundsLabel = fund?.shortName || 'All Funds';
    } else {
      selectedFundsLabel = `${selectedFunds.length} Funds`;
    }

    return {
      mode,
      isVentureMode: mode === 'venture',
      isContractsMode: mode === 'contracts',
      homeRoute: getHomeRoute(mode),
      selectedFunds,
      setSelectedFunds,
      selectedFundsLabel,
      funds,
      isLoadingFunds,
    };
  }, [mode, selectedFunds, funds, isLoadingFunds]);

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useMode(): ModeContextValue {
  const context = useContext(ModeContext);
  if (!context) {
    throw new Error('useMode must be used within a ModeProvider');
  }
  return context;
}

export function useModeFromPath(): AppMode {
  const pathname = usePathname();
  return getModeFromPath(pathname);
}
