/**
 * Contract Omissions Report Pipeline Definition
 */

import { ReportPipeline, FilterResult } from '../pipeline/types';
import { EnrichedContract } from '@/lib/v2/contracts/service';
import {
  buildMissingClausesRows,
  MissingClausesReportRow,
  getMissingFields,
} from '../transforms/missing-clauses';
import { MissingClausesContext } from '../filters';

interface ContractOmissionsOptions {
  missingClauseSettings?: string[] | null;
}

export const contractOmissionsReport: ReportPipeline<
  ContractOmissionsOptions,
  MissingClausesContext,
  MissingClausesReportRow
> = {
  filter: (contracts, options): FilterResult<MissingClausesContext> => {
    const { missingClauseSettings } = options || {};

    // If no settings configured, return empty
    if (!missingClauseSettings) {
      return { contracts: [], context: new Map() };
    }

    const filtered: EnrichedContract[] = [];
    const missingClausesMap: MissingClausesContext = new Map();

    for (const contract of contracts) {
      const missingClauses = getMissingFields(
        contract.contract,
        missingClauseSettings,
      );
      if (missingClauses.length > 0) {
        missingClausesMap.set(contract.id, missingClauses);
        filtered.push(contract);
      }
    }

    return { contracts: filtered, context: missingClausesMap };
  },

  transform: (contracts, context) =>
    buildMissingClausesRows(contracts, context),

  metadata: {
    requiresSettings: true,
  },
};
