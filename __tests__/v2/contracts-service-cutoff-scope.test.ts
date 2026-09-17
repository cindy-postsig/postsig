import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ChainContractInput } from '@/lib/contracts/productLineageResolution';

/**
 * Pins the chain-input scope of getContractsList's cutoff resolution
 * (PSK-1830): chainContracts must come from the UNFILTERED base set, so a
 * declaring addendum that the active filter hides (e.g. unpublished) still
 * strikes products on the contracts this list does show. Enrichment itself
 * must still only cover the filtered set.
 */

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const ORG_ID = 'org-1';

// status_id 4 = published (survives filterActiveContracts); 2 does not.
const baseRows = [
  {
    id: 1,
    status_id: 4,
    ai_extraction_status: 'success',
    term_start_date: [{ date: '2020-01-01' }],
    vendor_products_details: [{ product_id: 10, fees: 100 }],
  },
  {
    id: 2,
    status_id: 2,
    ai_extraction_status: 'success',
    term_start_date: [{ date: '2023-01-01' }],
    vendor_products_details: [],
  },
];

jest.mock('@/app/lib/contracts/actions', () => ({
  fetchContractsBase: jest.fn(async () => baseRows),
  fetchContracts: jest.fn(async () => []),
  fetchContractsById: jest.fn(async () => []),
  fetchContractsBaseForLineageAI: jest.fn(async () => []),
}));

jest.mock('@/data/superuser/contracts', () => ({
  fetchAllRelationshipsForOrg: jest.fn(async () => []),
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: jest.fn(async () => ({
    organizationId: ORG_ID,
    organizationFY: 1,
    baseCurrency: 'USD',
  })),
  getEffectiveBaseCurrency: jest.fn(async () => 'USD'),
}));

const resolveProductFeeCutoffs = jest.fn<
  (args: unknown) => Promise<Map<number, Map<number, Date>>>
>(async () => new Map());
jest.mock('@/lib/contracts/resolveRemovedProductsForContracts', () => ({
  resolveProductFeeCutoffs: (args: unknown) => resolveProductFeeCutoffs(args),
}));

const enrichWithPricing = jest.fn<
  (contracts: unknown[], fy: number, options?: unknown) => Promise<unknown[]>
>(async (contracts) => contracts);
jest.mock('@/lib/v2/core/pricing', () => ({
  enrichWithPricing: (contracts: unknown[], _fy: number, options?: unknown) =>
    enrichWithPricing(contracts, _fy, options),
  enrichWithEffectiveFees: (contracts: unknown[]) => contracts,
}));

jest.mock('@/lib/v2/core/lineage', () => ({
  enrichWithLineage: (contracts: unknown[]) =>
    (contracts as Array<{ id: number }>).map((c) => ({
      id: c.id,
      contract: c,
      products: [],
    })),
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: jest.fn(),
}));

import { getContractsList } from '@/lib/v2/contracts/service';

describe('getContractsList — cutoff resolution scope', () => {
  beforeEach(() => {
    resolveProductFeeCutoffs.mockClear();
    enrichWithPricing.mockClear();
  });

  it('resolves cutoffs from the unfiltered base set, enriches only the filtered set', async () => {
    const { contracts } = await getContractsList();

    // Enrichment saw only the published contract...
    expect(contracts.map((c) => c.id)).toEqual([1]);

    // ...but cutoff resolution saw the unpublished declaring contract too.
    const args = resolveProductFeeCutoffs.mock.calls[0][0] as {
      organizationId: string;
      chainContracts: ChainContractInput[];
    };
    expect(args.organizationId).toBe(ORG_ID);
    expect(args.chainContracts.map((c) => c.contractId).sort()).toEqual([1, 2]);
  });

  it('threads the resolved cutoffs into pricing enrichment', async () => {
    const cutoffs = new Map([[1, new Map([[10, new Date('2023-01-01')]])]]);
    resolveProductFeeCutoffs.mockResolvedValueOnce(cutoffs);

    await getContractsList();

    expect(enrichWithPricing.mock.calls[0][2]).toEqual({
      cutoffsByContract: cutoffs,
      baseCurrency: 'USD',
    });
  });
});
