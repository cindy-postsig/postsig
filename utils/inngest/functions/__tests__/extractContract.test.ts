const mockProcessTechnical = jest.fn();
const mockProcessContractSpecs = jest.fn();
const mockProcessAdditionalContractData = jest.fn();
const mockProcessExchangeAgreementProducts = jest.fn();
const mockLogProcessingStatusChange = jest.fn();

jest.mock('@/app/lib/actions/contract-processing', () => ({
  processTechnical: (...args: unknown[]) => mockProcessTechnical(...args),
  processContractSpecs: (...args: unknown[]) =>
    mockProcessContractSpecs(...args),
  processAdditionalContractData: (...args: unknown[]) =>
    mockProcessAdditionalContractData(...args),
  processExchangeAgreementProducts: (...args: unknown[]) =>
    mockProcessExchangeAgreementProducts(...args),
}));

jest.mock('@/data/superuser/activities', () => ({
  logProcessingStatusChange: (...args: unknown[]) =>
    mockLogProcessingStatusChange(...args),
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

require('../extractContract');

const { contractTypes } = require('@/app/lib/constants');

const USER_ID = '11111111-1111-1111-1111-111111111111';

// Inngest memoises step output as JSON, so a step that returns `undefined`
// hands back `null` when the function is replayed. Mirror that here — several
// steps return nothing for certain contract types.
const createStep = () => ({
  run: jest.fn(async (_id: string, fn: () => Promise<unknown>) => {
    const result = await fn();
    return result === undefined ? null : result;
  }),
  sendEvent: jest.fn(async () => undefined),
});

const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };

const event = {
  data: {
    fileName: 'berenberg.pdf',
    fileId: null,
    contractId: 42,
    modelProvider: 'google',
  },
  user: { id: USER_ID, organizationId: 'org-1' },
};

const emptyResult = { data: {}, usage: {} };

describe('extractContract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessTechnical.mockResolvedValue(emptyResult);
    mockProcessAdditionalContractData.mockResolvedValue(emptyResult);
    mockProcessContractSpecs.mockResolvedValue({
      data: { type_id: contractTypes.MSA },
      usage: {},
    });
  });

  it('hands off to finalize-extraction with the resolved contract type', async () => {
    const step = createStep();

    await capturedHandler({ event, step, logger });

    expect(step.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        name: 'contracts/finalize-extraction',
        data: {
          fileName: 'berenberg.pdf',
          fileId: null,
          contractId: 42,
          modelProvider: 'google',
          contractTypeId: contractTypes.MSA,
        },
        user: { id: USER_ID, organizationId: 'org-1' },
      }),
    );
  });

  it('reads the original uploaded document it was handed', async () => {
    const step = createStep();

    await capturedHandler({ event, step, logger });

    expect(mockProcessTechnical).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: `${USER_ID}/berenberg.pdf` }),
    );
    expect(mockProcessContractSpecs).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: `${USER_ID}/berenberg.pdf` }),
    );
  });

  it('moves the contract from uploaded to new', async () => {
    const step = createStep();

    await capturedHandler({ event, step, logger });

    expect(mockLogProcessingStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 42, changedBy: USER_ID }),
    );
  });

  it('skips exchange agreement products for a non-exchange contract type', async () => {
    const step = createStep();

    await capturedHandler({ event, step, logger });

    expect(mockProcessExchangeAgreementProducts).not.toHaveBeenCalled();
  });

  it('extracts exchange agreement products before handing off', async () => {
    mockProcessContractSpecs.mockResolvedValue({
      data: { type_id: contractTypes.EAFeeSchedule },
      usage: {},
    });
    mockProcessExchangeAgreementProducts.mockResolvedValue(emptyResult);
    const step = createStep();

    await capturedHandler({ event, step, logger });

    expect(mockProcessExchangeAgreementProducts).toHaveBeenCalled();
    const exchangeCallOrder =
      mockProcessExchangeAgreementProducts.mock.invocationCallOrder[0];
    expect(step.sendEvent.mock.invocationCallOrder[0]).toBeGreaterThan(
      exchangeCallOrder,
    );
  });

  it('still hands off when a skipped step memoises to null', async () => {
    // A non-exchange contract skips process-exchange-agreement-products, which
    // reads back as null. Totalling the usage must not choke on it, or the
    // second half of extraction never runs.
    const step = createStep();

    await capturedHandler({ event, step, logger });

    const stepResults = await Promise.all(
      step.run.mock.results.map((result) => result.value),
    );
    expect(stepResults).toContain(null);
    expect(step.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'contracts/finalize-extraction' }),
    );
    // The usage totals still add up across the steps that did return something.
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 42 }),
    );
  });

  it('does not hand off when an extraction step fails', async () => {
    mockProcessTechnical.mockRejectedValueOnce(new Error('gemini failed'));
    const step = createStep();

    await expect(capturedHandler({ event, step, logger })).rejects.toThrow(
      'gemini failed',
    );
    expect(step.sendEvent).not.toHaveBeenCalled();
  });
});

export {};
