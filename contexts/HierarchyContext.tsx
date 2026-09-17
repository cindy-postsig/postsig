'use client';

import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { getHierarchyOrder } from '@/lib/utils/hierarchyOrder';
import { buildHierarchyProductsData } from '@/lib/contracts/hierarchyProductsData';
import {
  resolveRemovedProductIds,
  toChainContracts,
  type ProductLineageEventInput,
} from '@/lib/contracts/productLineageResolution';
import { UserContext } from '@/app/userProvider';

interface HierarchyContextValue {
  completeHierarchy: any;
  allContractsInHierarchy: any[];
  hierarchyOrder: (string | number)[];
  getContractDepth: (contractId: number) => number;
  calculateVisualDepthMap: (
    contracts: Array<{ contractId: number }>,
  ) => Map<number, number>;
  hierarchyProductsData: Array<{
    contractId: number;
    products: any;
    contractData: any;
  }>;
  fiscalYearStartMonth: number;
  /** contractId -> product ids struck by confirmed declarations (PSK-1830). */
  removedProductIdsByContract: Map<number, Set<number>>;
}

const HierarchyContext = createContext<HierarchyContextValue | null>(null);

// Stable reference: a fresh [] default would change identity every render and
// defeat the memo below.
const EMPTY_EVENTS: ProductLineageEventInput[] = [];

interface HierarchyProviderProps {
  completeHierarchy: any;
  allContractsInHierarchy: any[];
  /** Confirmed lineage events for this chain; defaults to none. */
  productLineageEvents?: ProductLineageEventInput[];
  children: React.ReactNode;
}

/**
 * Get the depth of a contract in the hierarchy (0 = root, 1 = first child, etc.)
 */
function getContractDepthRecursive(
  hierarchy: any,
  targetId: number,
  currentDepth = 0,
): number {
  if (!hierarchy) return 0;
  if (hierarchy.id === targetId) return currentDepth;

  if (hierarchy.children) {
    for (const child of hierarchy.children) {
      const depth = getContractDepthRecursive(
        child,
        targetId,
        currentDepth + 1,
      );
      if (depth > 0 || child.id === targetId) return depth;
    }
  }

  return 0;
}

export function HierarchyProvider({
  completeHierarchy,
  allContractsInHierarchy,
  productLineageEvents = EMPTY_EVENTS,
  children,
}: HierarchyProviderProps) {
  // Get fiscal year from UserContext
  const userContext = useContext(UserContext);
  const fiscalYearStartMonth = userContext?.userMetadata?.organizationFY || 1;
  // Memoize hierarchy order
  const hierarchyOrder = useMemo(
    () => getHierarchyOrder(completeHierarchy),
    [completeHierarchy],
  );

  // Memoize depth lookup map
  const depthMap = useMemo(() => {
    const map = new Map<number, number>();
    hierarchyOrder.forEach((id) => {
      const numId = typeof id === 'string' ? parseInt(id) : id;
      const depth = getContractDepthRecursive(completeHierarchy, numId);
      map.set(numId, depth);
    });
    return map;
  }, [completeHierarchy, hierarchyOrder]);

  // Memoized getContractDepth function
  const getContractDepth = useCallback(
    (contractId: number): number => {
      return depthMap.get(contractId) ?? 0;
    },
    [depthMap],
  );

  // Memoized calculateVisualDepthMap function
  const calculateVisualDepthMap = useCallback(
    (contracts: Array<{ contractId: number }>): Map<number, number> => {
      const visualDepthMap = new Map<number, number>();

      contracts.forEach((rc, idx) => {
        // Find nearest shown ancestor in contracts already processed
        let visualDepth = 0;
        for (let i = idx - 1; i >= 0; i--) {
          const potentialAncestorId = contracts[i].contractId;
          const ancestorAbsDepth = getContractDepth(potentialAncestorId);
          const currentAbsDepth = getContractDepth(rc.contractId);

          // If this previous contract is shallower in hierarchy, it's an ancestor
          if (ancestorAbsDepth < currentAbsDepth) {
            visualDepth = visualDepthMap.get(potentialAncestorId)! + 1;
            break;
          }
        }
        visualDepthMap.set(rc.contractId, visualDepth);
      });

      return visualDepthMap;
    },
    [getContractDepth],
  );

  // Memoize normalized hierarchy products data using extracted utility
  const hierarchyProductsData = useMemo(() => {
    return buildHierarchyProductsData(
      allContractsInHierarchy || [],
      fiscalYearStartMonth,
      completeHierarchy,
    );
  }, [allContractsInHierarchy, completeHierarchy, fiscalYearStartMonth]);

  // Resolve confirmed declarations against the chain once, rather than per
  // rendered contract. Empty events produce an empty map, so consumers behave
  // exactly as they did before this existed.
  const removedProductIdsByContract = useMemo(
    () =>
      resolveRemovedProductIds(
        productLineageEvents,
        toChainContracts(hierarchyProductsData),
      ),
    [productLineageEvents, hierarchyProductsData],
  );

  const value: HierarchyContextValue = {
    completeHierarchy,
    allContractsInHierarchy,
    hierarchyOrder,
    getContractDepth,
    calculateVisualDepthMap,
    hierarchyProductsData,
    fiscalYearStartMonth,
    removedProductIdsByContract,
  };

  return (
    <HierarchyContext.Provider value={value}>
      {children}
    </HierarchyContext.Provider>
  );
}

export function useHierarchy() {
  const context = useContext(HierarchyContext);
  if (!context) {
    throw new Error('useHierarchy must be used within a HierarchyProvider');
  }
  return context;
}
