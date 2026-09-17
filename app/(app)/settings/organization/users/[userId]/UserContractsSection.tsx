'use client';

import { OrgTable } from '@/components/settings/OrgTable';
import { ReaderIcon } from '@radix-ui/react-icons';

interface UserContract {
  id: string;
  vendorName: string;
  vendorDomain?: string;
  product: string;
  annualCost: number;
  currency: string;
  assignedAt: string;
}

interface UserContractsSectionProps {
  contracts: UserContract[];
}

// Transform UserContract to GroupContract format for the existing table
const transformContractsForTable = (contracts: UserContract[]) => {
  return contracts.map((contract) => ({
    id: contract.id,
    vendorName: contract.vendorName,
    vendorDomain: contract.vendorDomain,
    product: contract.product,
    annualCost: contract.annualCost,
    currency: contract.currency,
  }));
};

export function UserContractsSection({ contracts }: UserContractsSectionProps) {
  const handleRevokeContract = (contractId: string) => {
    // TODO: Implement contract revoke logic
    void contractId;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-base">
          Contracts ({contracts.length})
        </h3>
      </div>

      <OrgTable
        data={transformContractsForTable(contracts)}
        columns={['vendor', 'annualCost', 'actionsContracts']}
        onRemoveContract={handleRevokeContract}
        emptyStateMessage="No contracts assigned"
      />
    </div>
  );
}
