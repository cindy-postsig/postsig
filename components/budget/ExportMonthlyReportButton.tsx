'use client';

import { useState } from 'react';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';
import { format } from 'date-fns';
import { exportMonthlyReportExcel } from '@/app/lib/actions/export-monthly-report';
import { handleDownload } from '@/app/lib/utils';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Loading from '@/components/Loading';
import {
  BusinessSponsorAndGroupData,
  PriceChangeData,
  TopVendorData,
} from '@/lib/v2/reports/monthly-report/transforms';
import logger from '@/utils/pino';

interface ExportMonthlyReportButtonProps {
  monthlyReportData: {
    overview: {
      currentMonthSpend: {
        amount: number;
        label: string;
      };
      nextMonthSpend: {
        amount: number;
        change: number;
        changePercent: number;
        label: string;
      };
    };
    spendByBusinessGroup: BusinessSponsorAndGroupData[];
    spendByBusinessSponsor: BusinessSponsorAndGroupData[];
    priceChanges: PriceChangeData[];
    upcomingRenewalsContracts: any[];
    topVendorsBySpend: TopVendorData[];
  };
  selectedTag?: string | null;
  viewMode?: 'amortized' | 'actual';
  disabled?: boolean;
  buttonText?: string;
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const ExportMonthlyReportButton = ({
  monthlyReportData,
  selectedTag,
  viewMode = 'amortized',
  disabled = false,
  buttonText = 'Export to Excel',
  variant = 'outline',
  size = 'sm',
}: ExportMonthlyReportButtonProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const canExport = useCanExportCsv('cpm');

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Generate filename with current month/year, view mode, and optional tag
      const currentDate = new Date();
      const viewSuffix = viewMode === 'actual' ? '-actual-cost' : '-amortized';
      const tagSuffix = selectedTag
        ? `-${selectedTag.toLowerCase().replace(/\s+/g, '-')}`
        : '';
      const filename = `postsig_monthly-budget-report${viewSuffix}-${format(currentDate, 'yyyy-MM')}${tagSuffix}.xlsx`;

      // Call server action to generate Excel (returns number array)
      const dataArray = await exportMonthlyReportExcel(
        monthlyReportData,
        selectedTag,
        viewMode,
      );

      // Convert number array to Uint8Array, then to Blob
      const uint8Array = new Uint8Array(dataArray);
      const blob = new Blob([uint8Array], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      // Trigger download
      await handleDownload(blob, filename);
    } catch (error) {
      logger.error({ error }, 'Export monthly report failed');
    } finally {
      setIsExporting(false);
    }
  };

  if (!canExport) {
    return null;
  }

  return (
    <>
      <Button
        onClick={handleExport}
        variant={variant}
        size={size}
        disabled={disabled}
      >
        {buttonText}
      </Button>
      {isExporting && (
        <Dialog open={isExporting} onOpenChange={setIsExporting}>
          <DialogContent
            onInteractOutside={(e) => {
              e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogClose />
              <DialogDescription>
                <div className="flex items-center justify-center gap-4">
                  Exporting to Excel
                  <Loading />
                </div>
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default ExportMonthlyReportButton;
