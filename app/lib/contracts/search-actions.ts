'use server';

import { getContractsList } from '@/lib/v2/contracts/service';
import { buildContractTableRows } from '@/lib/v2/contracts/transforms';
import { type ContractTableRow } from '@/lib/v2/core/types';
import { contractMatchesQuery } from './filtering';

/**
 * Header typeahead. Filters the request-cached enriched set in memory instead
 * of re-querying the database per keystroke; lives in its own module because
 * lib/v2/contracts/service imports from ./actions.
 */
export async function searchContracts(
  query: string,
): Promise<ContractTableRow[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Invoices have their own list/report views and search (the dedicated
  // Invoices module) — this app-wide quicksearch never surfaces them,
  // matching every Contracts list view. Excluding them in the fetch itself
  // skips pricing/engine-spend enrichment for rows this search never wanted.
  const { contracts } = await getContractsList({ excludeInvoices: true });
  const matches = contracts.filter((enriched) =>
    contractMatchesQuery(enriched.contract, trimmed),
  );

  return buildContractTableRows(matches, {
    includeProductSubRows: false,
  }) as ContractTableRow[];
}
