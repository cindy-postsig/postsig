/**
 * Trial Report Transform
 *
 * Extends base contract table row with trial-specific fields.
 */

import { buildContractTableRow } from '@/lib/v2/contracts/transforms';
import { EnrichedContract } from '@/lib/v2/contracts/service';
import { ContractTableRow } from '@/lib/v2/core/types';

export interface TrialReportRow extends ContractTableRow {
  daysRemaining: number;
}

/**
 * Build a trial report row from an enriched contract.
 */
export function buildTrialReportRow(
  contract: EnrichedContract,
): TrialReportRow {
  const base = buildContractTableRow(contract);

  // Calculate days remaining until term end
  let daysRemaining = 0;
  const termEndDate = base.termEndDate;

  if (termEndDate) {
    try {
      const parsedDate = new Date(termEndDate);
      if (!isNaN(parsedDate.getTime())) {
        const days = Math.ceil(
          (parsedDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
        );
        daysRemaining = days > 0 ? days : 0;
      }
    } catch {
      daysRemaining = 0;
    }
  }

  return {
    ...base,
    daysRemaining,
  };
}
