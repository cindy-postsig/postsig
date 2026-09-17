import { cache } from 'react';
import { isInvoiceType } from '@/app/lib/constants';
import { getCacheService } from '@/app/lib/redis/cache-service';
import { getUserMetadata } from '@/data/users';
import {
  getContractsList,
  getArchivedContracts,
  type EnrichedContract,
} from '@/lib/v2/contracts/service';
import { buildContractTableRow } from '@/lib/v2/contracts/transforms';
import {
  getInvoiceValidations,
  type InvoiceValidation,
} from '@/lib/v2/invoices/validation';
import type { InvoiceRow } from '@/components/invoices/InvoicesTable';
import {
  classifyInvoiceFolders,
  computeInvoiceStats,
  isInvoiceDiscrepant,
  type InvoiceFolder,
  type InvoiceStats,
} from '@/lib/v2/invoices/folders';

export {
  INVOICE_FOLDERS,
  classifyInvoiceFolders,
  shouldShowInvoiceStatusFilter,
  isInvoiceDiscrepant,
  toDiscrepancyStat,
  type InvoiceFolder,
  type InvoiceStat,
  type InvoiceStats,
} from '@/lib/v2/invoices/folders';

// Matches the base contract-set cache's real TTL (app/lib/contracts/actions.ts's
// cacheContractSet calls, not that method's unused 900s default) — same
// staleness window an invoice-status integration sync already accepts today.
const INVOICE_VALIDATIONS_CACHE_TTL = 3600;

/**
 * Checks the per-org Redis cache before redoing the expensive discrepancy
 * computation (Service Order matching, FX lookups) — invalidated by the
 * same `invalidateOrganizationData` calls that clear the contract-set cache.
 *
 * `invoices` is already ACL-filtered to what the calling user can see
 * (getContractsList() applies that per request), but the cache entry is
 * org-wide and was populated by whichever user happened to fill it first —
 * which could have a narrower ACL scope than the current caller. A cache
 * entry that doesn't cover every invoice this caller can see is stale for
 * this view and must be treated as a miss, or a low-visibility user (e.g.
 * one with no ACL grants at all) would silently zero out discrepancy data
 * for every other user in the org until the TTL expires.
 */
async function getCachedInvoiceValidations(
  invoices: EnrichedContract[],
  supplementalKey: 'active' | 'archived',
): Promise<Map<number, InvoiceValidation>> {
  const cacheService = await getCacheService();
  const cached = await cacheService.getInvoiceValidationsCache(supplementalKey);
  if (cached) {
    const cachedMap = new Map(cached as [number, InvoiceValidation][]);
    if (invoices.every((invoice) => cachedMap.has(invoice.id))) {
      return cachedMap;
    }
  }

  const validations = await getInvoiceValidations(invoices);

  const userMetadata = await getUserMetadata();
  if (userMetadata) {
    await cacheService.cacheInvoiceValidations(
      [...validations.entries()],
      userMetadata,
      INVOICE_VALIDATIONS_CACHE_TTL,
      supplementalKey,
    );
  }

  return validations;
}

function filterToInvoices(contracts: EnrichedContract[]): EnrichedContract[] {
  return contracts.filter((c) => isInvoiceType(c.contract.type_id));
}

async function getAllInvoiceContracts(): Promise<EnrichedContract[]> {
  const { contracts } = await getContractsList();
  return filterToInvoices(contracts);
}

// cache()-wrapped so the discrepancy computation (FX lookups included) runs
// once per request no matter how many of the functions below need it — the
// layout's sidebar counts, a page's stat tiles, and its validation badges
// all call in. getCachedInvoiceValidations also caches across requests.
export const getAllInvoiceValidations = cache(
  async (): Promise<Map<number, InvoiceValidation>> => {
    const invoices = await getAllInvoiceContracts();
    return getCachedInvoiceValidations(invoices, 'active');
  },
);

const getAllInvoicesWithFolders = cache(
  async (): Promise<
    Array<{
      contract: EnrichedContract;
      folders: Set<Exclude<InvoiceFolder, 'all'>>;
      validation: InvoiceValidation | undefined;
    }>
  > => {
    const [invoices, validations] = await Promise.all([
      getAllInvoiceContracts(),
      getAllInvoiceValidations(),
    ]);

    return invoices.map((contract) => {
      const validation = validations.get(contract.id);
      const isDiscrepant = isInvoiceDiscrepant(validation);
      return {
        contract,
        folders: classifyInvoiceFolders(
          contract.contract.invoice_status,
          isDiscrepant,
        ),
        validation,
      };
    });
  },
);

// cache()-wrapped like the functions above — the layout's sidebar count and
// the Archived Invoices page both call in for the same request.
export const getArchivedInvoiceContracts = cache(
  async (): Promise<EnrichedContract[]> => {
    const { contracts } = await getArchivedContracts();
    return filterToInvoices(contracts);
  },
);

// Archived invoices are a disjoint id set from getAllInvoiceValidations()
// (active invoices only) — the Archived Invoices folder needs its own
// validations map (and its own cache entry, via supplementalKey) rather
// than looking archived ids up in the active one.
export const getArchivedInvoiceValidations = cache(
  async (): Promise<Map<number, InvoiceValidation>> => {
    const invoices = await getArchivedInvoiceContracts();
    return getCachedInvoiceValidations(invoices, 'archived');
  },
);

export async function getInvoiceContracts(
  folder: InvoiceFolder = 'all',
): Promise<EnrichedContract[]> {
  if (folder === 'archived') return getArchivedInvoiceContracts();
  const withFolders = await getAllInvoicesWithFolders();
  if (folder === 'all') return withFolders.map((c) => c.contract);
  return withFolders
    .filter((c) => c.folders.has(folder))
    .map((c) => c.contract);
}

/** Shared by the Invoices list and the Discrepancy Report — both build the
 * exact same InvoiceRow shape from a contract set and its validations. */
export function toInvoiceRows(
  contracts: EnrichedContract[],
  validations: Map<number, InvoiceValidation>,
): InvoiceRow[] {
  return contracts.map((contract) => ({
    ...buildContractTableRow(contract),
    dueDate:
      (contract.contract as { due_date?: string | null }).due_date ?? null,
    validation: validations.get(contract.id),
  }));
}

export const getInvoiceStats = cache(async (): Promise<InvoiceStats> => {
  const withFolders = await getAllInvoicesWithFolders();
  // One buildContractTableRow() per contract — previously the "all" and
  // per-folder sums rebuilt it independently (2-3x per invoice).
  return computeInvoiceStats(
    withFolders.map(({ contract, validation }) => ({
      invoiceStatus: contract.contract.invoice_status,
      recordedAmountUSD: buildContractTableRow(contract).recordedAmountUSD,
      validation,
    })),
  );
});
