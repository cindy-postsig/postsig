'use client';

import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import Link from 'next/link';
import { useHierarchy } from '@/contexts/HierarchyContext';
import { AMENDMENT_COLORS } from './amendmentColors';

interface AmendmentData {
  contractId: number;
  value: any;
  isOriginal: boolean;
  relationship: 'current' | 'parent' | 'child';
}

interface CompactAmendmentPopoverProps {
  fieldKey: string;
  fieldTitle: string;
  relatedContracts: AmendmentData[];
  fullContractData?: any[];
  className?: string;
}

function formatCompactValue(value: any): string {
  if (!value) return 'N/A';

  // Handle arrays (like date objects)
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object' && value[0].date) {
      return value[0].date;
    }
    return value.join(', ');
  }

  // Handle objects
  if (typeof value === 'object') {
    if (value.date) return value.date;
    if (value.name) return value.name;
    return JSON.stringify(value);
  }

  // Handle strings - capitalize first letter
  if (typeof value === 'string') {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  return String(value);
}

const CompactAmendmentPopover = memo<CompactAmendmentPopoverProps>(
  ({
    fieldKey,
    fieldTitle,
    relatedContracts,
    fullContractData = [],
    className = '',
  }) => {
    // Get hierarchy data from context
    const { calculateVisualDepthMap } = useHierarchy();
    if (relatedContracts.length === 0) {
      return null;
    }

    const relatedCount = relatedContracts.filter(
      (contract) => contract.relationship !== 'current',
    ).length;

    if (relatedCount === 0) {
      return null;
    }

    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={`font-normal ml-1 inline-flex cursor-pointer items-center rounded-full border px-1.5 py-0.5 font-label text-xs ${AMENDMENT_COLORS.trigger.border} ${AMENDMENT_COLORS.trigger.background} ${AMENDMENT_COLORS.trigger.text} ${AMENDMENT_COLORS.trigger.backgroundHover} ${AMENDMENT_COLORS.trigger.darkBorder} ${AMENDMENT_COLORS.trigger.darkBackground} ${AMENDMENT_COLORS.trigger.darkText}`}
            onClick={(e) => e.stopPropagation()}
          >
            {relatedCount}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-96 bg-card p-3" align="start">
          <div className="space-y-2">
            <div className="space-y-2">
              <div className="font-bold font-label text-sm">
                Updates ({relatedCount})
              </div>
              {(() => {
                // Calculate visual depth: count only shown ancestors (not absolute hierarchy depth)
                const visualDepthMap =
                  calculateVisualDepthMap(relatedContracts);

                return relatedContracts.map((relatedContract, index) => {
                  const contractData = fullContractData.find(
                    (contract) =>
                      (contract.id || contract.contractId) ===
                      relatedContract.contractId,
                  );

                  const isCurrentInChain =
                    relatedContract.relationship === 'current';

                  // Use visual depth (count of shown ancestors) for indentation
                  const visualDepth =
                    visualDepthMap.get(relatedContract.contractId) || 0;
                  const indentPx = visualDepth * 12; // 12px per level for compact view

                  return (
                    <div
                      key={`${relatedContract.contractId}-${index}`}
                      className={`flex items-center gap-3 rounded border p-2 ${
                        isCurrentInChain
                          ? `${AMENDMENT_COLORS.item.current.background} ${AMENDMENT_COLORS.item.current.border}`
                          : `${AMENDMENT_COLORS.item.related.background} ${AMENDMENT_COLORS.item.related.border}`
                      }`}
                      style={{ marginLeft: `${indentPx}px` }}
                    >
                      <div className="flex w-14 flex-shrink-0 items-center">
                        {!isCurrentInChain ? (
                          <Link
                            href={`/contracts/${relatedContract.contractId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center"
                          >
                            <Badge
                              variant="outline"
                              className="cursor-pointer text-[0.7rem] leading-tight hover:bg-primary/10"
                            >
                              {contractData?.localId ||
                                contractData?.localAmendmentId ||
                                `ID-${relatedContract.contractId}`}
                            </Badge>
                          </Link>
                        ) : (
                          <Badge
                            variant="default"
                            className="text-[0.7rem] leading-tight"
                          >
                            {contractData?.localId ||
                              contractData?.localAmendmentId ||
                              `ID-${relatedContract.contractId}`}
                          </Badge>
                        )}
                      </div>
                      <div className="flex-1 font-serif text-sm">
                        {formatCompactValue(relatedContract.value)}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);

CompactAmendmentPopover.displayName = 'CompactAmendmentPopover';

export default CompactAmendmentPopover;
