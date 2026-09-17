/**
 * DORA Report Transform
 *
 * Extends base contract table row with DORA-specific fields.
 */

import {
  buildContractTableRow,
  buildProductSubRows,
} from '@/lib/v2/contracts/transforms';
import { calculateDoraScore } from '@/app/lib/contracts/dora';
import { EnrichedContract } from '@/lib/v2/contracts/service';
import { ProcessedContract } from '@/app/lib/definitions';

export const categoryLabels: Record<string, string> = {
  productDescription: 'Product Description',
  vendorLocation: 'Vendor Location',
  dataIntegrity: 'Data Integrity',
  dataRecovery: 'Data Recovery',
  serviceLevelAgreement: 'Service Level Agreement',
  costMitigation: 'Incident Cost Mitigation',
  arbitrationAndConflictResolution: 'Conflict Resolution',
  timelyTermination: 'Timely Termination',
  securityAwareness: 'Security Awareness',
};

export interface DoraReportRow extends ProcessedContract {
  doraScore: { score: number; details: Record<string, boolean> };
  doraScoreValue: number;
  missingDoraCategories: string[];
  hasICTVendor: boolean;
}

export interface DoraSubRow {
  id: string;
  contract_id: number;
  isMissingDoraCategoriesRow: boolean;
  isReportRow: boolean;
  missingDoraCategories: string[];
}

/**
 * Build a DORA report row from an enriched contract.
 */
export function buildDoraReportRow(contract: EnrichedContract): DoraReportRow {
  const base = buildContractTableRow(contract);
  const doraScore = calculateDoraScore(contract.contract);
  const missingDoraCategories = getMissingCategories(doraScore);

  // Build product subRows for multi-product contracts
  const productSubRows = buildProductSubRows(contract, base);

  // Build report-specific subrows if score < 9 and there are missing categories
  const reportSubRows =
    doraScore.score < 9 && missingDoraCategories.length > 0
      ? [
          {
            id: `report-dora-${contract.id}`,
            contract_id: contract.id,
            isMissingDoraCategoriesRow: true,
            isReportRow: true,
            missingDoraCategories,
          },
        ]
      : [];

  const subRows = [...productSubRows, ...reportSubRows];

  return {
    ...base,
    doraScore,
    doraScoreValue: doraScore.score,
    missingDoraCategories,
    hasICTVendor: contract.contract.vendors?.ict_provider === true,
    subRows: subRows.length > 0 ? subRows : undefined,
  } as DoraReportRow;
}

/**
 * Extract missing category names from DORA score details.
 */
export function getMissingCategories(doraScore: {
  score: number;
  details: Record<string, boolean>;
}): string[] {
  return Object.entries(doraScore.details)
    .filter(([_, satisfied]) => !satisfied)
    .map(([category]) => categoryLabels[category] || category);
}
