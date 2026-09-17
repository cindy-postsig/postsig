/**
 * NDA Report Transform
 *
 * Extends base contract table row with NDA risk-specific fields.
 */

import { buildContractTableRow } from '@/lib/v2/contracts/transforms';
import { EnrichedContract } from '@/lib/v2/contracts/service';
import { ContractTableRow } from '@/lib/v2/core/types';
import { calculateExtendedTermEndDate } from '@/lib/utils';
import _ from 'lodash';

export interface NdaReportRow extends ContractTableRow {
  ndaRiskLevel: 1 | 2 | 3;
  ndaRiskFlags: number;
  ndaInsights: Record<string, boolean>;
}

/**
 * Build an NDA report row from an enriched contract.
 */
export function buildNdaReportRow(contract: EnrichedContract): NdaReportRow {
  const base = buildContractTableRow(contract);

  // Extract NDA fields from the other_attributes JSONB column
  const ndaFields = _.get(
    contract.contract,
    ['other_attributes', 'nda_fields'],
    {},
  );
  const ndaInsights = ndaFields.nda_insights || {};

  // Calculate extended term end date (extended confidentiality period)
  const termEndDate = contract.contract.term_end_date?.[0]?.date || null;
  const extendedTermEndDate = calculateExtendedTermEndDate(
    termEndDate,
    ndaFields.extended_confidentiality_period,
  );

  // Count risk flags for NDA risk level
  const riskFlags = Object.values(ndaInsights).filter(Boolean).length;

  // Calculate risk level (0 = 1, 1-3 = 2, 4+ = 3)
  let ndaRiskLevel: 1 | 2 | 3 = 1;
  if (riskFlags >= 4) {
    ndaRiskLevel = 3;
  } else if (riskFlags >= 1) {
    ndaRiskLevel = 2;
  }

  return {
    ...base,
    ndaRiskLevel,
    ndaRiskFlags: riskFlags,
    ndaInsights,
    extendedTermEndDate,
  };
}
