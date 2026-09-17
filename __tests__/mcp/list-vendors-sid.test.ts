import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/app/lib/mcp/context', () => ({
  __esModule: true,
  requireMcpContext: () => ({
    userMetadata: { organizationId: 'org-1', baseCurrency: 'EUR' },
  }),
}));

jest.mock('@/utils/supabase/service_server', () => ({
  __esModule: true,
  createClient: jest.fn(),
}));

jest.mock('@/lib/v2', () => ({
  __esModule: true,
  getContractsList: jest.fn(),
  getVendorContractsWithMetrics: jest.fn(),
  getVendorSidProducts: jest.fn(),
  fetchVendorDetails: jest.fn(),
  filterForAggregation: (rows: unknown[]) => rows,
}));

jest.mock('@/lib/v2/vendors/service', () => ({
  __esModule: true,
  getSidVendorTotals: jest.fn(),
}));

import { mergeSidVendorTotals } from '@/app/lib/mcp/tools/cpm/vendors';
import type { SidVendorTotals } from '@/lib/v2/vendors/transforms';

const BLOOMBERG = 469;
const ACME = 12;

const rollup = (
  id: number,
  name: string,
  currentAnnualSpendBase: number,
  contractCount = 1,
) => ({
  id,
  name,
  domain: `${name.toLowerCase()}.com`,
  ictProvider: null,
  contractCount,
  currentAnnualSpendBase,
  totalContractValueBase: currentAnnualSpendBase * 2,
});

const seatTotals = (
  current: number,
  projected: number,
  seats: number,
): SidVendorTotals => ({
  byVendorId: new Map([[BLOOMBERG, { current, projected }]]),
  labels: new Map([
    [BLOOMBERG, { name: 'Bloomberg', domain: 'bloomberg.com' }],
  ]),
  seatCounts: new Map([[BLOOMBERG, seats]]),
  vendorIds: new Set([BLOOMBERG]),
});

describe('mergeSidVendorTotals', () => {
  it('adds seat spend to a vendor that also has contracts', () => {
    const merged = mergeSidVendorTotals(
      [rollup(BLOOMBERG, 'Bloomberg', 40_000), rollup(ACME, 'Acme', 10_000)],
      seatTotals(60_000, 63_000, 351),
      new Map(),
    );

    const bloomberg = merged.find((v) => v.id === BLOOMBERG);
    expect(bloomberg?.currentAnnualSpendBase).toBe(100_000);
    expect(bloomberg?.contractCount).toBe(1);
    expect(bloomberg?.terminalSeats).toEqual({
      seats: 351,
      currentAnnualSpendBase: 60_000,
      projectedAnnualSpendBase: 63_000,
    });
    expect(merged.find((v) => v.id === ACME)?.terminalSeats).toBeUndefined();
  });

  it('creates a row for a seat vendor with no contracts', () => {
    const merged = mergeSidVendorTotals(
      [rollup(ACME, 'Acme', 10_000)],
      seatTotals(60_000, 63_000, 351),
      new Map([[BLOOMBERG, true]]),
    );

    expect(merged.find((v) => v.id === BLOOMBERG)).toEqual({
      id: BLOOMBERG,
      name: 'Bloomberg',
      domain: 'bloomberg.com',
      ictProvider: true,
      contractCount: 0,
      currentAnnualSpendBase: 60_000,
      totalContractValueBase: 0,
      terminalSeats: {
        seats: 351,
        currentAnnualSpendBase: 60_000,
        projectedAnnualSpendBase: 63_000,
      },
    });
  });

  it('re-sorts by current annual spend once seats are folded in', () => {
    const merged = mergeSidVendorTotals(
      [rollup(ACME, 'Acme', 50_000), rollup(BLOOMBERG, 'Bloomberg', 10_000)],
      seatTotals(60_000, 63_000, 351),
      new Map(),
    );

    expect(merged.map((v) => v.id)).toEqual([BLOOMBERG, ACME]);
  });

  it('leaves the rollups untouched when no vendor has seats', () => {
    const rollups = [rollup(ACME, 'Acme', 10_000)];
    const merged = mergeSidVendorTotals(rollups, {
      byVendorId: new Map(),
      labels: new Map(),
      seatCounts: new Map(),
      vendorIds: new Set(),
    });

    expect(merged).toEqual(rollups);
  });
});
