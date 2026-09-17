// __tests__/v2/inv-overrides-actions.test.ts
//
// Server-action tests: authz, field validation, droid call, revalidatePath.
// The droid client is mocked at the module level; all authz + validation is
// tested without a real backend.

import {
  createOverride,
  revertOverride,
} from '@/app/lib/actions/investor/overrides';
import { getUserMetadata } from '@/data/users';
import {
  createOverrideViaDroid,
  revertOverrideViaDroid,
} from '@/app/lib/investor/droid-client';

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/server', () => ({ after: jest.fn((fn: () => void) => fn()) }));
jest.mock('@/data/users', () => ({ getUserMetadata: jest.fn() }));
jest.mock('@/data/superuser/investor-activities', () => ({
  logInvestorActivity: jest.fn(),
}));
jest.mock('@/app/lib/investor/droid-client', () => ({
  createOverrideViaDroid: jest.fn(),
  revertOverrideViaDroid: jest.fn(),
}));

const mockGetUserMetadata = getUserMetadata as jest.Mock;
const mockCreateViaDroid = createOverrideViaDroid as jest.Mock;
const mockRevertViaDroid = revertOverrideViaDroid as jest.Mock;

function mockInvestorUser(roleId = 12) {
  mockGetUserMetadata.mockResolvedValue({
    userId: 'user-abc',
    organizationId: 'org-xyz',
    userRole: roleId,
  });
}

const validInput = {
  entityType: 'inv_transaction',
  entityId: 42,
  fieldKey: 'amount',
  originalValue: 1000000 as number,
  overrideValue: 2000000 as number,
  reason: 'Confirmed via wire receipt',
};

