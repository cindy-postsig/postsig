'use client';
import { useContext, useState } from 'react';
import { exportCSV } from '@/app/lib/actions/contract';
import { handleDownload } from '@/app/lib/utils';
import { logExportBeacon } from '@/utils/audit-export';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Loading from '../Loading';
import { UserContext } from '@/app/userProvider';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';

interface ExportCSVButtonProps {
  label?: string;
  range?: number;
  disabled?: boolean;
}

const ExportCSVButton = ({
  label = 'Export',
  range = 0,
  disabled = false,
}: ExportCSVButtonProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const canExport = useCanExportCsv('cpm');
  const userContext = useContext(UserContext);
  const userMetadata = userContext?.userMetadata;
  const fiscalYearStart = userMetadata?.organizationFY;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await exportCSV({
        range,
        fiscalYearStartMonth: fiscalYearStart || 1,
      });
      if (blob) {
        await handleDownload(blob, 'contracts.csv');
        await logExportBeacon('contracts-archived-csv', {
          format: 'csv',
          filename: 'contracts.csv',
          range,
        });
      } else {
        console.error('Export failed: No blob returned');
      }
    } catch (error) {
      console.error('Export failed:', error);
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
        variant={'outline'}
        className="h-10 text-[.95rem]"
        disabled={disabled}
      >
        {label}
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
                  Exporting to CSV
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

export default ExportCSVButton;
