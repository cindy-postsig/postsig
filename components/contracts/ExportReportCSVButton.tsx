'use client';
import { useContext, useState } from 'react';
import { handleDownload } from '@/app/lib/utils';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Loading from '../Loading';
import { UserContext } from '@/app/userProvider';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';
import { ChevronDownIcon } from '@radix-ui/react-icons';

interface RenewalExportOption {
  label: string;
  contractIds: number[];
  reportType?: string; // Optional - if not provided, use general export
  fileName: string;
  useGeneralExport?: boolean; // If true, don't send reportType to use the general export
}

interface ExportReportCSVButtonProps {
  label?: string;
  reportTitle: string;
  contractIds?: number[];
  disabled?: boolean;
  reportType?: string; // The key from reportConfigs to use
  variant?: 'default' | 'renewals' | 'inventory';
  // For renewals variant only
  renewalOptions?: RenewalExportOption[];
  // For inventory export
  exportType?: 'contracts' | 'inventory' | 'inventoryActiveUsers';
  inventoryData?: unknown[];
  columnOrder?: string[];
}

const ExportReportCSVButton = ({
  label = 'Export',
  reportTitle,
  contractIds = [],
  disabled = false,
  reportType,
  variant = 'default',
  renewalOptions = [],
  exportType = 'contracts',
  inventoryData = [],
  columnOrder,
}: ExportReportCSVButtonProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const canExport = useCanExportCsv('cpm');
  const userContext = useContext(UserContext);

  const handleExport = async (
    ids?: number[],
    rType?: string,
    fileName?: string,
    overrideExportType?: 'contracts' | 'inventory' | 'inventoryActiveUsers',
  ) => {
    setIsExporting(true);
    try {
      // Build request body based on export type
      let requestBody: Record<string, unknown> = {};
      const resolvedExportType = overrideExportType || exportType;

      if (
        resolvedExportType === 'inventory' ||
        resolvedExportType === 'inventoryActiveUsers'
      ) {
        requestBody = {
          exportType: resolvedExportType,
          inventoryData: inventoryData,
          columnOrder,
        };
      } else {
        // Use the provided IDs or fall back to the prop
        const contractIdsToExport = ids || contractIds;
        // Use provided reportType, param, or fallback to a simplified version of the title
        const resolvedReportType = rType || reportType;

        requestBody = {
          exportType: 'contracts',
          contractIds: contractIdsToExport,
          reportType: resolvedReportType,
          columnOrder,
        };
      }

      // Fetch the data using the unified export endpoint
      const response = await fetch('/api/contracts/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Failed to export contracts');
      }

      const data = await response.blob();
      await handleDownload(
        data,
        fileName ||
          `${reportTitle.toLowerCase().replace(/\s+/g, '-')}-report.csv`,
      );
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  if (!canExport) {
    return null;
  }

  // For the default variant, use a simple button
  if (variant === 'default') {
    return (
      <>
        <Button
          onClick={() => handleExport()}
          variant={'outline'}
          size={'sm'}
          disabled={disabled}
        >
          {label}
        </Button>
        {renderLoadingDialog()}
      </>
    );
  }

  // For inventory variant, use a dropdown with summary and active users options
  if (variant === 'inventory') {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={'outline'} size={'sm'} disabled={disabled}>
              {label}
              <ChevronDownIcon className="ml-1 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={() =>
                handleExport(
                  undefined,
                  undefined,
                  'inventory-export.csv',
                  'inventory',
                )
              }
            >
              Export Summary
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                handleExport(
                  undefined,
                  undefined,
                  'inventory-active-users-export.csv',
                  'inventoryActiveUsers',
                )
              }
            >
              Export with Active Users
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {renderLoadingDialog()}
      </>
    );
  }

  // For renewals variant, use a dropdown
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={'outline'} size={'sm'} disabled={disabled}>
            {label}
            <ChevronDownIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {renewalOptions.map((option, index) => (
            <DropdownMenuItem
              key={index}
              disabled={option.contractIds.length === 0}
              onClick={() =>
                handleExport(
                  option.contractIds,
                  option.reportType,
                  option.fileName,
                )
              }
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {renderLoadingDialog()}
    </>
  );

  function renderLoadingDialog() {
    return (
      isExporting && (
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
      )
    );
  }
};

export default ExportReportCSVButton;
