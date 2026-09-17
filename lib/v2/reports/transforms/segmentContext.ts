/**
 * Shared construction of the invoice report's SegmentFeeContext (PSK-1928).
 *
 * One recipe: the report pipeline's enrich step passes whatever lineage inputs
 * the runner threaded (full contract set, relationships, PSK-1830 cutoffs), and
 * anything absent is fetched here, so every surface prices invoices from the
 * same segments.
 */

import { addMonths } from 'date-fns';
import { logAlert } from '@/utils/logging/alert';
import { getUserMetadata } from '@/data/users';
import { fetchAllRelationshipsForOrg } from '@/data/superuser/contracts';
import { resolveProductFeeCutoffs } from '@/lib/contracts/resolveRemovedProductsForContracts';
import { contractsToChainContracts } from '@/lib/contracts/productLineageResolution';
import { getContractsList } from '@/lib/v2/contracts/service';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import type { RelationshipEdge } from '@/lib/v2/spend';
import {
  buildSegmentFeeContext,
  type SegmentFeeContext,
} from './expectedSegments';

export interface SegmentContextInputs {
  allContracts?: ContractWithPricing[];
  relationships?: RelationshipEdge[];
  cutoffsByContract?: Map<number, Map<number, Date>>;
}

export async function resolveSegmentFeeContext(
  inputs: SegmentContextInputs = {},
): Promise<SegmentFeeContext | undefined> {
  let organizationId: string | undefined;
  try {
    const userMetadata = await getUserMetadata();
    if (!userMetadata?.organizationId) return undefined;
    organizationId = userMetadata.organizationId;

    let { allContracts, relationships, cutoffsByContract } = inputs;
    if (!allContracts) {
      // One request-cached fetch supplies all three when the caller brought
      // nothing — the same result the report runner destructures.
      const result = await getContractsList();
      allContracts = result.contracts;
      relationships = relationships ?? result.relationships;
      cutoffsByContract = cutoffsByContract ?? result.cutoffsByContract;
    }

    const resolvedRelationships =
      relationships ??
      (await fetchAllRelationshipsForOrg(userMetadata.organizationId));
    const resolvedCutoffs =
      cutoffsByContract ??
      (await resolveProductFeeCutoffs({
        organizationId: userMetadata.organizationId,
        chainContracts: contractsToChainContracts(
          allContracts.map((ec) => ec.contract),
        ),
        relationships: resolvedRelationships,
      }));

    const asOf = new Date();
    // One shared horizon far enough past every invoice for its covering cycle
    // to be projected; shared so the segment memo never fragments.
    const horizonEnd = addMonths(asOf, 36);
    return buildSegmentFeeContext(
      allContracts,
      resolvedRelationships,
      resolvedCutoffs,
      asOf,
      horizonEnd,
    );
  } catch (error) {
    // The per-row transform falls back to the legacy fee walk — expected
    // fees quietly change denomination of truth, so a monitor must know.
    logAlert(
      'invoice-segment-context-failure',
      error,
      { organizationId },
      'Invoice segment fee context failed to build; legacy fee walk in use',
    );
    return undefined;
  }
}
