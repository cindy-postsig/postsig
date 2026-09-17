import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('server-only', () => ({}));

const logAlert = jest.fn();
jest.mock('@/utils/logging/alert', () => ({
  logAlert: (...args: unknown[]) => logAlert(...args),
}));

interface EventLike {
  id: number;
  old_contract_id: number;
  new_contract_id: number;
  organization_id: string;
  status: string;
}

interface SummaryLike {
  id: number;
  orderNumber: string | null;
  vendorName: string | null;
  firstProductName: string | null;
  startDate: string | null;
  endDate: string | null;
}

const fetchVerifiedEventsForContracts = jest.fn(
  async (_args: unknown): Promise<EventLike[]> => [],
);
const fetchVerifiedEventsForNewContract = jest.fn(
  async (_args: unknown): Promise<EventLike[]> => [],
);
const fetchConfirmedEventForOldContract = jest.fn(
  async (_args: unknown): Promise<EventLike | null> => null,
);
const fetchReplacementContractSummary = jest.fn(
  async (_args: unknown): Promise<SummaryLike | null> => null,
);

jest.mock('@/data/superuser/contractReplacementResolution', () => ({
  fetchVerifiedEventsForContracts: (args: unknown) =>
    fetchVerifiedEventsForContracts(args),
  fetchVerifiedEventsForNewContract: (args: unknown) =>
    fetchVerifiedEventsForNewContract(args),
  fetchConfirmedEventForOldContract: (args: unknown) =>
    fetchConfirmedEventForOldContract(args),
  fetchReplacementContractSummary: (args: unknown) =>
    fetchReplacementContractSummary(args),
}));

import { resolveContractReplacementSurfaces } from '@/lib/contracts/replacementSurfaces';

const ORG_ID = 'org-1';
const CONTRACT_ID = 7;
const DATE_FORMAT = 'dd/MM/yyyy';

const verifiedEvent: EventLike = {
  id: 11,
  old_contract_id: CONTRACT_ID,
  new_contract_id: 9,
  organization_id: ORG_ID,
  status: 'verified',
};

const summary: SummaryLike = {
  id: 9,
  orderNumber: 'SO-1042',
  vendorName: 'Acme Corp',
  firstProductName: 'Widget Pro',
  startDate: '2026-02-01',
  endDate: '2027-01-31',
};

/** The page contract's own summary — the old side of `prompt`. */
const pageSummary: SummaryLike = {
  id: CONTRACT_ID,
  orderNumber: 'SO-0007',
  vendorName: 'Acme Corp',
  firstProductName: 'Widget Pro',
  startDate: '2025-02-01',
  endDate: '2026-01-31',
};

/** Route summary lookups by contract id, as the real fetch does. */
const summariesById = (byId: Record<number, SummaryLike | null>) => {
  fetchReplacementContractSummary.mockImplementation(async (args: unknown) => {
    const { contractId } = args as { contractId: number };
    return byId[contractId] ?? null;
  });
};

const resolve = () =>
  resolveContractReplacementSurfaces({
    contractId: CONTRACT_ID,
    organizationId: ORG_ID,
    dateFormat: DATE_FORMAT,
  });

beforeEach(() => {
  jest.clearAllMocks();
  fetchVerifiedEventsForContracts.mockResolvedValue([]);
  fetchVerifiedEventsForNewContract.mockResolvedValue([]);
  fetchConfirmedEventForOldContract.mockResolvedValue(null);
  fetchReplacementContractSummary.mockResolvedValue(summary);
});

describe('resolveContractReplacementSurfaces prompt', () => {
  it('builds the prompt from a verified event', async () => {
    fetchVerifiedEventsForContracts.mockResolvedValue([verifiedEvent]);

    const { prompt } = await resolve();

    expect(prompt).toMatchObject({
      eventId: 11,
      oldContractId: CONTRACT_ID,
      linkedContractId: 9,
      vendorName: 'Acme Corp',
      firstProductName: 'Widget Pro',
      linkedContractDate: '01/02/2026',
    });
  });

  it('renders no prompt when there is no verified event', async () => {
    // Pending events have not passed extractor screening; rejected ones are
    // permanently suppressed. Neither reaches the fetch this reads.
    const { prompt } = await resolve();

    expect(prompt).toBeNull();
  });

  it('renders no prompt when the new contract is unreadable', async () => {
    fetchVerifiedEventsForContracts.mockResolvedValue([verifiedEvent]);
    fetchReplacementContractSummary.mockResolvedValue(null);

    const { prompt } = await resolve();

    expect(prompt).toBeNull();
  });

  it("carries the page contract's own formatted end date", async () => {
    // The page contract is the old side — its end date feeds line 2.
    fetchVerifiedEventsForContracts.mockResolvedValue([verifiedEvent]);
    summariesById({ 9: summary, [CONTRACT_ID]: pageSummary });

    const { prompt } = await resolve();

    expect(prompt).toMatchObject({ oldContractEndDate: '31/01/2026' });
  });

  it('degrades line 2 to no date when the end date is missing', async () => {
    // Detection guaranteed an end date once, but data can change afterwards.
    fetchVerifiedEventsForContracts.mockResolvedValue([verifiedEvent]);
    summariesById({
      9: summary,
      [CONTRACT_ID]: { ...pageSummary, endDate: null },
    });

    const { prompt } = await resolve();

    expect(prompt).toMatchObject({ oldContractEndDate: null });
  });
});

