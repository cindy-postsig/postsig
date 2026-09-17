'use client';

import { useState, useEffect } from 'react';
import { getFtuxComponent, type FtuxKey } from './registry';
import { markFtuxAsSeen } from '@/app/lib/actions/user';

interface UniversalFtuxProviderProps {
  children: React.ReactNode;
  ftuxKeys: string[];
  userFtuxStatus?: Record<string, boolean> | null;
}

export default function UniversalFtuxProvider({
  children,
  ftuxKeys,
  userFtuxStatus = {},
}: UniversalFtuxProviderProps) {
  const [activeFtux, setActiveFtux] = useState<string | null>(null);
  const [dismissedFtux, setDismissedFtux] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Find the first FTUX that the user hasn't seen yet and hasn't been dismissed this session
    const unseenFtux = ftuxKeys.find(
      (key) => !userFtuxStatus?.[key] && !dismissedFtux.has(key),
    );

    if (unseenFtux && !activeFtux) {
      setActiveFtux(unseenFtux);
    }
  }, [ftuxKeys, userFtuxStatus, activeFtux, dismissedFtux]);

  const handleFtuxConfirm = async (ftuxKey: string) => {
    // Dismiss immediately
    setDismissedFtux((prev) => new Set([...prev, ftuxKey]));
    setActiveFtux(null);

    // Update server in background
    try {
      await markFtuxAsSeen(ftuxKey);
    } catch (error) {
      console.error('Error marking FTUX as seen:', error);
    }
  };

  const handleFtuxClose = () => {
    if (activeFtux) {
      setDismissedFtux((prev) => new Set([...prev, activeFtux]));
    }
    setActiveFtux(null);
  };

  // Render the active FTUX dialog
  const renderActiveFtux = () => {
    if (!activeFtux) return null;

    const FtuxComponent = getFtuxComponent(activeFtux);
    if (!FtuxComponent) return null;

    return (
      <FtuxComponent
        isOpen={true}
        onClose={handleFtuxClose}
        onConfirm={() => handleFtuxConfirm(activeFtux)}
      />
    );
  };

  return (
    <>
      {children}
      {renderActiveFtux()}
    </>
  );
}
