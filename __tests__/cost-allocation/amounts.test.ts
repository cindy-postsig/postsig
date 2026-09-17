import {
  hasRecordedFee,
  scopeValuesFromEngineSpend,
  scopeValuesOf,
  type EngineSpendStamp,
} from '@/lib/v2/cost-allocation/amounts';

const stamp = (
  overrides: Partial<EngineSpendStamp> = {},
): EngineSpendStamp => ({
  currentBase: 900,
  projectedBase: 950,
  currentNative: 1000,
  projectedNative: 1050,
  ...overrides,
});

describe('scopeValuesFromEngineSpend', () => {
  it('reports an unknown contract value, not zero, without a stamp', () => {
    expect(scopeValuesFromEngineSpend(undefined, false)).toEqual({
      contract: null,
      products: {},
    });
  });

  it('reads the current-FY base value and converts product natives at the contract rate', () => {
    expect(
      scopeValuesFromEngineSpend(
        stamp({
          products: {
            7: { currentNative: 250, projectedNative: 0 },
            8: { currentNative: 750, projectedNative: 0 },
          },
        }),
        false,
      ),
    ).toEqual({ contract: 900, products: { 7: 225, 8: 675 } });
  });

  it('uses the recorded amount for invoices when present', () => {
    expect(
      scopeValuesFromEngineSpend(
        stamp({ recordedBase: 1200, recordedNative: 1300 }),
        true,
      ).contract,
    ).toBe(1200);
    expect(scopeValuesFromEngineSpend(stamp(), true).contract).toBe(900);
  });

  it('reads a stamped contract with no window native as zero throughout, like the tables', () => {
    expect(
      scopeValuesFromEngineSpend(
        stamp({
          currentNative: 0,
          currentBase: 0,
          products: { 7: { currentNative: 0, projectedNative: 0 } },
        }),
        false,
      ),
    ).toEqual({ contract: 0, products: { 7: 0 } });
  });

  it("prices an invoice's products from its recorded fee rows at the recorded rate, never the current-window stamp", () => {
    expect(
      scopeValuesFromEngineSpend(
        stamp({
          recordedBase: 1300,
          recordedNative: 1000,
          currentBase: 0,
          currentNative: 0,
          products: { 7: { currentNative: 0, projectedNative: 0 } },
        }),
        true,
        [
          { product_id: 7, fees: 250 },
          { product_id: 8, fees: 750 },
        ],
      ),
    ).toEqual({ contract: 1300, products: { 7: 325, 8: 975 } });
  });

  it("sums an invoice product's fee rows and reads numeric strings", () => {
    expect(
      scopeValuesFromEngineSpend(
        stamp({
          recordedBase: 300,
          recordedNative: 300,
          currentBase: 0,
          currentNative: 0,
        }),
        true,
        [
          { product_id: 7, fees: 100 },
          { product_id: 7, fees: '200' },
        ],
      ).products,
    ).toEqual({ 7: 300 });
  });

  it('ignores a non-finite fee row rather than poisoning the product total', () => {
    expect(
      scopeValuesFromEngineSpend(
        stamp({ recordedBase: 100, recordedNative: 100 }),
        true,
        [
          { product_id: 7, fees: 100 },
          { product_id: 7, fees: 'Infinity' },
          { product_id: 8, fees: 'NaN' },
        ],
      ),
    ).toEqual({ contract: 100, products: { 7: 100, 8: 0 } });
    expect(hasRecordedFee([{ product_id: 7, fees: 'Infinity' }])).toBe(false);
  });

  it('ignores the current-window product stamp for an in-window invoice', () => {
    const inWindow = stamp({
      recordedBase: 1300,
      recordedNative: 1000,
      products: { 7: { currentNative: 1000, projectedNative: 0 } },
    });
    expect(
      scopeValuesFromEngineSpend(inWindow, true, [
        { product_id: 7, fees: 1000 },
      ]),
    ).toEqual({ contract: 1300, products: { 7: 1300 } });
    expect(scopeValuesFromEngineSpend(inWindow, true).products).toEqual({});
  });

  it('keeps the recorded amount and no product values for an invoice with no recorded fee rows', () => {
    expect(
      scopeValuesFromEngineSpend(
        stamp({
          recordedBase: 1200,
          recordedNative: 1300,
          currentBase: 0,
          currentNative: 0,
          products: { 7: { currentNative: 0, projectedNative: 0 } },
        }),
        true,
        [],
      ),
    ).toEqual({ contract: 1200, products: {} });
  });

  it('reads a recorded-zero invoice as zero per product, like the tables', () => {
    expect(
      scopeValuesFromEngineSpend(
        stamp({ recordedBase: 0, recordedNative: 0 }),
        true,
        [{ product_id: 7, fees: 0 }],
      ),
    ).toEqual({ contract: 0, products: { 7: 0 } });
  });
});

