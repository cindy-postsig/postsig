import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/use-toast';
import { logInvoiceStatusChange } from '@/data/superuser/activities';
import { updateInvoiceStatus as updateInvoiceStatusAction } from '@/app/lib/contracts/actions';
import {
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from '@/constants/invoiceStatus';

interface UseInvoiceStatusUpdateOptions {
  onSuccess?: () => void;
}

export const useInvoiceStatusUpdate = ({
  onSuccess,
}: UseInvoiceStatusUpdateOptions = {}) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const updateInvoiceStatus = async (
    contractId: number,
    newStatus: InvoiceStatus,
    reason?: string,
  ): Promise<boolean> => {
    setIsLoading(true);

    try {
      const { oldStatus } = await updateInvoiceStatusAction(
        contractId,
        newStatus,
        reason,
      );

      await logInvoiceStatusChange({
        contractId,
        oldStatus: oldStatus || 'review',
        newStatus,
      }).catch(() => {});

      toast({
        title: 'Invoice Status Updated',
        description: React.createElement(
          'span',
          null,
          'Status set to ',
          React.createElement('strong', null, INVOICE_STATUS_LABELS[newStatus]),
          '.',
        ),
      });

      router.refresh();
      onSuccess?.();
      return true;
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update invoice status.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateInvoiceStatus, isLoading };
};
