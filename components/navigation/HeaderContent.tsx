'use client';

import { usePathname } from 'next/navigation';
import { useMode } from '@/contexts/ModeContext';
import { AppLogo } from '@/components/navigation/AppHeader';
import VentureModeIndicator from '@/components/venture/VentureModeIndicator';
import HeaderSearch from '@/components/search/HeaderSearch';
import UploadButton from '@/components/UploadButton';
import SigpilotButton from '@/components/SigpilotButton';
import InvestorCompanySearch from '@/components/search/InvestorCompanySearch';

interface HeaderContentProps {
  assistantEnabled: boolean;
  investorTrialEnabled: boolean;
  hidePortfolio: boolean;
  isBeta: boolean;
}

export function HeaderContent({
  assistantEnabled,
  investorTrialEnabled,
  hidePortfolio,
  isBeta,
}: HeaderContentProps) {
  const { isVentureMode } = useMode();
  const pathname = usePathname();
  const onCompanyDetails = pathname?.startsWith('/investor/company/') ?? false;

  if (isVentureMode) {
    return (
      <div className="flex h-14 w-full items-center gap-3">
        <div className="flex items-center gap-5">
          <AppLogo isBeta={isBeta} />
          <div className="flex items-center gap-2">
            {!investorTrialEnabled && !hidePortfolio && (
              <VentureModeIndicator disabled={onCompanyDetails} />
            )}
            {!hidePortfolio && (
              <InvestorCompanySearch placeholder="Search companies" size="sm" />
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <UploadButton size="sm" />
          {assistantEnabled && <SigpilotButton size="sm" />}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex h-14 w-full items-center gap-3 ${assistantEnabled ? '' : 'justify-between'}`}
    >
      <div className="flex items-center gap-4">
        <AppLogo isBeta={!!isBeta} />
        {!investorTrialEnabled && (
          <VentureModeIndicator disabled={onCompanyDetails} />
        )}
      </div>
      {assistantEnabled ? (
        <>
          <div className="flex flex-1 justify-center">
            <HeaderSearch placeholder="Search or enter prompt (⌘I)" size="sm" />
          </div>
          <div className="flex items-center gap-2">
            <UploadButton size="sm" />
            <SigpilotButton size="sm" />
          </div>
        </>
      ) : (
        <div className="flex w-1/2 justify-end gap-2">
          <HeaderSearch placeholder="Search" size="sm" />
          <UploadButton size="sm" />
        </div>
      )}
    </div>
  );
}
