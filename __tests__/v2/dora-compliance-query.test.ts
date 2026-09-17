import { describe, expect, it } from '@jest/globals';
import { runDoraComplianceQuery } from '@/lib/v2/chat/tools/queries';

jest.mock('@/utils/pino', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

type ContractMock = Parameters<typeof runDoraComplianceQuery>[0][number];

interface DoraFields {
  vendor_products_details?: Array<{
    vendor_products: { id: number; name: string };
  }>;
  vendor_location?: string | null;
  distribution_rights?: string | null;
  data_disposal_tnc?: string | null;
  service_level_agreements?: string | null;
  cost_mitigation?: string | null;
  arbitration_and_conflict_resolution?: string | null;
  cancel_by_date?: unknown;
  security_awareness?: string | null;
  end_users?: string | null;
  market_data_types?: string | null;
  internal_external_users?: string | null;
  exclusivity_terms?: string | null;
  activities?: string | null;
  geo_restrictions?: string | null;
  derivative_works?: string | null;
  audit_requirements?: string | null;
  suspension_of_service?: string | null;
  cancellation_process?: string | null;
  cancel_date?: unknown;
}

function makeContract(
  id: number,
  doraFields: DoraFields,
  opts: { vendorName?: string; ictProvider?: boolean; typeId?: number } = {},
): ContractMock {
  const contract = {
    id,
    type_id: opts.typeId ?? 1,
    vendors: {
      name: opts.vendorName ?? 'TestVendor',
      ict_provider: opts.ictProvider ?? false,
    },
    ...doraFields,
  };
  return {
    id,
    vendor_id: 1,
    vendor_name: opts.vendorName ?? 'TestVendor',
    contract,
    products: [],
    priceHistory: null,
    isLinkedChildInvoice: false,
  } as ContractMock;
}

const FULL_DORA_FIELDS: DoraFields = {
  vendor_products_details: [{ vendor_products: { id: 1, name: 'Product A' } }],
  vendor_location: 'US',
  distribution_rights: 'Allowed',
  data_disposal_tnc: 'Compliant',
  service_level_agreements: '99.9%',
  cost_mitigation: 'Yes',
  arbitration_and_conflict_resolution: 'Arbitration',
  cancel_by_date: '2026-12-31',
  security_awareness: 'Annual training',
};

const PARTIAL_DORA_FIELDS: DoraFields = {
  vendor_products_details: [{ vendor_products: { id: 1, name: 'Product A' } }],
  vendor_location: 'US',
  distribution_rights: 'Allowed',
};

const EMPTY_DORA_FIELDS: DoraFields = {};

describe('runDoraComplianceQuery', () => {
  it('returns contracts with score below default threshold of 9', () => {
    const contracts = [
      makeContract(1, FULL_DORA_FIELDS, { ictProvider: true }),
      makeContract(2, PARTIAL_DORA_FIELDS, { ictProvider: true }),
    ];

    const result = runDoraComplianceQuery(contracts);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
    expect(result[0].doraScore).toBeLessThan(9);
  });

  it('returns correct scores for fully compliant contract', () => {
    const contracts = [
      makeContract(1, FULL_DORA_FIELDS, { ictProvider: true }),
    ];

    const result = runDoraComplianceQuery(contracts, 10);

    expect(result).toHaveLength(1);
    expect(result[0].doraScore).toBe(9);
    expect(result[0].maxScore).toBe(9);
    expect(result[0].missingCategories).toEqual([]);
  });

  it('uses canonical labels from categoryLabels map', () => {
    const contracts = [
      makeContract(1, PARTIAL_DORA_FIELDS, { ictProvider: true }),
    ];

    const result = runDoraComplianceQuery(contracts);

    expect(result).toHaveLength(1);
    const missing = result[0].missingCategories;
    expect(missing).toContain('Data Recovery');
    expect(missing).toContain('Service Level Agreement');
    expect(missing).toContain('Incident Cost Mitigation');
    expect(missing).toContain('Conflict Resolution');
    expect(missing).toContain('Timely Termination');
    expect(missing).toContain('Security Awareness');
    expect(missing).not.toContain('data Recovery');
    expect(missing).not.toContain('service Level Agreement');
  });

  it('reflects hasICTVendor from vendors.ict_provider', () => {
    const contracts = [
      makeContract(1, PARTIAL_DORA_FIELDS, { ictProvider: true }),
      makeContract(2, PARTIAL_DORA_FIELDS, { ictProvider: false }),
    ];

    const result = runDoraComplianceQuery(contracts);

    expect(result).toHaveLength(1);
    expect(result[0].hasICTVendor).toBe(true);
  });

  it('filters to ICT vendors only', () => {
    const contracts = [
      makeContract(1, PARTIAL_DORA_FIELDS, { ictProvider: true }),
      makeContract(2, PARTIAL_DORA_FIELDS, { ictProvider: false }),
      makeContract(3, EMPTY_DORA_FIELDS, { ictProvider: true }),
    ];

    const result = runDoraComplianceQuery(contracts);

    expect(result.every((c) => c.hasICTVendor)).toBe(true);
    const ids = result.map((c) => c.id);
    expect(ids).toContain(1);
    expect(ids).toContain(3);
    expect(ids).not.toContain(2);
  });

  it('respects doraScoreBelow threshold', () => {
    const contracts = [
      makeContract(1, EMPTY_DORA_FIELDS, { ictProvider: true }),
      makeContract(2, PARTIAL_DORA_FIELDS, { ictProvider: true }),
    ];

    const result = runDoraComplianceQuery(contracts, 2);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].doraScore).toBeLessThan(2);
  });

  it('combines doraScoreBelow', () => {
    const contracts = [
      makeContract(1, EMPTY_DORA_FIELDS, { ictProvider: true }),
      makeContract(2, PARTIAL_DORA_FIELDS, { ictProvider: true }),
      makeContract(3, EMPTY_DORA_FIELDS, { ictProvider: false }),
    ];

    const result = runDoraComplianceQuery(contracts, 2);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].hasICTVendor).toBe(true);
    expect(result[0].doraScore).toBeLessThan(2);
  });

  it('returns empty array when no contracts match', () => {
    const contracts = [
      makeContract(1, FULL_DORA_FIELDS, { ictProvider: true }),
    ];

    const result = runDoraComplianceQuery(contracts);

    expect(result).toEqual([]);
  });

  it('excludes invoice contracts (type_id 6) even when ICT with a low score', () => {
    const contracts = [
      makeContract(1, PARTIAL_DORA_FIELDS, { ictProvider: true, typeId: 6 }),
      makeContract(2, PARTIAL_DORA_FIELDS, { ictProvider: true }),
    ];

    const result = runDoraComplianceQuery(contracts);

    const ids = result.map((c) => c.id);
    expect(ids).not.toContain(1);
    expect(ids).toContain(2);
  });

  it('populates vendor and contractType fields', () => {
    const contracts = [
      makeContract(1, PARTIAL_DORA_FIELDS, {
        vendorName: 'Acme Corp',
        ictProvider: true,
      }),
    ];

    const result = runDoraComplianceQuery(contracts);

    expect(result[0].vendor).toBe('Acme Corp');
    expect(result[0].contractType).toBeDefined();
  });
});
