'use client';

import Link from 'next/link';
import { useContext } from 'react';
import { useMode } from '@/contexts/ModeContext';
import { UserContext } from '@/app/userProvider';

export function AppLogo({ isBeta }: { isBeta: boolean }) {
  const { homeRoute, isVentureMode } = useMode();
  const userContext = useContext(UserContext);
  const isInvestorTrial =
    userContext?.userMetadata?.investorTrialEnabled ?? false;

  const logoHref = isVentureMode && !isInvestorTrial ? '/investor' : homeRoute;

  return (
    <Link
      href={logoHref}
      className="font-normal ml-[2px] flex items-center gap-3 text-foreground dark:text-white"
    >
      <svg
        width="28"
        height="24"
        viewBox="0 0 37 32"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M32.6977 4.30232H0V0H37V11.186H0V6.88372H32.6977V4.30232Z"
          fill="currentColor"
        />
        <path
          d="M37 18.0699H4.30233V20.6513H37V31.8373H0V27.535H32.6977V24.9536H0V13.7676H37V18.0699Z"
          fill="currentColor"
        />
      </svg>
      PostSig{isVentureMode && ' Investor'}
      {isBeta && <span className="text-xs text-muted-foreground">Beta</span>}
    </Link>
  );
}
