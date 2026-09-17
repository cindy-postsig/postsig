/**
 * Chat Tools - Payment Terms Tool
 *
 * Tool for summarizing payment terms across vendor contracts.
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import { getContractsListForLineageAI } from '@/lib/v2/contracts/service';
import { reverseContractTypeMap, contractTypes } from '@/app/lib/constants';
import { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import {
  isHierarchyEdge,
  type TypedRelationship,
} from '@/lib/contracts/relationshipEdges';
import { buildSummarizePaymentTermsToolDescription } from '@/lib/v2/chat/guidance/payment-terms-guidance';
import type {
  PaymentTermsToolOutput,
  PaymentTermsEntry,
  PaymentTermsLineageGroup,
  FlatPaymentTermsContract,
} from '@/lib/v2/chat/types';
import { buildContractLink } from '@/lib/v2/chat/transforms';

/**
 * Build a payment terms entry from an enriched contract
 */
function buildPaymentTermsEntry(c: {
  contract: {
    id: number;
    type_id?: number | string;
    billing_frequency?: string;
    currency?: string;
    payment_terms?: string;
    term_start_date?: Array<{ date: string }>;
    term_end_date?: Array<{ date: string }>;
  };
}): PaymentTermsEntry {
  return {
    id: c.contract.id,
    contractType:
      reverseContractTypeMap[
        c.contract.type_id as keyof typeof contractTypes
      ] || 'Unknown',
    billingFrequency: c.contract.billing_frequency || null,
    currency: c.contract.currency || null,
    paymentTerms: c.contract.payment_terms || null,
    termStartDate: c.contract.term_start_date?.[0]?.date || null,
    termEndDate: c.contract.term_end_date?.[0]?.date || null,
    hasPaymentTerms: !!(
      c.contract.billing_frequency || c.contract.payment_terms
    ),
    link: buildContractLink(c.contract.id),
  };
}

/**
 * Create the summarize_payment_terms tool
 * Summarizes payment terms for contracts by vendor
 */
export function createSummarizePaymentTermsTool(
  user: UserMetadata | null,
  cache: ChatToolCache,
) {
  return tool({
    description: buildSummarizePaymentTermsToolDescription(),
    inputSchema: z.object({
      vendorName: z
        .string()
        .describe('Vendor name to summarize payment terms for'),
    }),
    execute: async ({ vendorName }): Promise<PaymentTermsToolOutput> => {
      if (!user) {
        logger.warn('No user context for summarize_payment_terms tool.');
        return { error: 'User context not available' };
      }

      let contracts: Awaited<
        ReturnType<typeof getContractsListForLineageAI>
      >['contracts'];
      try {
        const contractFields = [
          'payment_terms',
          'term_start_date',
          'term_end_date',
          'billing_frequency',
          'currency',
        ] as const;
        const cacheKey = ChatToolCache.buildKey(
          'getContractsListForLineageAI',
          {
            contractFields: [...contractFields].sort(),
          },
        );
        const result = await cache.getOrFetch(cacheKey, () =>
          getContractsListForLineageAI({
            contractFields: [...contractFields],
          }),
        );
        contracts = result.contracts;
      } catch (err) {
        logger.error(
          { err, vendorName },
          'Failed to fetch contracts for payment terms tool',
        );
        return { error: 'Failed to retrieve contracts' };
      }

      const searchName = vendorName.toLowerCase();

      const filtered = contracts.filter((c) =>
        c.contract.vendors?.name?.toLowerCase().includes(searchName),
      );

      if (filtered.length === 0) {
        return {
          error: '_NO_RESULTS_',
          noResults: true,
          searchedBy: 'vendorName',
          searchTerm: vendorName,
          suggestion: 'Try a different vendor name or check spelling',
        };
      }

      const contractMap = new Map(filtered.map((c) => [c.contract.id, c]));

      // Keep only hierarchy edges whose parent is loaded, in a total order.
      //
      // Billing edges name an invoice's extra payer, not its structural parent
      // — grouping by one would report the invoice's terms under a lineage it
      // does not belong to.
      //
      // The sort matters because `parentMap` below is first-edge-wins and the
      // relationships fetch issues no ORDER BY: a child with two hierarchy
      // parents (or a duplicate row) could otherwise be grouped under whichever
      // Postgres returned last, differing request to request. Same
      // (parent, child) ascending treatment as `orderedEdges` in
      // lib/v2/spend/members.ts.
      const orderedEdges: Array<{ parentId: number; childId: number }> = [];
      filtered.forEach((c) => {
        const relations = c.contract.contract_relationships || [];
        relations.forEach(
          (rel: { parent_contract_id?: number } & TypedRelationship) => {
            if (!isHierarchyEdge(rel)) return;
            const parentId = rel.parent_contract_id;
            if (!parentId || !contractMap.has(parentId)) return;
            orderedEdges.push({ parentId, childId: c.contract.id });
          },
        );
      });
      orderedEdges.sort(
        (a, b) => a.parentId - b.parentId || a.childId - b.childId,
      );

      const parentMap = new Map<number, number>();
      orderedEdges.forEach(({ parentId, childId }) => {
        // First parent wins, so a diamond resolves to one lineage instead of
        // the last edge iterated silently displacing the earlier one.
        if (parentMap.has(childId)) return;
        parentMap.set(childId, parentId);
      });

      const rootContracts = filtered.filter(
        (c) => !parentMap.has(c.contract.id),
      );

      const findChildren = (parentId: number) => {
        return filtered.filter(
          (c) => parentMap.get(c.contract.id) === parentId,
        );
      };

      const lineageGroups: PaymentTermsLineageGroup[] = rootContracts.map(
        (root) => {
          const rootEntry = buildPaymentTermsEntry(root);
          const children = findChildren(root.contract.id);
          const childEntries = children.map(buildPaymentTermsEntry);

          const allInLineage = [rootEntry, ...childEntries];
          const governingContract =
            allInLineage.find((e) => e.hasPaymentTerms) || null;

          return {
            rootContract: rootEntry,
            childContracts: childEntries,
            governingContract,
          };
        },
      );

      const accountedIds = new Set<number>();
      lineageGroups.forEach((g) => {
        accountedIds.add(g.rootContract.id);
        g.childContracts.forEach((c) => accountedIds.add(c.id));
      });

      const orphans = filtered
        .filter((c) => !accountedIds.has(c.contract.id))
        .map((c) => {
          const entry = buildPaymentTermsEntry(c);
          return {
            rootContract: entry,
            childContracts: [] as PaymentTermsEntry[],
            governingContract: entry.hasPaymentTerms ? entry : null,
          };
        });

      const allGroups = [...lineageGroups, ...orphans];

      const flatContracts: FlatPaymentTermsContract[] = allGroups.flatMap(
        (g) => [
          {
            ...g.rootContract,
            isRoot: true,
            governedBy: g.governingContract?.id,
          },
          ...g.childContracts.map((c) => ({
            ...c,
            isRoot: false,
            governedBy: g.governingContract?.id,
          })),
        ],
      );

      return {
        type: 'payment_terms_summary',
        vendorName: filtered[0]?.contract.vendors?.name || vendorName,
        contractCount: filtered.length,
        lineageGroups: allGroups.length,
        contracts: flatContracts,
        summary: `Found ${filtered.length} ${vendorName} contract(s) in ${allGroups.length} lineage group(s).`,
      };
    },
  });
}