const getContractsList = jest.fn(
  async (_options: unknown): Promise<{ contracts: unknown[] }> => ({
    contracts: [],
  }),
);
jest.mock('@/lib/v2/contracts/service', () => ({
  getContractsList: (options: unknown) => getContractsList(options),
}));

describe('scopeValuesOf', () => {
  const zeroStamp = stamp({ currentBase: 0, currentNative: 0 });

  it('treats a record with no recorded fee as having no value of its own, whatever the engine stamped', () => {
    expect(
      scopeValuesOf({ engineSpend: zeroStamp, contract: {} }, false),
    ).toEqual({ contract: null, products: {} });
    expect(
      scopeValuesOf(
        { engineSpend: zeroStamp, contract: { vendor_products_details: [] } },
        false,
      ),
    ).toEqual({ contract: null, products: {} });
    expect(
      scopeValuesOf(
        {
          engineSpend: zeroStamp,
          contract: {
            vendor_products_details: [{ product_id: 7, fees: null }],
          },
        },
        false,
      ),
    ).toEqual({ contract: null, products: {} });
  });

  it('keeps a recorded zero as zero — a different fact from nothing recorded', () => {
    expect(
      scopeValuesOf(
        {
          engineSpend: zeroStamp,
          contract: { vendor_products_details: [{ product_id: 7, fees: 0 }] },
        },
        false,
      ),
    ).toEqual({ contract: 0, products: {} });
    expect(hasRecordedFee([{ product_id: 7, fees: '0' }])).toBe(true);
    expect(hasRecordedFee([{ product_id: 7, fees: null }])).toBe(false);
    expect(hasRecordedFee(undefined)).toBe(false);
  });
});

const parent = {
  id: 100,
  contract: {
    type_id: 1,
    vendor_products_details: [{ product_id: 7, fees: 1000 }],
  },
  engineSpend: stamp({
    products: { 7: { currentNative: 1000, projectedNative: 0 } },
  }),
};

describe('getContractScopeValues', () => {
  it('asks the pipeline for the contract family only', async () => {
    const { getContractScopeValues } =
      await import('@/lib/v2/cost-allocation/amounts');
    await getContractScopeValues(42, false, null);
    expect(getContractsList).toHaveBeenCalledWith({
      status: 'all',
      productValues: true,
      familyOf: 42,
    });
  });

  it('prices an inheriting record with no value of its own from its allocation source', async () => {
    const { getContractScopeValues } =
      await import('@/lib/v2/cost-allocation/amounts');
    getContractsList.mockResolvedValueOnce({ contracts: [parent] });

    await expect(getContractScopeValues(42, false, 100)).resolves.toEqual({
      values: { contract: 900, products: { 7: 900 } },
      valuesFromSource: true,
    });
  });

  it("prices a child in the engine set that carries no fees from its allocation source — QA's amendment case", async () => {
    const { getContractScopeValues } =
      await import('@/lib/v2/cost-allocation/amounts');
    getContractsList.mockResolvedValueOnce({
      contracts: [
        parent,
        {
          id: 42,
          contract: { type_id: 3, vendor_products_details: [] },
          engineSpend: stamp({ currentBase: 0, currentNative: 0 }),
        },
      ],
    });

    await expect(getContractScopeValues(42, false, 100)).resolves.toEqual({
      values: { contract: 900, products: { 7: 900 } },
      valuesFromSource: true,
    });
  });

  it("keeps the record's own values whenever it has one", async () => {
    const { getContractScopeValues } =
      await import('@/lib/v2/cost-allocation/amounts');
    getContractsList.mockResolvedValueOnce({
      contracts: [
        parent,
        {
          id: 42,
          contract: {
            type_id: 3,
            vendor_products_details: [{ product_id: 8, fees: 50 }],
          },
          engineSpend: stamp({ currentBase: 50, currentNative: 50 }),
        },
      ],
    });

    await expect(getContractScopeValues(42, false, 100)).resolves.toEqual({
      values: { contract: 50, products: {} },
      valuesFromSource: false,
    });
  });

  it('stays unknown, never zero, when neither record has a value', async () => {
    const { getContractScopeValues } =
      await import('@/lib/v2/cost-allocation/amounts');
    getContractsList.mockResolvedValueOnce({ contracts: [] });

    await expect(getContractScopeValues(42, false, 100)).resolves.toEqual({
      values: { contract: null, products: {} },
      valuesFromSource: false,
    });
  });
});
