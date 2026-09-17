'use client';

import React, { memo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import CitationField from '@/components/contracts/CitationField';
import { Citation } from '@/constants/types';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import Link from 'next/link';
import { formatJsxField } from '@/components/contracts/FieldFormatters';
import { getHierarchyOrder } from '@/lib/utils/hierarchyOrder';
import { ProductTableRenderer } from '@/components/contracts/ProductTableRenderer';
import { useHierarchy } from '@/contexts/HierarchyContext';
import { useFilteredLineageData } from '@/hooks/useFilteredLineageData';
import { AmendmentItem } from './AmendmentItem';
import { ProductSummary } from './ProductSummary';
import { createProductComparison } from './productComparisonUtils';
import { formatValue } from './formatters';
import { AMENDMENT_COLORS } from '../amendmentColors';

interface AmendmentData {
  contractId: number;
  value: any;
  isOriginal: boolean;
  relationship: 'current' | 'parent' | 'child';
  localAmendmentId?: string;
}

interface AmendmentAccordionProps {
  fieldKey: string;
  fieldTitle: string;
  currentValue: any;
  relatedContracts: AmendmentData[];
  currentContractId?: number;
  viewContext: 'parent' | 'child' | 'standalone' | 'chain';
  citations?: Citation;
  className?: string;
  isHistoryOpen?: boolean;
  onToggleHistory?: (isOpen: boolean) => void;
}

/**
 * Helper function to get labels based on view context
 */
function getAmendmentLabels(viewContext: string, relatedCount: number) {
  switch (viewContext) {
    case 'parent':
      return {
        badgeText: `${relatedCount} amendment${relatedCount > 1 ? 's' : ''}`,
        description: `${relatedCount} contract${relatedCount > 1 ? 's' : ''} mention${relatedCount > 1 ? '' : 's'} this term`,
      };
    case 'child':
      return {
        badgeText: `View original${relatedCount > 1 ? ` + ${relatedCount - 1} other${relatedCount > 2 ? 's' : ''}` : ''}`,
        description: 'Original field value from parent contract:',
      };
    case 'chain':
      return {
        badgeText: `Updates (${relatedCount})`,
        description: 'Complete amendment timeline showing all versions:',
      };
    default:
      return {
        badgeText: `${relatedCount} related contract${relatedCount > 1 ? 's' : ''}`,
        description: 'This field differs in related contracts:',
      };
  }
}

const AmendmentAccordion = memo<AmendmentAccordionProps>(
  ({
    fieldKey,
    fieldTitle,
    currentValue,
    relatedContracts,
    currentContractId,
    viewContext,
    citations,
    className = '',
    isHistoryOpen = false,
    onToggleHistory,
  }) => {
    // Get hierarchy data from context
    const {
      hierarchyProductsData,
      calculateVisualDepthMap,
      completeHierarchy,
      removedProductIdsByContract,
    } = useHierarchy();

    // Filter hierarchyProductsData to only include contracts in the direct lineage
    // This ensures product comparisons only consider ancestors + current + descendants (no siblings/cousins)
    // Unlike relatedContracts which only includes contracts with DIFFERENT values,
    // we need ALL lineage contracts for proper product comparison logic
    const filteredHierarchyProductsData = useFilteredLineageData(
      hierarchyProductsData,
      currentContractId,
      completeHierarchy,
    );

    // Create comparison data using filtered hierarchy data
    const contractComparisonMap = React.useMemo(() => {
      const map = new Map<number, any>();

      if (
        fieldKey === 'products_licensed' &&
        filteredHierarchyProductsData.length > 0
      ) {
        relatedContracts.forEach((relatedContract) => {
          const comparisonData = createProductComparison(
            relatedContract.contractId,
            filteredHierarchyProductsData,
            completeHierarchy?.id, // Pass topmost parent ID
            removedProductIdsByContract.get(relatedContract.contractId),
          );

          map.set(relatedContract.contractId, comparisonData);
        });
      }

      return map;
    }, [
      fieldKey,
      filteredHierarchyProductsData,
      relatedContracts,
      completeHierarchy,
      removedProductIdsByContract,
    ]);
    // For chain view, show all contracts; for others, filter out current
    let relatedOnly =
      viewContext === 'chain'
        ? relatedContracts
        : relatedContracts.filter(
            (contract) => contract.relationship !== 'current',
          );

    // For products field, further filter to only show contracts in filtered hierarchy
    // This ensures we don't try to render contracts that have no product data in our lineage
    if (
      fieldKey === 'products_licensed' &&
      filteredHierarchyProductsData.length > 0
    ) {
      const filteredProductContractIds = new Set(
        filteredHierarchyProductsData.map((h) => h.contractId),
      );
      relatedOnly = relatedOnly.filter((contract) =>
        filteredProductContractIds.has(contract.contractId),
      );
    }

    if (relatedOnly.length === 0) {
      return null; // Parent component will handle displaying the original field
    }

    // For products field, count only contracts that actually have products
    // This ensures the badge count matches what's displayed in the accordion
    let relatedCount = relatedOnly.length;
    if (fieldKey === 'products_licensed') {
      relatedCount = relatedOnly.filter((relatedContract) => {
        const hierarchyContract = filteredHierarchyProductsData.find(
          (h) => h.contractId === relatedContract.contractId,
        );
        return (
          hierarchyContract?.products &&
          Object.keys(hierarchyContract.products).length > 0
        );
      }).length;

      // If no contracts with products remain after filtering, don't show the accordion
      if (relatedCount === 0) {
        return null;
      }
    }

    const labels = getAmendmentLabels(viewContext, relatedCount);

    const handleValueChange = (value: string) => {
      const newIsOpen = !!value;
      if (onToggleHistory) {
        onToggleHistory(newIsOpen);
      }
    };

    // Helper function to render amendment items with proper visual depth
    const renderAmendmentItems = () => {
      // For products field, filter out contracts with no products before rendering
      const contractsToRender =
        fieldKey === 'products_licensed'
          ? relatedOnly.filter((relatedContract) => {
              const hierarchyContract = filteredHierarchyProductsData.find(
                (h) => h.contractId === relatedContract.contractId,
              );
              // Only show contracts that have products
              return (
                hierarchyContract?.products &&
                Object.keys(hierarchyContract.products).length > 0
              );
            })
          : relatedOnly;

      const visualDepthMap = calculateVisualDepthMap(contractsToRender);

      return contractsToRender.map((relatedContract, index) => {
        const hierarchyContract = filteredHierarchyProductsData.find(
          (h) => h.contractId === relatedContract.contractId,
        );

        return (
          <AmendmentItem
            key={`${relatedContract.contractId}-${index}`}
            relatedContract={relatedContract}
            contractData={hierarchyContract?.contractData}
            index={index}
            fieldKey={fieldKey}
            allRelatedContracts={relatedContracts}
            currentContractData={
              filteredHierarchyProductsData.find(
                (h) => h.contractId === currentContractId,
              )?.contractData
            }
            comparisonData={contractComparisonMap.get(
              relatedContract.contractId,
            )}
            visualDepth={visualDepthMap.get(relatedContract.contractId) || 0}
          />
        );
      });
    };

    // Check if we should show the product summary
    const shouldShowProductSummary =
      fieldKey === 'products_licensed' &&
      filteredHierarchyProductsData.length > 0;

    // Render the summary to check if there are changes
    const summaryElement = shouldShowProductSummary ? (
      <ProductSummary
        fieldKey={fieldKey}
        hierarchyProductsData={filteredHierarchyProductsData}
      />
    ) : null;

    // If products field with no changes, don't show the accordion
    if (shouldShowProductSummary && summaryElement === null) {
      return null;
    }

    return (
      <div className={className} onClick={(e) => e.stopPropagation()}>
        <Accordion
          type="single"
          collapsible
          className="w-full"
          value={isHistoryOpen ? `related-${fieldKey}` : ''}
          onValueChange={handleValueChange}
        >
          <AccordionItem value={`related-${fieldKey}`} className="border-none">
            <AccordionTrigger
              className="px-0 py-2 hover:no-underline"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-xs ${AMENDMENT_COLORS.trigger.border} ${AMENDMENT_COLORS.trigger.background} ${AMENDMENT_COLORS.trigger.text} ${AMENDMENT_COLORS.trigger.backgroundHover} ${AMENDMENT_COLORS.trigger.darkBorder} ${AMENDMENT_COLORS.trigger.darkBackground} ${AMENDMENT_COLORS.trigger.darkText}`}
                >
                  <div className="flex items-center gap-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="10"
                      viewBox="0 0 24 20"
                      fill="none"
                      className="fill-blue-600 dark:fill-blue-200"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M21.2093 2.70269H0V0H24V7.027H0V4.32431H21.2093V2.70269Z"
                        fill="currentColor"
                      />
                      <path
                        d="M24 11.3514H2.7907V12.973H24V20H0V17.2973H21.2093V15.6757H0V8.64869H24V11.3514Z"
                        fill="currentColor"
                      />
                    </svg>
                    {labels.badgeText}
                  </div>
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 pt-0">
              <div
                className={`ml-1 space-y-3 border-l-2 pl-4 ${AMENDMENT_COLORS.contentBorder.border} ${AMENDMENT_COLORS.contentBorder.darkBorder}`}
                onClick={(e) => e.stopPropagation()}
              >
                {summaryElement}
                <div className="mt-2 space-y-3">{renderAmendmentItems()}</div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    );
  },
);

AmendmentAccordion.displayName = 'AmendmentAccordion';

export default AmendmentAccordion;
