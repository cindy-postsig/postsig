'use client';

import { OrgTable } from '@/components/settings/OrgTable';
import { useAbility } from '@/components/providers/AbilityProvider';

interface GroupContract {
  id: string;
  vendorName: string;
  vendorDomain?: string;
  product: string;
}

interface GroupContractsSectionProps {
  contracts: GroupContract[];
}

export function GroupContractsSection({
  contracts,
}: GroupContractsSectionProps) {
  const ability = useAbility();
  const canManageGroups = ability.can('manage', 'Group');

  const handleRevokeContract = (contractId: string) => {
    void contractId;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-base">
          Shared Contracts ({contracts.length})
        </h3>
      </div>

      <OrgTable
        data={contracts}
        columns={['vendor', 'actionsContracts']}
        onRemoveContract={canManageGroups ? handleRevokeContract : undefined}
        emptyStateMessage="No contracts assigned"
      />
    </div>
  );
}
