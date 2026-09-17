import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Type-only: erased at compile time, so it cannot defeat the hoisted mock of
// the module it comes from.
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

interface RelationshipRow {
  parent_contract_id: number | null;
  child_contract_id: number | null;
}

const NEW_ID = 100;
const OLD_ID = 42;
const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const VENDOR_ID = 7;

let newContractRow: ReplacementContractRow | null = null;
let oldContractRows: ReplacementContractRow[] = [];
let relationships: RelationshipRow[] = [];
let existingEventIds: number[] = [];

const createEvent = jest.fn<(a: CreateEventArgs) => Promise<unknown>>();
const geminiCall = jest.fn<() => Promise<unknown>>();
const resolvePrompt = jest.fn<() => Promise<unknown>>();
const expandVendorIds = jest.fn<() => Promise<number[]>>();

jest.mock('@/data/superuser/contractReplacementDetection', () => ({
  createPendingReplacementEvent: (a: CreateEventArgs) => createEvent(a),
  fetchContractForReplacement: async () => newContractRow,
  fetchActiveContractsForVendors: async () => oldContractRows,
  fetchExistingEventOldContractIds: async () => existingEventIds,
}));

jest.mock('@/data/superuser/contracts', () => ({
  fetchAllRelationshipsForOrg: async () => relationships,
}));

jest.mock('@/data/superuser/vendors', () => ({
  expandVendorLineageIds: () => expandVendorIds(),
}));

jest.mock('@/lib/google', () => ({
  processWithGemini: () => geminiCall(),
}));

jest.mock('@/app/lib/prompt-resolver', () => ({
  createPromptResolver: async () => ({ resolvePrompt: () => resolvePrompt() }),
}));

import {
  buildPairCheckPrompt,
  collectChainContractIds,
  parsePairCheckResult,
  processContractReplacementDetection,
} from '@/app/lib/actions/contract-replacement-detection';
import { contractTypes } from '@/app/lib/constants';
// logAlert goes through the shared pino instance, not the per-run Inngest logger.
import pinoLogger from '@/utils/pino';

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
  metadata: { lineage: { order_number: 'SO-0' } },
  productNames: ['Terminal Pro'],
  ...overrides,
});

const NEW_ROW = contractRow({
  id: NEW_ID,
  term_start_date: [{ date: '2026-02-01' }],
  term_end_date: null,
  metadata: { lineage: { order_number: 'SO-1' } },
});

const GEMINI_YES = { data: { is_replacement: true, evidence: ['supersedes'] } };
const GEMINI_NO = { data: { is_replacement: false, evidence: [] } };

const resetState = () => {
  newContractRow = NEW_ROW;
  oldContractRows = [contractRow()];
  relationships = [];
  existingEventIds = [];
  createEvent.mockReset();
  createEvent.mockResolvedValue({ created: true, eventId: 5312 });
  geminiCall.mockReset();
  geminiCall.mockResolvedValue(GEMINI_YES);
  resolvePrompt.mockReset();
  resolvePrompt.mockResolvedValue({ content: 'Decide if this replaces.' });
  expandVendorIds.mockReset();
  expandVendorIds.mockResolvedValue([VENDOR_ID]);
  logger.info.mockReset();
  logger.warn.mockReset();
  logger.error.mockReset();
  (pinoLogger.error as jest.Mock).mockReset();
};

const run = () =>
  processContractReplacementDetection({
    contractId: NEW_ID,
    userId: USER_ID,
    logger,
    organizationId: ORG_ID,
  });

describe('collectChainContractIds', () => {
  it('includes the contract itself even with no edges', () => {
    expect([...collectChainContractIds(NEW_ID, [])]).toEqual([NEW_ID]);
  });

  it('walks edges in both directions', () => {
    // A parent reached from a child is just as much the same paper.
    const chain = collectChainContractIds(2, [
      { parent_contract_id: 1, child_contract_id: 2 },
      { parent_contract_id: 2, child_contract_id: 3 },
    ]);

    expect([...chain].sort()).toEqual([1, 2, 3]);
  });

  it('reaches transitively across the whole component', () => {
    const chain = collectChainContractIds(1, [
      { parent_contract_id: 1, child_contract_id: 2 },
      { parent_contract_id: 2, child_contract_id: 3 },
      { parent_contract_id: 3, child_contract_id: 4 },
    ]);

    expect([...chain].sort()).toEqual([1, 2, 3, 4]);
  });

  it('excludes a disconnected chain', () => {
    const chain = collectChainContractIds(1, [
      { parent_contract_id: 8, child_contract_id: 9 },
    ]);

    expect([...chain]).toEqual([1]);
  });

  it('terminates on a cycle', () => {
    const chain = collectChainContractIds(1, [
      { parent_contract_id: 1, child_contract_id: 2 },
      { parent_contract_id: 2, child_contract_id: 1 },
    ]);

    expect([...chain].sort()).toEqual([1, 2]);
  });

  it('ignores edges with a null endpoint', () => {
    const chain = collectChainContractIds(1, [
      { parent_contract_id: 1, child_contract_id: null },
      { parent_contract_id: null, child_contract_id: 1 },
    ]);

    expect([...chain]).toEqual([1]);
  });
});

