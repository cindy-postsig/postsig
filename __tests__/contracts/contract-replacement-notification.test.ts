import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { ReplacementContractRow } from '@/data/superuser/contractReplacementDetection';

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

interface CreateEventArgs {
  oldContractId: number;
  newContractId: number;
  organizationId: string;
  evidence?: unknown;
}

const NEW_ID = 100;
const OLD_ID = 42;
const ORG_ID = 'org-1';
const VENDOR_ID = 7;
const EVENT_ID = 5312;

let newContractRow: ReplacementContractRow | null = null;
let oldContractRows: ReplacementContractRow[] = [];

const createEvent =
  jest.fn<
    (
      a: CreateEventArgs,
    ) => Promise<{ created: boolean; eventId: number | null }>
  >();
const geminiCall = jest.fn<() => Promise<unknown>>();
const sendEmail = jest.fn<(a: Record<string, unknown>) => Promise<void>>();
const logAlertMock = jest.fn();

jest.mock('@/data/superuser/contractReplacementDetection', () => ({
  createPendingReplacementEvent: (a: CreateEventArgs) => createEvent(a),
  fetchContractForReplacement: async () => newContractRow,
  fetchActiveContractsForVendors: async () => oldContractRows,
  fetchExistingEventOldContractIds: async () => [],
}));

jest.mock('@/data/superuser/contracts', () => ({
  fetchAllRelationshipsForOrg: async () => [],
}));

jest.mock('@/data/superuser/vendors', () => ({
  expandVendorLineageIds: async () => [VENDOR_ID],
}));

jest.mock('@/lib/google', () => ({
  processWithGemini: () => geminiCall(),
}));

jest.mock('@/app/lib/prompt-resolver', () => ({
  createPromptResolver: async () => ({
    resolvePrompt: async () => ({ content: 'Decide if this replaces.' }),
  }),
}));

jest.mock('@/app/lib/emails/contract-replacement', () => ({
  sendContractReplacementEmail: (a: Record<string, unknown>) => sendEmail(a),
}));

jest.mock('@/utils/logging/alert', () => ({
  logAlert: (...args: unknown[]) => logAlertMock(...args),
}));

import { processContractReplacementDetection } from '@/app/lib/actions/contract-replacement-detection';
import { contractTypes } from '@/app/lib/constants';

const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const contractRow = (
  overrides: Partial<ReplacementContractRow> = {},
): ReplacementContractRow => ({
  id: OLD_ID,
  vendor_id: VENDOR_ID,
  type_id: contractTypes.SO,
  status: 'active',
  term_start_date: null,
  term_end_date: [{ date: '2026-01-31' }],
  metadata: null,
  productNames: ['Terminal Pro'],
  ...overrides,
});

const NEW_ROW = contractRow({
  id: NEW_ID,
  term_start_date: [{ date: '2026-02-01' }],
  term_end_date: null,
});

const run = () =>
  processContractReplacementDetection({
    contractId: NEW_ID,
    userId: 'user-1',
    logger,
    organizationId: ORG_ID,
  });

beforeEach(() => {
  jest.clearAllMocks();
  newContractRow = NEW_ROW;
  oldContractRows = [contractRow()];
  createEvent.mockResolvedValue({ created: true, eventId: EVENT_ID });
  geminiCall.mockResolvedValue({
    data: { is_replacement: true, evidence: ['supersedes'] },
  });
  sendEmail.mockResolvedValue(undefined);
});

describe('replacement detection — notification', () => {
  it('emails the extractors once a pending event is written', async () => {
    await run();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      oldContract: oldContractRows[0],
      newContract: NEW_ROW,
      dateDeltaDays: 1,
      evidence: ['supersedes'],
      organizationId: ORG_ID,
    });
  });

  it('sends nothing when the LLM rejects the pair', async () => {
    geminiCall.mockResolvedValue({
      data: { is_replacement: false, evidence: [] },
    });

    await run();

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not re-send on the retry that hits the dedupe index', async () => {
    // The row already exists, so the extractors were mailed on the first pass.
    createEvent.mockResolvedValue({ created: false, eventId: null });

    await run();

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('keeps the event when the email fails, and alerts', async () => {
    // The row is already written; rethrowing would re-run the LLM on retry.
    sendEmail.mockRejectedValue(new Error('resend down'));

    await expect(run()).resolves.toBeUndefined();

    expect(logAlertMock).toHaveBeenCalledWith(
      'contract-replacement-email-failure',
      expect.any(Error),
      { eventId: EVENT_ID, organizationId: ORG_ID, newContractId: NEW_ID },
      expect.any(String),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ createdCount: 1 }),
    );
  });
});
