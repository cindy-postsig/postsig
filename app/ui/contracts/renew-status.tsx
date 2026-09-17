// legacy component - not used anymore
// @ts-nocheck
'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { Checkbox } from '@/components/ui/checkbox';
import { updateContract } from '@/app/lib/contracts/actions';
import { getUser } from '@/data/users';
import { logWillNotRenew } from '@/data/superuser/activities';
import { invalidateOrganizationDataCache } from '@/app/lib/actions/cache-actions';

export default function RenewStatusForm({ contract }: { contract: any }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [renewStatus, setRenewStatus] = useState<boolean>(
    contract.will_not_renew || false,
  );
  const router = useRouter();

  const handleUpdateRenewStatus = async (value: boolean) => {
    if (!contract) {
      router.push('/contracts');
      return;
    }

    try {
      setLoading(true);

      const user = await getUser();
      const result = await updateContract(contract.id, {
        will_not_renew: value,
        will_not_renew_meta: {
          updated_by: user.id,
          updated_at: new Date().toUTCString(),
        },
      });

      if (result.error) {
        console.error('Error updating renew status:', result.error);
        toast(generateToastError(result.error, 'Error updating renew status!'));
        return;
      }

      await invalidateOrganizationDataCache();

      // Log the will not renew activity for both true and false
      try {
        await logWillNotRenew({
          contractId: contract.id,
          changedBy: user.id,
          reason: value
            ? 'Set to will not renew'
            : 'Removed will not renew status',
          status: value,
        });
      } catch (logError) {
        console.warn('Failed to log will not renew activity:', logError);
        // Don't fail the update if logging fails
      }

      setRenewStatus(value);
      toast({
        description: 'Renew status updated successfully',
        variant: 'default',
      });
    } catch (error: any) {
      console.error('Error updating renew status:', error);
      toast(generateToastError(error.message, 'Error updating renew status!'));
    } finally {
      setLoading(false);
      router.refresh();
    }
  };

  return (
    <Checkbox
      checked={renewStatus || false}
      onCheckedChange={handleUpdateRenewStatus}
      disabled={loading}
    />
  );
}
