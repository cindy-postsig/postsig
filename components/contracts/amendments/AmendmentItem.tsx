'use client';

import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useHierarchy } from '@/contexts/HierarchyContext';
import { formatValue } from './formatters';
import { AMENDMENT_COLORS } from '../amendmentColors';

interface AmendmentData {
  contractId: number;
  value: any;
  isOriginal: boolean;
  relationship: 'current' | 'parent' | 'child';
  localAmendmentId?: string;
}

/**
 * Single amendment item component for rendering individual contract amendments
 * Memoized for performance
 */
export const AmendmentItem = memo<{
  relatedContract: AmendmentData;
  contractData: any;
  index: number;
  fieldKey?: string;
  allRelatedContracts?: AmendmentData[];
  currentContractData?: any;
  comparisonData?: any; // Pre-computed comparison data
  visualDepth?: number;
}>(
  ({
    relatedContract,
    contractData,
    index,
    fieldKey,
    allRelatedContracts,
    currentContractData,
    comparisonData,
    visualDepth = 0,
  }) => {
    // Get fiscal year from context for ProductTableRenderer
    const { fiscalYearStartMonth } = useHierarchy();

    const termStartDate =
      contractData?.termStartDate || contractData?.term_start_date?.[0]?.date;
    const isCurrentInChain = relatedContract.relationship === 'current';

    // Use visual depth (count of shown ancestors) for indentation
    const indentPx = visualDepth * 20;

    const badgeContent = (
      <Badge
        variant={isCurrentInChain ? 'default' : 'outline'}
        className={`pb-0.5 pt-[3px] text-[0.7rem] leading-tight ${
          !isCurrentInChain && 'cursor-pointer hover:bg-primary/10'
        }`}
      >
        {relatedContract.localAmendmentId || `ID-${relatedContract.contractId}`}
      </Badge>
    );

    return (
      <div
        key={`${relatedContract.contractId}-${index}`}
        className={`cursor-text rounded border p-4 ${
          isCurrentInChain
            ? `${AMENDMENT_COLORS.item.current.background} ${AMENDMENT_COLORS.item.current.border}`
            : `${AMENDMENT_COLORS.item.related.border} ${AMENDMENT_COLORS.item.related.background}`
        }`}
        style={{ marginLeft: `${indentPx}px` }}
      >
        <div
          className={`mb-3 ${isCurrentInChain && 'font-label text-xs text-muted-foreground'}`}
        >
          {isCurrentInChain ? (
            badgeContent
          ) : (
            <Link
              href={`/contracts/${relatedContract.contractId}`}
              onClick={(e) => e.stopPropagation()}
            >
              {badgeContent}
            </Link>
          )}
        </div>
        <div className={`font-serif ${isCurrentInChain && 'text-base'}`}>
          {formatValue(
            relatedContract.value,
            fieldKey,
            contractData,
            allRelatedContracts,
            currentContractData,
            comparisonData,
            fiscalYearStartMonth,
          )}
        </div>
      </div>
    );
  },
);

AmendmentItem.displayName = 'AmendmentItem';
