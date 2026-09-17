import {
  contractOwners,
  ownerGroupNames,
  ownerSponsorNames,
} from '@/lib/v2/owners/embed';
import type { ContractWithPricing } from '@/lib/v2/core/types';

export interface ContractRow {
  id: number;
  vendor: string;
  product: string;
  termStartDate: string;
  termEndDate: string;
  cancelByDate: string;
  renewalType: string;
  multiYearContract: string;
  subscriptionTerm: string;
  billingFrequency: string;
  currency: string;
  annualIncrease: string;
  businessSponsor: string;
  businessGroup: string;
  tags: string;
  monthlyValues: Record<string, number>;
  /** Names struck by confirmed lineage events (PSK-1830); '' when none. */
  cancelledProducts: string;
}

export function buildContractRows(
  kept: ContractWithPricing[],
  monthlyValues: Map<number, Record<string, number>>,
  cancelledNamesByContract: Map<number, string> = new Map(),
): ContractRow[] {
  const rows = kept.map((ec) => {
    const c = ec.contract as any;
    const ph = ec.priceHistory ?? {};

    const tags =
      c.contract_tags
        ?.map((tagItem: any) => tagItem.user_tags?.name)
        .filter(Boolean)
        .join(', ') || '';
    const owners = contractOwners(c);
    const businessSponsor = ownerSponsorNames(owners).join(', ');
    const businessGroup = ownerGroupNames(owners).join(', ');
    const productNames = ec.products
      .map((product) => product.name)
      .filter(Boolean)
      .join(', ');
    const isMultiYear = ph.subscriptionTerm && ph.subscriptionTerm > 12;

    return {
      id: ec.id,
      vendor: ph.vendor || '',
      product: productNames,
      termStartDate: ph.currentTermStartDate || '',
      termEndDate: ph.currentTermEndDate || '',
      // Mirrors the contracts table and calendar (psk-1855): the contract's
      // own cancel-by, else the notice date inherited from its parent MSA —
      // display-only since recognition is start-dated.
      cancelByDate: ph.cancelByDate || ec.inheritedCancelByDate?.date || '',
      renewalType: ph.renewalType || '',
      multiYearContract: isMultiYear ? 'Yes' : 'No',
      subscriptionTerm: ph.subscriptionTerm?.toString() || '',
      billingFrequency: ph.billingFrequency || '',
      currency: ph.currency || '',
      annualIncrease: ph.annualIncrease ? `${ph.annualIncrease}%` : '',
      businessSponsor,
      businessGroup,
      tags,
      monthlyValues: monthlyValues.get(ec.id) ?? {},
      cancelledProducts: cancelledNamesByContract.get(ec.id) || '',
    };
  });

  rows.sort((a, b) => a.vendor.localeCompare(b.vendor));
  return rows;
}
