'use client';

import { useEffect } from 'react';
import { useMode } from '@/contexts/ModeContext';

export default function InvestorThemeScope({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isVentureMode } = useMode();

  // Radix overlays (Dialog/Select/Dropdown/Popover/Sheet) portal to <body>,
  // outside the wrapper div below, so they'd fall back to the root theme.
  // Mirror the theme onto <body> so portaled UI inherits the investor palette.
  useEffect(() => {
    if (!isVentureMode) return;
    document.body.classList.add('investor-theme');
    return () => document.body.classList.remove('investor-theme');
  }, [isVentureMode]);

  if (!isVentureMode) return <>{children}</>;
  return <div className="investor-theme">{children}</div>;
}
