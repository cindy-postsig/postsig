import { ContractGroup, ContractBase } from './types';

const isDefined = <T>(value: T | null | undefined): value is T => value != null;

/**
 * The groups a contract is SHARED with: direct contract_acl_group rows plus
 * the contract's own folders' folder_acl_group rows, deduped by group id.
 * ACL sense only — the share dialog, folder UI, and visibility checks. The
 * business groups every display and spend surface reads are the contract's
 * owners (`contractOwners`, lib/v2/owners), not this.
 */
export function extractSharedGroups(
  contract: Pick<ContractBase, 'contract_acl_group' | 'folder_contracts'>,
): ContractGroup[] {
  const directGroups: ContractGroup[] = (contract.contract_acl_group || [])
    .map((acl) => acl.groups)
    .filter(isDefined)
    .map((g) => ({ id: g.id, name: g.name, publicUuid: g.public_uuid }));

  const folderGroups: ContractGroup[] = (contract.folder_contracts || [])
    .flatMap((fc) => fc.folders?.folder_acl_group || [])
    .map((acl) => acl.groups)
    .filter(isDefined)
    .map((g) => ({ id: g.id, name: g.name, publicUuid: g.public_uuid }));

  // Merge and deduplicate by id
  const groupsMap = new Map<number, ContractGroup>();
  [...directGroups, ...folderGroups].forEach((g) => groupsMap.set(g.id, g));

  return Array.from(groupsMap.values());
}
