'use client';

import { useMode } from '@/contexts/ModeContext';
import FundSelector from '@/components/venture/FundSelector';

export default function VentureModeIndicator({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const { isVentureMode } = useMode();

  if (!isVentureMode) {
    return null;
  }

  return <FundSelector disabled={disabled} />;
}