describe('createOverride', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateViaDroid.mockResolvedValue(undefined);
  });

  it('forwards the override to droid (trimmed reason, no org/user — droid derives them)', async () => {
    mockInvestorUser();

    await createOverride({
      ...validInput,
      reason: '  Confirmed via wire receipt  ',
    });

    expect(mockCreateViaDroid).toHaveBeenCalledWith({
      entityType: 'inv_transaction',
      entityId: 42,
      fieldKey: 'amount',
      originalValue: 1000000,
      overrideValue: 2000000,
      reason: 'Confirmed via wire receipt',
    });
  });

  it('revalidates the investor layout on success', async () => {
    const { revalidatePath } = jest.requireMock('next/cache');
    mockInvestorUser();

    await createOverride(validInput);

    expect(revalidatePath).toHaveBeenCalledWith('/investor', 'layout');
  });

  it('returns an error for unauthenticated user (not thrown — survives the server-action boundary)', async () => {
    mockGetUserMetadata.mockResolvedValue(null);

    const result = await createOverride(validInput);
    expect(result).toEqual({ error: expect.stringMatching(/signed in/i) });
    expect(mockCreateViaDroid).not.toHaveBeenCalled();
  });

  it('returns an error for insufficient role (clientUser = 14)', async () => {
    mockInvestorUser(14);

    const result = await createOverride(validInput);
    expect(result).toEqual({ error: expect.stringMatching(/permission/i) });
    expect(mockCreateViaDroid).not.toHaveBeenCalled();
  });

  it('returns an error for unregistered field', async () => {
    mockInvestorUser();

    const result = await createOverride({
      ...validInput,
      fieldKey: 'organization_id',
    });
    expect(result).toEqual({
      error: expect.stringMatching(/cannot be edited/i),
    });
    expect(mockCreateViaDroid).not.toHaveBeenCalled();
  });

  it('accepts an Other Legal Terms status flag', async () => {
    mockInvestorUser();

    const result = await createOverride({
      entityType: 'inv_round_terms',
      entityId: 700,
      fieldKey: 'drag_along',
      originalValue: false,
      overrideValue: true,
      reason: 'Confirmed in side letter',
    });

    expect(result).toEqual({ success: true });
    expect(mockCreateViaDroid).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'inv_round_terms',
        fieldKey: 'drag_along',
        overrideValue: true,
      }),
    );
  });

  it('rejects an inv_round_terms column from an out-of-scope section', async () => {
    mockInvestorUser();

    const result = await createOverride({
      entityType: 'inv_round_terms',
      entityId: 700,
      fieldKey: 'redemption_rights',
      originalValue: false,
      overrideValue: true,
      reason: '',
    });

    expect(result).toEqual({
      error: expect.stringMatching(/cannot be edited/i),
    });
    expect(mockCreateViaDroid).not.toHaveBeenCalled();
  });

  it('forwards a security-terms edit that fills in an empty field', async () => {
    mockInvestorUser();

    const result = await createOverride({
      entityType: 'inv_security_terms',
      entityId: 771,
      fieldKey: 'anti_dilution_type',
      // The column was empty — the main reason to edit a legal term.
      originalValue: null,
      overrideValue: 'full_ratchet',
      reason: 'From the amended COI',
    });

    expect(result).toEqual({ success: true });
    expect(mockCreateViaDroid).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'inv_security_terms',
        fieldKey: 'anti_dilution_type',
        originalValue: null,
        overrideValue: 'full_ratchet',
      }),
    );
  });

  it('rejects the display label of a coded field', async () => {
    mockInvestorUser();

    const result = await createOverride({
      entityType: 'inv_security_terms',
      entityId: 771,
      fieldKey: 'anti_dilution_type',
      originalValue: 'none',
      overrideValue: 'Broad-Based Weighted Average',
      reason: '',
    });

    expect(result).toEqual({
      error: expect.stringMatching(/Anti-Dilution Rights/i),
    });
    expect(mockCreateViaDroid).not.toHaveBeenCalled();
  });

  it('rejects a dividend seniority sent as a string', async () => {
    mockInvestorUser();

    // applyOverrides would drop a stringified rank on read, so the write must
    // fail loudly here instead.
    const result = await createOverride({
      entityType: 'inv_security_terms',
      entityId: 771,
      fieldKey: 'dividend_seniority',
      originalValue: 1,
      overrideValue: '2',
      reason: '',
    });

    expect(result).toEqual({
      error: expect.stringMatching(/Dividend Seniority/i),
    });
    expect(mockCreateViaDroid).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean value for a status flag', async () => {
    mockInvestorUser();

    const result = await createOverride({
      entityType: 'inv_round_terms',
      entityId: 700,
      fieldKey: 'drag_along',
      originalValue: false,
      overrideValue: 'true',
      reason: '',
    });

    expect(result).toEqual({ error: expect.stringMatching(/Drag Along/i) });
    expect(mockCreateViaDroid).not.toHaveBeenCalled();
  });

  it('returns an error for invalid override value', async () => {
    mockInvestorUser();

    const result = await createOverride({
      ...validInput,
      overrideValue: 'not-a-number',
    });
    expect(result).toEqual({ error: expect.stringMatching(/Invalid value/i) });
    expect(mockCreateViaDroid).not.toHaveBeenCalled();
  });

  it('accepts a blank justification (optional) and forwards it trimmed to empty', async () => {
    mockInvestorUser();

    const result = await createOverride({ ...validInput, reason: '   ' });
    expect(result).toEqual({ success: true });
    expect(mockCreateViaDroid).toHaveBeenCalledWith(
      expect.objectContaining({ reason: '' }),
    );
  });

  it('surfaces a droid failure message to the user (returned, not thrown)', async () => {
    mockInvestorUser();
    mockCreateViaDroid.mockRejectedValue(
      new Error('Failed to save override (status=502)'),
    );

    const result = await createOverride(validInput);
    expect(result).toEqual({
      error: 'Failed to save override (status=502)',
    });
  });

  describe('malformed runtime payloads', () => {
    // The action is a server boundary: `input` may not match CreateOverrideInput
    // at runtime. These are rejected (returned error) before any business logic
    // or droid call.
    beforeEach(() => mockInvestorUser());

    it.each([
      ['non-string reason (null)', { reason: null }],
      ['non-string reason (number)', { reason: 42 }],
      ['non-string reason (object)', { reason: {} }],
      ['non-numeric entityId', { entityId: 'not-a-number' }],
      ['non-integer entityId', { entityId: 1.5 }],
      ['null entityId', { entityId: null }],
      ['blank entityType', { entityType: '' }],
      ['missing fieldKey', { fieldKey: undefined }],
    ])('rejects %s without calling droid', async (_label, patch) => {
      const result = await createOverride({
        ...validInput,
        ...patch,
      } as never);
      expect(result).toEqual({ error: 'Invalid override payload' });
      expect(mockCreateViaDroid).not.toHaveBeenCalled();
    });
  });
});

describe('revertOverride', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRevertViaDroid.mockResolvedValue(undefined);
  });

  it('forwards the revert to droid and revalidates', async () => {
    const { revalidatePath } = jest.requireMock('next/cache');
    mockInvestorUser();

    await revertOverride('ov-uuid-123');

    expect(mockRevertViaDroid).toHaveBeenCalledWith('ov-uuid-123');
    expect(revalidatePath).toHaveBeenCalledWith('/investor', 'layout');
  });

  it('returns an error for unauthenticated user', async () => {
    mockGetUserMetadata.mockResolvedValue(null);

    const result = await revertOverride('ov-uuid-123');
    expect(result).toEqual({ error: expect.stringMatching(/signed in/i) });
    expect(mockRevertViaDroid).not.toHaveBeenCalled();
  });

  it('returns an error for insufficient role (clientUser = 14)', async () => {
    mockInvestorUser(14);

    const result = await revertOverride('ov-uuid-123');
    expect(result).toEqual({ error: expect.stringMatching(/permission/i) });
    expect(mockRevertViaDroid).not.toHaveBeenCalled();
  });

  it('surfaces a droid failure message to the user (returned, not thrown)', async () => {
    mockInvestorUser();
    mockRevertViaDroid.mockRejectedValue(
      new Error('Failed to revert override (status=404)'),
    );

    const result = await revertOverride('ov-uuid-123');
    expect(result).toEqual({
      error: 'Failed to revert override (status=404)',
    });
  });
});
