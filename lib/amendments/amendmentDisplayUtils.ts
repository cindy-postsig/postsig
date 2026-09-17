import { buildCompleteAmendmentChain } from './amendmentService';

/**
 * Shared utility for rendering amendments consistently across components
 */
export interface AmendmentDisplayConfig {
  fieldKey: string;
  currentContract: any;
  hierarchy?: any;
  allContractsInHierarchy?: any[];
}

/**
 * Check if a field has amendments that should be displayed
 */
export function hasAmendments(config: AmendmentDisplayConfig): boolean {
  const { fieldKey, currentContract, hierarchy, allContractsInHierarchy } =
    config;

  if (!fieldKey || !currentContract) return false;

  const amendmentResult = buildCompleteAmendmentChain(
    currentContract,
    fieldKey,
    hierarchy,
    allContractsInHierarchy,
  );

  return amendmentResult?.hasAmendmentChain || false;
}

/**
 * Get amendment data for a field
 */
export function getAmendmentData(config: AmendmentDisplayConfig) {
  const { fieldKey, currentContract, hierarchy, allContractsInHierarchy } =
    config;

  if (!fieldKey || !currentContract) return null;

  // Just call the service directly - React will memoize in components
  return buildCompleteAmendmentChain(
    currentContract,
    fieldKey,
    hierarchy,
    allContractsInHierarchy,
  );
}

/**
 * Standardized props for amendment accordion components
 */
export interface StandardAmendmentProps {
  fieldKey: string;
  fieldTitle: string;
  currentValue: any;
  amendmentData: ReturnType<typeof buildCompleteAmendmentChain>;
  citations?: any;
  className?: string;
}

/**
 * Convert amendment chain data to format expected by AmendmentAccordion
 */
export function formatForAccordion(
  amendmentData: ReturnType<typeof buildCompleteAmendmentChain>,
) {
  if (!amendmentData || !amendmentData.hasAmendmentChain) {
    return null;
  }

  return {
    relatedContracts: amendmentData.amendmentChain.map((item) => ({
      contractId: item.contractId,
      value: item.value,
      isOriginal: item.isOriginal,
      relationship:
        item.chainPosition === 'current' ? 'current' : item.relationship,
      localAmendmentId: item.localAmendmentId, // Include local amendment ID for display
    })),
    fullContractData: amendmentData.amendmentChain,
  };
}
