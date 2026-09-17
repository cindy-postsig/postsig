import { useState } from 'react';
import { assignContractToFolder } from '@/data/superuser/folders';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import logger from '@/utils/pino';

/**
 * Hook to handle folder assignment for contracts
 * Centralizes folder assignment logic with consistent error handling and toast messages
 */
export function useFolderAssignment() {
  const [isAssigning, setIsAssigning] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  /**
   * Assigns one or more contracts to a folder
   * @param contractIds - Single contract ID or array of contract IDs
   * @param folderId - Folder ID to assign to (null to remove from all folders)
   */
  const assignToFolder = async (
    contractIds: number | number[],
    folderId: number | null,
  ) => {
    setIsAssigning(true);
    try {
      await assignContractToFolder(contractIds, folderId);

      const isMultiple = Array.isArray(contractIds) && contractIds.length > 1;
      const contractCount = Array.isArray(contractIds) ? contractIds.length : 1;

      toast({
        title: 'Success',
        description: folderId
          ? `${isMultiple ? `${contractCount} contracts` : 'Contract'} assigned to folder`
          : `${isMultiple ? `${contractCount} contracts` : 'Contract'} removed from folder`,
      });

      router.refresh();
    } catch (error) {
      logger.error(
        { error, contractIds, folderId },
        'Failed to assign contracts to folder',
      );
      toast({
        title: 'Error',
        description: 'Failed to update folder assignment',
        variant: 'destructive',
      });
    } finally {
      setIsAssigning(false);
    }
  };

  return { assignToFolder, isAssigning };
}
