import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { userRoles } from '@/constants/data';

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

const revalidatePath = jest.fn();
jest.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));

interface UserMetadataLike {
  userId: string;
  userRole: number;
  organizationId: string;
}

const CLIENT_ADMIN_ROLE = userRoles.clientAdmin;
const ORG_ID = 'org-1';
const OTHER_ORG_ID = 'org-2';
const USER_ID = 'user-1';
const EVENT_ID = 11;
const OLD_CONTRACT_ID = 7;

let userMetadata: UserMetadataLike | null = null;
let canUpdateContract = true;
let eventRow: Record<string, unknown> | null = null;
let eventError: { message: string } | null = null;

const getUserMetadata = jest.fn(async () => userMetadata);
jest.mock('@/data/users', () => ({
  getUserMetadata: () => getUserMetadata(),
}));

jest.mock('@postsig/toolkit', () => ({
  defineAbilitiesFor: () => ({
    can: (action: string, subject: string) =>
      action === 'update' && subject === 'Contract' ? canUpdateContract : false,
  }),
}));

/** Chainable stub for the single `contract_lineage_events` lookup. */
function makeEventBuilder() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: eventRow, error: eventError }),
  };
  return builder;
}

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({ from: () => makeEventBuilder() }),
}));

const resolveReplacementEvent = jest.fn(
  async (_args: unknown) => ({ resolved: true }) as { resolved: boolean },
);
jest.mock('@/data/superuser/contractReplacementResolution', () => ({
  resolveReplacementEvent: (args: unknown) => resolveReplacementEvent(args),
}));

import {
  confirmContractReplacement,
  rejectContractReplacement,
} from '@/app/lib/contract-replacements/actions';
import { AuthenticationError, AuthorizationError } from '@/lib/errors';

const resetState = () => {
  userMetadata = {
    userId: USER_ID,
    userRole: CLIENT_ADMIN_ROLE,
    organizationId: ORG_ID,
  };
  canUpdateContract = true;
  eventRow = {
    id: EVENT_ID,
    old_contract_id: OLD_CONTRACT_ID,
    organization_id: ORG_ID,
  };
  eventError = null;
  revalidatePath.mockClear();
  getUserMetadata.mockClear();
  resolveReplacementEvent.mockClear();
  resolveReplacementEvent.mockResolvedValue({ resolved: true });
};

describe('replacement resolution authorization', () => {
  beforeEach(resetState);

  it('rejects an unauthenticated caller before touching the event', async () => {
    userMetadata = null;

    await expect(confirmContractReplacement(EVENT_ID)).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    expect(resolveReplacementEvent).not.toHaveBeenCalled();
  });

  it('rejects a caller whose role is not a client role', async () => {
    userMetadata = { userId: USER_ID, userRole: 999, organizationId: ORG_ID };

    await expect(confirmContractReplacement(EVENT_ID)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(resolveReplacementEvent).not.toHaveBeenCalled();
  });

  it('rejects a caller who cannot update contracts', async () => {
    // Answering the prompt archives a contract, so it needs the archive right.
    canUpdateContract = false;

    await expect(confirmContractReplacement(EVENT_ID)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(resolveReplacementEvent).not.toHaveBeenCalled();
  });

  it('rejects an event belonging to another organization', async () => {
    // The service client bypasses RLS; this comparison is the tenancy guard.
    eventRow = {
      id: EVENT_ID,
      old_contract_id: OLD_CONTRACT_ID,
      organization_id: OTHER_ORG_ID,
    };

    await expect(confirmContractReplacement(EVENT_ID)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(resolveReplacementEvent).not.toHaveBeenCalled();
  });

  it('rejects an unknown event id', async () => {
    eventRow = null;

    await expect(rejectContractReplacement(EVENT_ID)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(resolveReplacementEvent).not.toHaveBeenCalled();
  });

  it('rejects when the event lookup errors', async () => {
    eventRow = null;
    eventError = { message: 'connection reset' };

    await expect(rejectContractReplacement(EVENT_ID)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(resolveReplacementEvent).not.toHaveBeenCalled();
  });

  it('applies the same guards to the reject path', async () => {
    canUpdateContract = false;

    await expect(rejectContractReplacement(EVENT_ID)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });
});

describe('rejectContractReplacement', () => {
  beforeEach(resetState);

  it('resolves the event to rejected for the caller and org', async () => {
    await rejectContractReplacement(EVENT_ID);

    expect(resolveReplacementEvent).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      organizationId: ORG_ID,
      status: 'rejected',
      userId: USER_ID,
    });
  });

  it('revalidates the old contract page so the banner disappears', async () => {
    await rejectContractReplacement(EVENT_ID);

    expect(revalidatePath).toHaveBeenCalledWith(
      `/contracts/${OLD_CONTRACT_ID}`,
    );
  });

  it('reports the resolution outcome to the caller', async () => {
    resolveReplacementEvent.mockResolvedValue({ resolved: false });

    await expect(rejectContractReplacement(EVENT_ID)).resolves.toEqual({
      resolved: false,
    });
  });
});

describe('confirmContractReplacement', () => {
  beforeEach(resetState);

  it('resolves the event to confirmed for the caller and org', async () => {
    await confirmContractReplacement(EVENT_ID);

    expect(resolveReplacementEvent).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      organizationId: ORG_ID,
      status: 'confirmed',
      userId: USER_ID,
    });
  });

  it('leaves archiving to the existing archive path', async () => {
    // The caller drives /api/contracts/update, which owns invoice cascade, the
    // non-invoice opt-in and the audit log. This action must not fork it.
    await confirmContractReplacement(EVENT_ID);

    expect(resolveReplacementEvent).toHaveBeenCalledTimes(1);
  });

  it('reports not resolved when the event is no longer verified', async () => {
    // Double-confirm: the data layer's expectedStatus guard matched no row.
    resolveReplacementEvent.mockResolvedValue({ resolved: false });

    await expect(confirmContractReplacement(EVENT_ID)).resolves.toEqual({
      resolved: false,
    });
  });

  it('propagates a failure to stamp the event so the caller can retry', async () => {
    // The archive already succeeded; the prompt must stay until resolved.
    resolveReplacementEvent.mockRejectedValue(new Error('update failed'));

    await expect(confirmContractReplacement(EVENT_ID)).rejects.toThrow(
      'update failed',
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
