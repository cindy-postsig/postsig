import { cache } from 'react';
import {
  fetchContractACL,
  fetchContractFolderACLs,
  type ACL,
  type User,
  type Group,
  type PermissionLevel,
} from '@/app/lib/sharing/actions';
import logger from '@/utils/pino';

export type { ACL, User, Group, PermissionLevel };

export interface FolderACL {
  folderId: number;
  folderName: string;
  folderPath: string;
  acl: ACL;
}

export interface ContractACLResult {
  /** Direct contract ACL (users and groups with access) */
  contractACL: ACL;
  /** ACLs from folders this contract belongs to */
  folderACLs: FolderACL[];
}

/**
 * Get ACL (access control list) for a contract.
 * Returns both direct contract permissions and inherited folder permissions.
 * Cached per request for deduplication.
 */
export const getContractACL = cache(
  async (contractId: number): Promise<ContractACLResult> => {
    try {
      const [contractACL, folderACLs] = await Promise.all([
        fetchContractACL(contractId),
        fetchContractFolderACLs([contractId]),
      ]);

      return {
        contractACL,
        folderACLs,
      };
    } catch (error) {
      logger.error({ error, contractId }, 'Error fetching contract ACL');
      return {
        contractACL: { users: [], groups: [] },
        folderACLs: [],
      };
    }
  },
);
