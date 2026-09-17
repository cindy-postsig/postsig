import { cache } from 'react';
import { fetchCompleteAmendmentChain } from '@/app/lib/contracts/actions';
import type { ContractHierarchy } from '@/lib/amendments/hierarchyUtils';
import logger from '@/utils/pino';

/**
 * Contract in an amendment chain with local ID for display.
 */
export interface AmendmentContract {
  id: number;
  localId: string;
  [key: string]: unknown;
}

/**
 * Result of fetching an amendment chain.
 */
export interface AmendmentChainResult {
  /** Parent contract in the chain, null if this is the root */
  parentContract: AmendmentContract | null;
  /** The current contract with local ID */
  currentContract: AmendmentContract | null;
  /** Child contracts (addendums) */
  childContracts: Array<AmendmentContract & { localAmendmentId?: string }>;
  /** Complete hierarchy tree structure */
  completeHierarchy: ContractHierarchy | null;
  /** All contracts in the hierarchy with local IDs */
  allContractsInHierarchy: AmendmentContract[];
}

/**
 * Get the amendment chain for a contract.
 * Returns the complete hierarchy including parent, current, and child contracts.
 * Each contract is enriched with a local ID for display (e.g., "MSA-1", "ADD-2").
 * Cached per request for deduplication.
 */
export const getAmendmentChain = cache(
  async (contractId: number): Promise<AmendmentChainResult> => {
    try {
      const result = await fetchCompleteAmendmentChain(contractId);

      // Handle empty result (user lacks access or error)
      if (!result.currentContract || !result.currentContract.id) {
        return {
          parentContract: null,
          currentContract: null,
          childContracts: [],
          completeHierarchy: null,
          allContractsInHierarchy: [],
        };
      }

      return {
        parentContract: result.parentContract as AmendmentContract | null,
        currentContract: {
          ...result.currentContract,
          localId:
            (
              result.allContractsInHierarchy.find(
                (c) => c.id === result.currentContract.id,
              ) as AmendmentContract | undefined
            )?.localId || '',
        } as AmendmentContract,
        childContracts: result.childContracts.map((c) => ({
          ...c,
          localId:
            (
              result.allContractsInHierarchy.find((hc) => hc.id === c.id) as
                | AmendmentContract
                | undefined
            )?.localId || '',
        })) as Array<AmendmentContract & { localAmendmentId?: string }>,
        completeHierarchy: result.completeHierarchy,
        allContractsInHierarchy:
          result.allContractsInHierarchy as AmendmentContract[],
      };
    } catch (error) {
      logger.error({ error, contractId }, 'Error fetching amendment chain');
      return {
        parentContract: null,
        currentContract: null,
        childContracts: [],
        completeHierarchy: null,
        allContractsInHierarchy: [],
      };
    }
  },
);

// Re-export ContractHierarchy type for consumers
export type { ContractHierarchy };
