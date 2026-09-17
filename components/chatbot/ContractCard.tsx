'use client';

import VendorIcon from '@/components/vendors/VendorIcon';
import { ContractLink } from './ContractLink';
import { DISPLAY_RESULT_LIMIT } from '@/lib/v2/chat/client';

interface ContractCardProps {
  contractId: number;
  vendorName: string;
  contractType: string;
  label?: string;
  summary?: string;
}

export function ContractCard({
  contractId,
  vendorName,
  contractType,
  label,
  summary,
}: ContractCardProps) {
  return (
    <div className="not-prose rounded border border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center">
          <VendorIcon name={vendorName} width={32} height={32} />
        </div>
        <ContractLink
          contractId={contractId}
          className="min-w-0 text-foreground no-underline hover:text-foreground hover:underline"
        >
          <div className="font-medium truncate font-sans text-sm">
            {vendorName}
          </div>
          <div className="font-normal truncate font-sans text-xs">
            {contractType}
          </div>
        </ContractLink>
      </div>
      {label && (
        <div className="font-semibold mt-2 font-sans-neue text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      )}
      {summary && (
        <div className="font-light mt-1 font-serif text-sm text-foreground">
          {summary}
        </div>
      )}
    </div>
  );
}

interface ContractCardListProps {
  contracts: Array<{
    contractId: number;
    vendorName: string;
    contractType: string;
    label?: string;
    summary?: string;
  }>;
  maxItems?: number;
}

export function ContractCardList({
  contracts,
  maxItems = DISPLAY_RESULT_LIMIT,
}: ContractCardListProps) {
  const displayContracts = contracts.slice(0, maxItems);
  const remainingCount = contracts.length - maxItems;

  return (
    <div className="flex flex-col gap-2">
      {displayContracts.map((contract) => (
        <ContractCard
          key={contract.contractId}
          contractId={contract.contractId}
          vendorName={contract.vendorName}
          contractType={contract.contractType}
          label={contract.label}
          summary={contract.summary}
        />
      ))}
      {remainingCount > 0 && (
        <p className="text-xs text-muted-foreground">
          +{remainingCount} more contract{remainingCount !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
