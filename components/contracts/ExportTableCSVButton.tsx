'use client';
import { useState } from 'react';
import { useIsTrial } from '@/hooks/useIsTrial';
import { exportTableCSV } from '@/app/lib/actions/contract';
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

interface ExportTableCSVButtonProps {
  data: Record<string, any>[];
  headers: { key: string; label: string }[];
  filename: string;
  title?: string;
  metadata?: { label: string; value: string }[];
  multiValueFields?: { label: string; values: string[] }[];
  emptyPlaceholder?: string;
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
  auditSource?: string;
}

const ExportTableCSVButton = ({
  data,
  headers,
  filename,
  title,
  metadata = [],
  multiValueFields = [],
  emptyPlaceholder,
  disabled = false,
  buttonText = 'Export CSV',
  variant = 'outline',
  size = 'sm',
  auditSource = 'table-csv',
}: ExportTableCSVButtonProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const isTrial = useIsTrial('cpm');

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await exportTableCSV({
        data,
        headers,
        filename,
        title,
        metadata,
        multiValueFields,
        emptyPlaceholder,
      });
      await handleDownload(blob, filename);
      await logExportBeacon(auditSource, {
        format: 'csv',
        filename,
        rowCount: data.length,
      });
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleExport}
        variant={variant}
        size={size}
        disabled={disabled || isTrial || data.length === 0}
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

export default ExportTableCSVButton;
