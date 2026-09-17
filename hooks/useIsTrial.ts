'use client';

import { useContext } from 'react';
import { UserContext } from '@/app/userProvider';

export function useIsTrial(module?: 'cpm' | 'investor'): boolean {
  const userContext = useContext(UserContext);
  const meta = userContext?.userMetadata;
  if (module === 'cpm')
    return meta?.isTrial === true || meta?.cpmTrialEnabled === true;
  if (module === 'investor') return meta?.investorTrialEnabled === true;
  return false;
}
