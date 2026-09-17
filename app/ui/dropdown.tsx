'use client';
import React, { useContext, useState } from 'react';
import { exportCSV } from '@/app/lib/actions/contract';
import { handleDownload } from '@/app/lib/utils';
import { logExportBeacon } from '@/utils/audit-export';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogDescription,
} from '@/components/ui/dialog';
import Loading from '@/components/Loading';
import { UserContext } from '../userProvider';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';

export type DownloadOption = {
  label: string;
  value?: string;
  csvExport?: {
    id?: number;
    range?: number;
  };
  disabled?: boolean;
};

type DownloadDropdownProps = {
  options: DownloadOption[];
  title: string;
};

const DownloadDropdown: React.FC<DownloadDropdownProps> = ({
  options,
  title,
}) => {
  const [isExporting, setIsExporting] = useState(false);

  const userContext = useContext(UserContext);
  const userMetadata = userContext?.userMetadata;
  const fiscalYearStart = userMetadata?.organizationFY;
  const canExportCsv = useCanExportCsv('cpm');

  const visibleOptions = options.filter(
    (option) => !option.csvExport || canExportCsv,
  );

  const handleCsvExport = async (
    e: React.MouseEvent<HTMLAnchorElement>,
    option: DownloadOption,
  ) => {
    if (!option.csvExport) return;
    e.preventDefault();
    setIsExporting(true);

    try {
      const blob = await exportCSV({
        id: option.csvExport.id,
        range: option.csvExport.range,
        fiscalYearStartMonth: fiscalYearStart || 1,
      });

      if (blob) {
        const filename = option.csvExport.id
          ? `contract-${option.csvExport.id}.csv`
          : 'contracts.csv';
        await handleDownload(blob, filename);
        await logExportBeacon('contract-dropdown-csv', {
          format: 'csv',
          filename,
          resourceIds: option.csvExport.id ? [option.csvExport.id] : undefined,
          range: option.csvExport.range,
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

  if (visibleOptions.length === 0) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="font-medium flex items-center px-1 py-2 font-label text-sm outline-none">
            {title}
            <ChevronDown className="ml-1 h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          {visibleOptions.map((option, index) => (
            <DropdownMenuItem
              key={index}
              asChild
              disabled={option.disabled}
              className={option.disabled ? 'cursor-not-allowed opacity-50' : ''}
            >
              <a
                href={option.value || '#'}
                className="block w-full px-4 py-2 font-label text-sm"
                target={option.value ? '_blank' : undefined}
                rel={option.value ? 'noopener noreferrer' : undefined}
                download={option.value ? true : undefined}
                onClick={
                  option.csvExport
                    ? (e) => handleCsvExport(e, option)
                    : undefined
                }
              >
                {option.label}
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

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

export default DownloadDropdown;