describe('parsePairCheckResult', () => {
  it('reads a well-formed verdict', () => {
    expect(
      parsePairCheckResult({ is_replacement: true, evidence: ['a', 'b'] }),
    ).toEqual({ isReplacement: true, evidence: ['a', 'b'] });
  });

  it('keeps a false verdict rather than discarding it', () => {
    expect(parsePairCheckResult({ is_replacement: false })).toEqual({
      isReplacement: false,
      evidence: [],
    });
  });

  it('drops non-string evidence entries', () => {
    expect(
      parsePairCheckResult({ is_replacement: true, evidence: ['a', 7, null] })
        ?.evidence,
    ).toEqual(['a']);
  });

  it('tolerates non-array evidence as empty', () => {
    expect(
      parsePairCheckResult({ is_replacement: true, evidence: 'nope' })
        ?.evidence,
    ).toEqual([]);
  });

  it.each([
    ['null', null],
    ['a string', 'yes'],
    ['a number', 1],
    ['an object with no verdict', { evidence: ['a'] }],
    ['a non-boolean verdict', { is_replacement: 'true' }],
  ])('returns null for %s', (_label, value) => {
    // An unreadable answer must never round up into a customer-facing prompt.
    expect(parsePairCheckResult(value)).toBeNull();
  });
});

describe('buildPairCheckPrompt', () => {
  const candidate = { oldContractId: OLD_ID, dateDeltaDays: 1 };

  it('names both contracts, the overlap and the delta', () => {
    const prompt = buildPairCheckPrompt(NEW_ROW, contractRow(), candidate);

    expect(prompt).toContain('NEW CONTRACT');
    expect(prompt).toContain('OLD CONTRACT');
    expect(prompt).toContain('SO-1');
    expect(prompt).toContain('SO-0');
    expect(prompt).toContain('Terminal Pro');
    expect(prompt).toContain('1');
  });

  it('renders the contract type by name, not by raw id', () => {
    expect(buildPairCheckPrompt(NEW_ROW, contractRow(), candidate)).toContain(
      'SO',
    );
  });

  it('labels a missing order number rather than printing null', () => {
    const prompt = buildPairCheckPrompt(
      NEW_ROW,
      contractRow({ metadata: null }),
      candidate,
    );

    expect(prompt).toContain('order number: none');
  });

  it('labels an unknown contract type', () => {
    const prompt = buildPairCheckPrompt(
      NEW_ROW,
      contractRow({ type_id: null }),
      candidate,
    );

    expect(prompt).toContain('Unknown');
  });
});

describe('processContractReplacementDetection — writes a pending event', () => {
  beforeEach(resetState);

  it('writes the event when the LLM confirms the replacement', async () => {
    await run();

    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        oldContractId: OLD_ID,
        newContractId: NEW_ID,
        organizationId: ORG_ID,
      }),
    );
  });

  it('records the filter evidence alongside the LLM evidence', async () => {
    await run();

    expect(createEvent.mock.calls[0][0].evidence).toEqual({
      date_delta_days: 1,
      llm_evidence: ['supersedes'],
    });
  });

  it('searches the whole vendor merge family, not the bare vendor id', async () => {
    // A contract signed before an acquisition keeps the acquired vendor's id.
    await run();

    expect(expandVendorIds).toHaveBeenCalledTimes(1);
  });

  it('asks the LLM once per candidate', async () => {
    oldContractRows = [contractRow({ id: 1 }), contractRow({ id: 2 })];

    await run();

    expect(geminiCall).toHaveBeenCalledTimes(2);
    expect(createEvent).toHaveBeenCalledTimes(2);
  });

  it('logs counts only, never the verbatim evidence quotes', async () => {
    await run();

    expect(logger.info).toHaveBeenCalledWith({
      contractId: NEW_ID,
      organizationId: ORG_ID,
      candidateCount: 1,
      createdCount: 1,
    });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('supersedes');
  });
});

