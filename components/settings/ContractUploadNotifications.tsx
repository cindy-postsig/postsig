'use client';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { Switch } from '@/components/ui/switch';
import {
  getUserPreference,
  setUserPreference,
} from '@/app/lib/actions/preferences';
import logger from '@/utils/pino';

export default function ContractUploadNotificationsForm({
  user,
}: {
  user: any;
}) {
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [contractUploadNotifications, setContractUploadNotifications] =
    useState<boolean>(false);

  const getUserData = useCallback(async () => {
    try {
      setLoading(true);
      const value = await getUserPreference(
        user.userId,
        'notifications.contract_uploads',
      );
      setContractUploadNotifications(value);
    } catch (error: any) {
      logger.error(
        { error, userId: user.userId },
        'Error loading contract upload notifications preference',
      );
      toast(
        generateToastError(error.message, 'Error loading user preferences!'),
      );
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    getUserData();
  }, [getUserData]);

  const updateContractUploadNotifications = async (value: boolean) => {
    try {
      setLoading(true);
      const success = await setUserPreference(
        user.userId,
        'notifications.contract_uploads',
        value,
      );

      if (!success) {
        throw new Error('Failed to update preference');
      }

      setContractUploadNotifications(value);
      toast({
        description: 'Contract upload notification updated successfully',
        variant: 'default',
      });
    } catch (error: any) {
      logger.error(
        { error, userId: user.userId, value },
        'Error updating contract upload notification',
      );
      toast(
        generateToastError(
          error.message,
          'Error updating contract upload notification!',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-36">
      <Switch
        checked={contractUploadNotifications || false}
        onCheckedChange={updateContractUploadNotifications}
        disabled={loading}
      />
    </div>
  );
}
