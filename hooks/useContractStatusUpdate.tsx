import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/use-toast';
import { logContractStatusChange } from '@/data/superuser/activities';
import { getUser } from '@/data/users';
import {
  reactivateChildrenAfterParent,
  requestArchiveWithChildren,
} from '@/lib/contracts/archiveClient';
import { useArchiveChildrenConfirm } from '@/components/providers/ArchiveChildrenConfirmProvider';
import { useReactivateChildrenSelect } from '@/components/providers/ReactivateChildrenDialogProvider';

interface UseContractStatusUpdateOptions {
  onSuccess?: () => void;
}

export const useContractStatusUpdate = ({
  onSuccess,
}: UseContractStatusUpdateOptions = {}) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const confirmArchiveChildren = useArchiveChildrenConfirm();
  const selectReactivateChildren = useReactivateChildrenSelect();

  const updateContractStatus = async (
    contractId: string,
    newStatus: 'active' | 'inactive',
    vendorName: string,
    termEndDate?: string | null,
    currentStatus?: 'active' | 'inactive' | 'unconfirmed',
  ): Promise<boolean> => {
    setIsLoading(true);

    const hasEndDatePassed = termEndDate && new Date(termEndDate) < new Date();

    try {
      const response =
        newStatus === 'inactive'
          ? await requestArchiveWithChildren(
              [contractId],
              confirmArchiveChildren,
            )
          : await fetch('/api/contracts/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contractIds: [contractId],
                status: newStatus,
                updateStatusOnly: !hasEndDatePassed,
              }),
            });
      if (!response.ok) throw new Error('Failed to update contract');
      await response.json();

      // Log the activity after a successful update. Archiving and plain
      // reactivation (including cascaded children) are logged server-side by
      // /api/contracts/update. Only the renewal path (expired contract) runs
      // there without logging, so it is logged here.
      if (newStatus === 'active' && hasEndDatePassed) {
        try {
          const user = await getUser();
          await logContractStatusChange({
            contractId: parseInt(contractId),
            oldStatus: currentStatus || 'unconfirmed',
            newStatus: 'active',
            reason: 'Contract confirmed by user',
            changedBy: user.id,
          });
        } catch (logError) {
          console.warn(
            'Failed to log contract status change activity:',
            logError,
          );
          // Don't fail the update if logging fails
        }
      }

      if (newStatus === 'inactive') {
        toast({
          title: 'Contract Archived',
          description: `Successfully archived ${vendorName} contract.`,
        });
      } else {
        toast({
          title: `${vendorName} Contract Updated`,
          description: `Successfully marked contract as ${newStatus}.`,
        });
      }

      if (newStatus === 'active') {
        await reactivateChildrenAfterParent(
          [contractId],
          selectReactivateChildren,
        );
      }

      router.refresh();
      onSuccess?.();
      return true;
    } catch (error) {
      console.error('Error updating contract status:', error);
      toast({
        title: 'Error',
        description: `Failed to update ${vendorName}'s contract status.`,
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateContractStatus, isLoading };
};
