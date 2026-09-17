import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// contract-processing imports the OpenAI action module, which constructs a
// client at import time and needs OPENAI_API_KEY. The function under test does
// not use it, so stub the whole module.
jest.mock('@/app/lib/actions/openai', () => ({}));

// The lineage-strategies import chain reaches constants/emails, which is
// `server-only`.
jest.mock('server-only', () => ({}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

type CreateEventArgs = {
  contractId: number;
  organizationId: string;
  action: string;
  productId?: number | null;
  evidence?: unknown;
  createdBy?: string | null;
  source?: string;
};

let contractRow: Record<string, unknown> | null = null;
const createEvent = jest.fn<(args: CreateEventArgs) => Promise<unknown>>();

jest.mock('@/data/superuser/contracts', () => ({
  fetchContract: jest.fn(async () => contractRow),
  getContractById: jest.fn(),
  getContractDocument: jest.fn(),
}));

jest.mock('@/data/superuser/productLineageEvents', () => ({
  createPendingProductLineageEvent: (args: CreateEventArgs) =>
    createEvent(args),
}));

import { processProductScheduleAction } from '@/app/lib/actions/contract-processing';
import { extractionFields } from '@/constants/data';
import { transformAiExtractionData } from '@/lib/utils';
// logAlert goes through the shared pino instance, not the per-run Inngest logger.
import pinoLogger from '@/utils/pino';

const CONTRACT_ID = 42;
const ORG_ID = 'org-1';
const USER_ID = 'user-1';

const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const run = () =>
  processProductScheduleAction({
    contractId: CONTRACT_ID,
    userId: USER_ID,
    logger,
    organizationId: ORG_ID,
  });

const withAction = (value: unknown) => {
  contractRow = { ai_extraction: { product_schedule_action: value } };
};

describe('processProductScheduleAction — eventful enum values', () => {
  beforeEach(() => {
    createEvent.mockReset();
    createEvent.mockResolvedValue({ created: true });
    contractRow = null;
    logger.info.mockReset();
  });

  it('creates one pending blanket event for replaces_all_prior', async () => {
    withAction({
      action: 'replaces_all_prior',
      evidence: ['all prior cancelled'],
    });

    await run();

    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: CONTRACT_ID,
        organizationId: ORG_ID,
        action: 'replace_all_prior',
        source: 'ai',
        createdBy: USER_ID,
      }),
    );
  });

  it('creates a blanket event for modifies_specific too', async () => {
    // Ops picks the specific products later; AI never names them.
    withAction({ action: 'modifies_specific', evidence: [] });

    await run();

    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'replace_all_prior' }),
    );
  });

  it('never creates a per-product event from extraction', async () => {
    withAction({ action: 'modifies_specific' });

    await run();

    const arg = createEvent.mock.calls[0][0];
    expect(arg.action).not.toBe('cancel_product');
    expect(arg.productId).toBeUndefined();
  });

  it('stores the declared action and evidence', async () => {
    withAction({
      action: 'replaces_all_prior',
      evidence: ['Section 2 supersedes Schedule A'],
    });

    await run();

    expect(createEvent.mock.calls[0][0].evidence).toEqual({
      declaredAction: 'replaces_all_prior',
      evidence: ['Section 2 supersedes Schedule A'],
    });
  });

  it('logs the classification without the verbatim contract quotes', async () => {
    // The evidence entries are quoted contract text; the log records how many
    // there were, never what they said.
    withAction({
      action: 'replaces_all_prior',
      evidence: ['Section 2 supersedes Schedule A', 'Exhibit B is void'],
    });

    await run();

    expect(logger.info).toHaveBeenCalledWith({
      contractId: CONTRACT_ID,
      organizationId: ORG_ID,
      created: true,
      declaredAction: 'replaces_all_prior',
      evidenceCount: 2,
    });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
      'supersedes Schedule A',
    );
  });

  it('reads the field exactly where processAdditionalContractData persists it', async () => {
    // The write path stores extraction results in `contracts.ai_extraction`
    // keyed by the extraction field name after transformAiExtractionData. Build
    // the row the same way so a rename or transform on either side breaks here.
    contractRow = {
      ai_extraction: transformAiExtractionData({
        [extractionFields.addendum.productScheduleAction]: {
          action: 'replaces_all_prior',
          evidence: ['all prior cancelled'],
        },
      }),
    };

    await run();

    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'replace_all_prior' }),
    );
  });

  it('accepts a bare string instead of an object', async () => {
    withAction('replaces_all_prior');

    await run();

    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(createEvent.mock.calls[0][0].evidence).toEqual({
      declaredAction: 'replaces_all_prior',
      evidence: null,
    });
  });
});