describe('processContractReplacementDetection — writes nothing', () => {
  beforeEach(resetState);

  it('writes nothing when the LLM says it is not a replacement', async () => {
    geminiCall.mockResolvedValue(GEMINI_NO);

    await run();

    expect(createEvent).not.toHaveBeenCalled();
  });

  it('skips the pair when the LLM answer is malformed', async () => {
    geminiCall.mockResolvedValue({ data: { evidence: ['x'] } });

    await run();

    expect(createEvent).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('skips the pair when the LLM call throws', async () => {
    geminiCall.mockRejectedValue(new Error('gemini down'));

    await expect(run()).resolves.toBeUndefined();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('lets the other candidates through when one LLM call fails', async () => {
    // One bad pair must not cost the others their check.
    oldContractRows = [contractRow({ id: 1 }), contractRow({ id: 2 })];
    geminiCall.mockRejectedValueOnce(new Error('gemini down'));

    await run();

    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(createEvent.mock.calls[0][0].oldContractId).toBe(2);
  });

  it('no-ops when the pair-check prompt is not published yet', async () => {
    // The expected steady state until the toolkit prompt ships.
    resolvePrompt.mockRejectedValue(new Error('No prompt found'));

    await run();

    expect(geminiCall).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
    expect(pinoLogger.error).not.toHaveBeenCalled();
  });

  it('no-ops when the resolved prompt is blank', async () => {
    resolvePrompt.mockResolvedValue({ content: '   ' });

    await run();

    expect(geminiCall).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('never resolves a prompt when there are no candidates', async () => {
    // The common case must cost no prompt lookup and no LLM call.
    oldContractRows = [];

    await run();

    expect(resolvePrompt).not.toHaveBeenCalled();
    expect(geminiCall).not.toHaveBeenCalled();
  });

  it('no-ops for a contract that has no vendor', async () => {
    newContractRow = contractRow({ id: NEW_ID, vendor_id: null });

    await run();

    expect(expandVendorIds).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('no-ops when the contract row is missing', async () => {
    newContractRow = null;

    await expect(run()).resolves.toBeUndefined();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('does not re-raise a pair that already has an event', async () => {
    // Covers the rejected pair: suppression is by pair, at any status.
    existingEventIds = [OLD_ID];

    await run();

    expect(geminiCall).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('does not flag a contract in its own lineage chain', async () => {
    relationships = [{ parent_contract_id: NEW_ID, child_contract_id: OLD_ID }];

    await run();

    expect(createEvent).not.toHaveBeenCalled();
  });
});

describe('processContractReplacementDetection — retries and failures', () => {
  beforeEach(resetState);

  it('is idempotent when the step is retried and the row exists', async () => {
    // Inngest retries steps; the data layer no-ops on the duplicate.
    createEvent.mockResolvedValue({ created: false });

    await expect(run()).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ candidateCount: 1, createdCount: 0 }),
    );
  });

  it('swallows a write failure so extraction is never failed', async () => {
    createEvent.mockRejectedValue(new Error('db down'));

    await expect(run()).resolves.toBeUndefined();
  });

  it('pages a monitor when detection fails', async () => {
    // Swallowing keeps extraction alive, but a dropped detection is invisible.
    createEvent.mockRejectedValue(new Error('db down'));

    await run();

    const alerted = (pinoLogger.error as jest.Mock).mock.calls.find(
      (call) =>
        (call[0] as { alert?: string } | undefined)?.alert ===
        'contract-replacement-detection-failure',
    );

    expect(alerted).toBeDefined();
    expect(alerted?.[0]).toMatchObject({
      processName: 'processContractReplacementDetection',
      contractId: NEW_ID,
      userId: USER_ID,
      organizationId: ORG_ID,
    });
  });

  it('swallows and alerts when the vendor lineage lookup fails', async () => {
    expandVendorIds.mockRejectedValue(new Error('lineage down'));

    await expect(run()).resolves.toBeUndefined();
    expect(pinoLogger.error).toHaveBeenCalled();
  });
});
