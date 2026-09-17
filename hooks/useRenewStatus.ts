import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { updateContract } from '@/app/lib/contracts/actions';
import { getUser } from '@/data/users';
import { logWillNotRenew } from '@/data/superuser/activities';
import { invalidateOrganizationDataCache } from '@/app/lib/actions/cache-actions';
import logger from '@/utils/pino';

export function useRenewStatus(contract: any) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [renewStatus, setRenewStatus] = useState<boolean>(
    contract.will_not_renew || false,
  );

  const updateRenewStatus = async (value: boolean) => {
    if (!contract) return;

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
        logger.error(
          { contractId: contract.id, error: result.error },
          'Error updating renew status',
        );
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
        logger.warn(
          { contractId: contract.id, error: logError },
          'Failed to log will not renew activity',
        );
        // Don't fail the update if logging fails
      }

      setRenewStatus(value);
      toast({ description: 'Renew status updated successfully' });
    } catch (e: any) {
      logger.error(
        { contractId: contract.id, error: e },
        'Error updating renew status',
      );
      toast(generateToastError(e.message, 'Error updating renew status!'));
    } finally {
      setLoading(false);
      router.refresh();
    }
  };

  return { loading, renewStatus, updateRenewStatus };
}