describe('processProductScheduleAction — non-eventful values', () => {
  beforeEach(() => {
    createEvent.mockReset();
    createEvent.mockResolvedValue({ created: true });
    contractRow = null;
  });

  it.each(['adds_to_prior', 'none'])(
    'creates no event for %s',
    async (action) => {
      withAction({ action });

      await run();

      expect(createEvent).not.toHaveBeenCalled();
    },
  );

  it('creates no event for an unknown enum value', async () => {
    withAction({ action: 'obliterates_everything' });

    await run();

    expect(createEvent).not.toHaveBeenCalled();
  });

  it('creates no event when the field is absent', async () => {
    // The toolkit prompt may not be published yet — this is the normal case.
    contractRow = { ai_extraction: { amended_clauses: 'something else' } };

    await run();

    expect(createEvent).not.toHaveBeenCalled();
  });

  it('creates no event when ai_extraction is null', async () => {
    contractRow = { ai_extraction: null };

    await run();

    expect(createEvent).not.toHaveBeenCalled();
  });

  it('creates no event when the contract is missing', async () => {
    contractRow = null;
    (pinoLogger.error as jest.Mock).mockClear();

    await run();

    expect(createEvent).not.toHaveBeenCalled();
    // A missing row is a quiet no-op, not an alertable lineage failure.
    expect(pinoLogger.error).not.toHaveBeenCalled();
  });
});

describe('processProductScheduleAction — malformed input', () => {
  beforeEach(() => {
    createEvent.mockReset();
    createEvent.mockResolvedValue({ created: true });
    contractRow = null;
  });

  it.each([
    ['a number', 12345],
    ['null', null],
    ['an array', ['replaces_all_prior']],
    ['an object with no action', { evidence: ['x'] }],
    ['an object with a non-string action', { action: 99 }],
  ])('creates no event and does not throw for %s', async (_label, value) => {
    withAction(value);

    await expect(run()).resolves.toBeUndefined();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('tolerates non-array evidence by storing null', async () => {
    withAction({ action: 'replaces_all_prior', evidence: 'not an array' });

    await run();

    expect(createEvent.mock.calls[0][0].evidence).toEqual({
      declaredAction: 'replaces_all_prior',
      evidence: null,
    });
  });
});

describe('processProductScheduleAction — failure handling', () => {
  beforeEach(() => {
    createEvent.mockReset();
    contractRow = null;
    (pinoLogger.error as jest.Mock).mockReset();
  });

  it('swallows a write failure so extraction is not failed', async () => {
    // A supplementary lineage declaration must never sink the whole contract.
    withAction({ action: 'replaces_all_prior' });
    createEvent.mockRejectedValue(new Error('db down'));

    await expect(run()).resolves.toBeUndefined();
  });

  it('pages a monitor when the write fails', async () => {
    // Swallowing the error keeps extraction alive, but a dropped declaration is
    // invisible in the UI, so it has to surface somewhere.
    withAction({ action: 'replaces_all_prior' });
    createEvent.mockRejectedValue(new Error('db down'));

    await run();

    const alerted = (pinoLogger.error as jest.Mock).mock.calls.find(
      (call) =>
        (call[0] as { alert?: string } | undefined)?.alert ===
        'contract-processing-failure',
    );

    expect(alerted).toBeDefined();
    expect(alerted?.[0]).toMatchObject({
      processName: 'processProductScheduleAction',
      contractId: CONTRACT_ID,
      userId: USER_ID,
      organizationId: ORG_ID,
    });
  });

  it('reports created=false when the event already existed', async () => {
    // Inngest retries the step; the data layer no-ops on the duplicate.
    withAction({ action: 'replaces_all_prior' });
    createEvent.mockResolvedValue({ created: false });

    await expect(run()).resolves.toBeUndefined();
    expect(createEvent).toHaveBeenCalledTimes(1);
  });
});
