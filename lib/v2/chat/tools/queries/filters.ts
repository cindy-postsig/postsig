import { getContractsListForLineageAI } from '@/lib/v2/contracts/service';
import {
  contractOwners,
  ownerGroupNames,
  ownerSponsorNames,
} from '@/lib/v2/owners/embed';

export type ContractsListItem = Awaited<
  ReturnType<typeof getContractsListForLineageAI>
>['contracts'][number];

export function filterByVendor(
  contracts: ContractsListItem[],
  vendorName?: string,
) {
  if (!vendorName) return contracts;
  const search = vendorName.toLowerCase();
  return contracts.filter((c) =>
    c.contract.vendors?.name?.toLowerCase().includes(search),
  );
}

export interface ContractTag {
  id: number;
  tag_id: number;
  user_tags?: { id: number; name?: string } | null;
}

export function filterByTag(
  contracts: ContractsListItem[],
  tagName?: string,
): ContractsListItem[] {
  if (!tagName) return contracts;
  const search = tagName.toLowerCase();
  return contracts.filter((c) => {
    const tags = c.contract.contract_tags as ContractTag[] | undefined;
    return (
      tags?.some((t) => t.user_tags?.name?.toLowerCase() === search) ?? false
    );
  });
}

export function filterByBusinessGroup(
  contracts: ContractsListItem[],
  businessGroupName?: string,
): ContractsListItem[] {
  if (!businessGroupName) return contracts;
  const search = businessGroupName.toLowerCase();
  return contracts.filter((c) =>
    ownerGroupNames(contractOwners(c.contract)).some((name) =>
      name.toLowerCase().includes(search),
    ),
  );
}

export function filterBySponsor(
  contracts: ContractsListItem[],
  sponsorName?: string,
): ContractsListItem[] {
  if (!sponsorName) return contracts;
  const search = sponsorName.toLowerCase();
  return contracts.filter((c) =>
    ownerSponsorNames(contractOwners(c.contract)).some((name) =>
      name.toLowerCase().includes(search),
    ),
  );
}