describe('resolveContractReplacementSurfaces prompts as replacement', () => {
  const eventAsNew = (id: number, oldContractId: number): EventLike => ({
    id,
    old_contract_id: oldContractId,
    new_contract_id: CONTRACT_ID,
    organization_id: ORG_ID,
    status: 'verified',
  });

  const oldSummary: SummaryLike = {
    id: 3,
    orderNumber: 'SO-0003',
    vendorName: 'OldCo',
    firstProductName: 'Widget Pro',
    startDate: '2024-02-01',
    endDate: '2026-06-30',
  };

  it('builds one entry per verified event naming the page contract as new', async () => {
    fetchVerifiedEventsForNewContract.mockResolvedValue([
      eventAsNew(21, 3),
      eventAsNew(22, 4),
    ]);
    summariesById({
      3: oldSummary,
      4: { ...oldSummary, id: 4, vendorName: 'OtherCo', endDate: '2026-09-30' },
    });

    const { promptsAsReplacement } = await resolve();

    expect(promptsAsReplacement).toEqual([
      expect.objectContaining({
        eventId: 21,
        oldContractId: 3,
        oldContractVendorName: 'OldCo',
        oldContractEndDate: '30/06/2026',
      }),
      expect.objectContaining({
        eventId: 22,
        oldContractId: 4,
        oldContractVendorName: 'OtherCo',
        oldContractEndDate: '30/09/2026',
      }),
    ]);
  });

  it('builds line-1 copy from the OLD contract the event would archive', async () => {
    // On this surface the page contract is the replacement; the banner names
    // and links the old contract instead.
    fetchVerifiedEventsForNewContract.mockResolvedValue([eventAsNew(21, 3)]);
    summariesById({ 3: oldSummary });

    const { promptsAsReplacement } = await resolve();

    expect(promptsAsReplacement[0]).toMatchObject({
      linkedContractId: 3,
      vendorName: 'OldCo',
      firstProductName: 'Widget Pro',
      linkedContractDate: '01/02/2024',
    });
  });

  it('skips an entry whose old contract is unreadable', async () => {
    fetchVerifiedEventsForNewContract.mockResolvedValue([
      eventAsNew(21, 3),
      eventAsNew(22, 4),
    ]);
    summariesById({
      3: null,
      4: { ...oldSummary, id: 4 },
    });

    const { promptsAsReplacement } = await resolve();

    expect(promptsAsReplacement).toEqual([
      expect.objectContaining({ eventId: 22 }),
    ]);
  });

  it('falls back to a neutral vendor name for the archive toast', async () => {
    fetchVerifiedEventsForNewContract.mockResolvedValue([eventAsNew(21, 3)]);
    summariesById({
      3: { ...oldSummary, vendorName: null },
    });

    const { promptsAsReplacement } = await resolve();

    expect(promptsAsReplacement[0]).toMatchObject({
      oldContractVendorName: 'this',
    });
  });

  it('scopes the event lookup to the caller org', async () => {
    await resolve();

    expect(fetchVerifiedEventsForNewContract).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      contractId: CONTRACT_ID,
    });
  });
});

describe('resolveContractReplacementSurfaces replaced-by flag', () => {
  it('builds the flag from a confirmed event', async () => {
    fetchConfirmedEventForOldContract.mockResolvedValue({
      ...verifiedEvent,
      status: 'confirmed',
    });

    const { replacedBy } = await resolve();

    expect(replacedBy).toEqual({
      newContractId: 9,
      newContractNumber: 'SO-1042',
    });
  });

  it('renders no flag when nothing was confirmed', async () => {
    const { replacedBy } = await resolve();

    expect(replacedBy).toBeNull();
  });

  it('renders the prompt and the flag independently', async () => {
    // A contract can carry a confirmed replacement and later be proposed again.
    fetchVerifiedEventsForContracts.mockResolvedValue([verifiedEvent]);
    fetchConfirmedEventForOldContract.mockResolvedValue({
      ...verifiedEvent,
      id: 12,
      new_contract_id: 4,
      status: 'confirmed',
    });

    const { prompt, replacedBy } = await resolve();

    expect(prompt).not.toBeNull();
    expect(replacedBy).not.toBeNull();
  });
});

describe('resolveContractReplacementSurfaces failure handling', () => {
  it('degrades to rendering nothing and pages a monitor', async () => {
    // A failed lookup must not fail the whole contract page.
    fetchVerifiedEventsForContracts.mockRejectedValue(new Error('boom'));

    await expect(resolve()).resolves.toEqual({
      prompt: null,
      replacedBy: null,
      promptsAsReplacement: [],
    });
    expect(logAlert).toHaveBeenCalledWith(
      'contract-replacement-fetch-failure',
      expect.any(Error),
      expect.objectContaining({ contractId: CONTRACT_ID }),
      expect.any(String),
    );
  });

  it('scopes every lookup to the caller org', async () => {
    fetchVerifiedEventsForContracts.mockResolvedValue([verifiedEvent]);

    await resolve();

    expect(fetchVerifiedEventsForContracts).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      contractIds: [CONTRACT_ID],
    });
    expect(fetchReplacementContractSummary).toHaveBeenCalledWith({
      contractId: 9,
      organizationId: ORG_ID,
    });
    expect(fetchConfirmedEventForOldContract).toHaveBeenCalledWith({
      contractId: CONTRACT_ID,
      organizationId: ORG_ID,
    });
  });
});
