import { useState, useEffect, useCallback } from 'react';
import { TOTAL_CONTRACT_ATTACHMENT_SIZE } from '@/app/lib/contracts/attachments';
import { getTotalContractAttachmentSize } from '@/data/contracts';

export function useAttachmentStorage(contractId?: number) {
  const [usedStorage, setUsedStorage] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const remainingStorage = TOTAL_CONTRACT_ATTACHMENT_SIZE - usedStorage;
  const percentUsed = (usedStorage / TOTAL_CONTRACT_ATTACHMENT_SIZE) * 100;
  const isLimitReached = usedStorage >= TOTAL_CONTRACT_ATTACHMENT_SIZE;

  const formatStorage = (bytes: number): string => {
    if (bytes < 0) return '0 KB';
    if (bytes < 1024 * 1024) {
      return `${Math.floor(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(bytes < 2 * 1024 * 1024 ? 2 : 0)} MB`;
  };

  const refreshStorage = useCallback(async () => {
    if (!contractId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const currentSize = await getTotalContractAttachmentSize(contractId);
      setUsedStorage(currentSize);
    } catch (err) {
      console.error('Error fetching storage usage:', err);
      setError('Failed to load storage information');
    } finally {
      setIsLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    refreshStorage();
  }, [refreshStorage, contractId]);

  return {
    usedStorage,
    remainingStorage,
    percentUsed,
    isLimitReached,
    isLoading,
    error,
    refreshStorage,
    formatStorage,
  };
}
