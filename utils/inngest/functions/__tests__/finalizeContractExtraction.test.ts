const mockProcessVendorProducts = jest.fn();
const mockProcessProductScheduleAction = jest.fn();
const mockProcessAssetClasses = jest.fn();
const mockProcessDataDeliveryMethods = jest.fn();
const mockInvalidateOrganizationData = jest.fn();
const mockInvalidateVendorList = jest.fn();

jest.mock('@/app/lib/actions/contract-processing', () => ({
  processVendorProducts: (...args: unknown[]) =>
    mockProcessVendorProducts(...args),
  processProductScheduleAction: (...args: unknown[]) =>
    mockProcessProductScheduleAction(...args),
  processAssetClasses: (...args: unknown[]) => mockProcessAssetClasses(...args),
  processDataDeliveryMethods: (...args: unknown[]) =>
    mockProcessDataDeliveryMethods(...args),
}));

jest.mock('@/app/lib/redis/cache-service', () => ({
  getCacheService: async () => ({
    invalidateOrganizationData: (...args: unknown[]) =>
      mockInvalidateOrganizationData(...args),
    invalidateVendorList: (...args: unknown[]) =>
      mockInvalidateVendorList(...args),
  }),
}));

jest.mock('@/utils/inngest/helpers', () => ({
  handleContractProcessingFailure: jest.fn(),
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

let capturedHandler: any;

jest.mock('../../client', () => ({
  inngest: {
    createFunction: jest.fn((_config: any, _trigger: any, handler: any) => {
      capturedHandler = handler;
      return { handler };
    }),
  },
}));

require('../finalizeContractExtraction');

const { contractTypes } = require('@/app/lib/constants');

const USER_ID = '11111111-1111-1111-1111-111111111111';

const createStep = () => ({
  run: jest.fn(async (_id: string, fn: () => Promise<unknown>) => {
    // Inngest memoises step output as JSON: a step returning nothing reads back
    // as null on replay.
    const result = await fn();
    return result === undefined ? null : result;
  }),
  sendEvent: jest.fn(async () => undefined),
});

const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };

const buildEvent = (contractTypeId: number | undefined) => ({
  data: {
    fileName: 'berenberg.pdf',
    fileId: null,
    contractId: 42,
    modelProvider: 'google',
    contractTypeId,
  },
  user: { id: USER_ID, organizationId: 'org-1' },
});

describe('finalizeContractExtraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs every derivation step for an ordinary contract type', async () => {
    const step = createStep();

    const result = await capturedHandler({
      event: buildEvent(contractTypes.MSA),
      step,
      logger,
    });

    expect(mockProcessVendorProducts).toHaveBeenCalled();
    expect(mockProcessAssetClasses).toHaveBeenCalled();
    expect(mockProcessDataDeliveryMethods).toHaveBeenCalled();
    expect(mockInvalidateOrganizationData).toHaveBeenCalledWith({
      organizationId: 'org-1',
    });
    expect(mockInvalidateVendorList).toHaveBeenCalledWith({
      userId: USER_ID,
      organizationId: 'org-1',
    });
    expect(result).toEqual({
      contractId: 42,
      contractTypeId: contractTypes.MSA,
    });
  });

  it('reads the original uploaded document it was handed', async () => {
    const step = createStep();

    await capturedHandler({
      event: buildEvent(contractTypes.MSA),
      step,
      logger,
    });

    expect(mockProcessAssetClasses).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: `${USER_ID}/berenberg.pdf` }),
    );
  });

  it('skips the product schedule action unless the contract is an addendum', async () => {
    const step = createStep();

    await capturedHandler({
      event: buildEvent(contractTypes.MSA),
      step,
      logger,
    });

    expect(mockProcessProductScheduleAction).not.toHaveBeenCalled();
  });

  it('runs the product schedule action for an addendum', async () => {
    const step = createStep();

    await capturedHandler({
      event: buildEvent(contractTypes.Addendum),
      step,
      logger,
    });

    expect(mockProcessProductScheduleAction).toHaveBeenCalled();
  });

  it('skips asset classes and data delivery methods for an NDA', async () => {
    const step = createStep();

    await capturedHandler({
      event: buildEvent(contractTypes.NDA),
      step,
      logger,
    });

    expect(mockProcessAssetClasses).not.toHaveBeenCalled();
    expect(mockProcessDataDeliveryMethods).not.toHaveBeenCalled();
    // Vendor product linking is not type-gated.
    expect(mockProcessVendorProducts).toHaveBeenCalled();
  });

  it('propagates a step failure to the caller', async () => {
    mockProcessVendorProducts.mockRejectedValueOnce(new Error('link failed'));
    const step = createStep();

    await expect(
      capturedHandler({
        event: buildEvent(contractTypes.MSA),
        step,
        logger,
      }),
    ).rejects.toThrow('link failed');
    expect(logger.error).toHaveBeenCalled();
  });
});

export {};
