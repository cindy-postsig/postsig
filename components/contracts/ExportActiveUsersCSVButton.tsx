'use client';
import { useState } from 'react';
import { useIsTrial } from '@/hooks/useIsTrial';
import { exportActiveUsersCSV } from '@/app/lib/actions/contract';
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

interface ExportActiveUsersCSVButtonProps {
  id: number;
  users: {
    name: string;
    email: string;
    product?: string;
    employee_id?: string;
    region?: string;
    country?: string;
    division?: string;
    department?: string;
    cost_center?: string;
    entity?: string;
    business_unit?: string;
    team?: string;
    business_group?: string;
    start_date?: string;
    leave_date?: string;
  }[];
  disabled?: boolean;
  size?: 'default' | 'xs' | 'sm';
}

const ExportActiveUsersCSVButton = ({
  id,
  users,
  disabled = false,
  size = 'default',
}: ExportActiveUsersCSVButtonProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const isTrial = useIsTrial('cpm');

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await exportActiveUsersCSV({ id, users });
      if (blob) {
        const filename = `contract_${id}_active_users.csv`;
        await handleDownload(blob, filename);
        await logExportBeacon('contract-active-users-csv', {
          format: 'csv',
          filename,
          rowCount: users.length,
          resourceIds: [id],
        });
      }
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
        variant={'outline'}
        size={size}
        disabled={disabled || isTrial}
      >
        Export
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

export default ExportActiveUsersCSVButton;
