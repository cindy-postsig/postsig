jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: jest.fn(),
}));
jest.mock('@/app/lib/actions', () => ({ sendResendEmail: jest.fn() }));
jest.mock('@/app/lib/auth/trusted-device-actions', () => ({
  validateDeviceTokenServer: jest.fn(),
}));
jest.mock('@/app/lib/auth/login-rate-limit', () => ({
  checkMfaRateLimit: jest.fn(),
  recordMfaFailure: jest.fn(),
  clearMfaFailures: jest.fn(),
}));

import {
  verifyBackupCode,
  verifyEmailMFAChallenge,
  verifyEmailMFAEnrollment,
  verifyMFAChallenge,
  verifyMFAEnrollment,
} from '@/app/lib/auth/mfa-actions';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import {
  checkMfaRateLimit,
  clearMfaFailures,
  recordMfaFailure,
} from '@/app/lib/auth/login-rate-limit';
import { sha256Hash } from '@/utils/edge-crypto';

const mockCreateClient = createClient as jest.Mock;
const mockCreateServiceClient = createServiceClient as jest.Mock;
const mockCheckMfaRateLimit = checkMfaRateLimit as jest.Mock;
const mockRecordMfaFailure = recordMfaFailure as jest.Mock;
const mockClearMfaFailures = clearMfaFailures as jest.Mock;

const USER_ID = 'u1';
const CODE = '123456';
const BACKUP_CODE = 'A1B2C3D4';
const LOCKED = { allowed: false, retryAfterSeconds: 1800 };
const LOCKOUT_MESSAGE = 'Too many attempts. Please try again in 30 minutes.';

const challenge = jest.fn();
const verify = jest.fn();
const unenroll = jest.fn();
const getClaims = jest.fn();
const refreshSession = jest.fn();

/** The auth half of the client, shared by every verifier under test. */
function authDouble({ factors = [{ id: 'factor-1' }] } = {}) {
  challenge.mockResolvedValue({ data: { id: 'challenge-1' }, error: null });
  unenroll.mockResolvedValue({ error: null });
  getClaims.mockResolvedValue({ claims: { session_id: 'session-1' } });
  refreshSession.mockResolvedValue({});
  mockCreateClient.mockResolvedValue({
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: USER_ID, factors } } }),
      getClaims,
      refreshSession,
      mfa: { challenge, verify, unenroll },
    },
  });
}

/** Service client for the non-TOTP verifiers: supports the read and the write. */
function serviceDouble(row: Record<string, unknown> = {}) {
  const single = jest.fn().mockResolvedValue({ data: row, error: null });
  const selectChain: { eq: jest.Mock; single: jest.Mock } = {
    eq: jest.fn(() => selectChain),
    single,
  };
  mockCreateServiceClient.mockReturnValue({
    from: jest.fn(() => ({
      select: jest.fn(() => selectChain),
      update: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ error: null }),
      })),
    })),
  });
}

describe('MFA verification rate limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckMfaRateLimit.mockResolvedValue({ allowed: true });
    authDouble();
    serviceDouble();
  });

  describe('verifyMFAChallenge (TOTP)', () => {
    // A locked-out user must not get another code checked, so the cap cannot be
    // walked past by simply retrying.
    it('refuses to verify a code while the user is locked out', async () => {
      mockCheckMfaRateLimit.mockResolvedValue(LOCKED);

      const result = await verifyMFAChallenge(CODE);

      expect(result).toEqual({ success: false, error: LOCKOUT_MESSAGE });
      expect(verify).not.toHaveBeenCalled();
    });

    it('records a failure when the code is wrong', async () => {
      verify.mockResolvedValue({
        data: null,
        error: { message: 'Invalid code' },
      });

      const result = await verifyMFAChallenge('000000');

      expect(result.success).toBe(false);
      expect(mockRecordMfaFailure).toHaveBeenCalledWith(USER_ID);
      expect(mockClearMfaFailures).not.toHaveBeenCalled();
    });

    it('clears the counters when the code is correct', async () => {
      verify.mockResolvedValue({
        data: { access_token: 'token' },
        error: null,
      });

      const result = await verifyMFAChallenge(CODE);

      expect(result.success).toBe(true);
      expect(mockClearMfaFailures).toHaveBeenCalledWith(USER_ID);
      expect(mockRecordMfaFailure).not.toHaveBeenCalled();
    });
  });

  describe('verifyMFAEnrollment', () => {
    it('refuses to verify a code while the user is locked out', async () => {
      mockCheckMfaRateLimit.mockResolvedValue(LOCKED);

      const result = await verifyMFAEnrollment(CODE);

      expect(result).toEqual({ success: false, error: LOCKOUT_MESSAGE });
      expect(verify).not.toHaveBeenCalled();
    });

    it('records a failure when the code is wrong', async () => {
      verify.mockResolvedValue({
        data: null,
        error: { message: 'Invalid code' },
      });

      await verifyMFAEnrollment('000000');

      expect(mockRecordMfaFailure).toHaveBeenCalledWith(USER_ID);
    });

    it('clears the counters when the code is correct', async () => {
      verify.mockResolvedValue({
        data: { access_token: 'token' },
        error: null,
      });

      await verifyMFAEnrollment(CODE);

      expect(mockClearMfaFailures).toHaveBeenCalledWith(USER_ID);
    });
  });

  // The weakest secret in the chain and a full MFA bypass — unmetered, it makes
  // every other cap here decorative.
  describe('verifyBackupCode', () => {
    async function storedBackupCode() {
      return {
        backup_codes_used: [
          { hash: await sha256Hash(BACKUP_CODE), used: false },
        ],
      };
    }

    it('refuses to check a backup code while the user is locked out', async () => {
      serviceDouble(await storedBackupCode());
      mockCheckMfaRateLimit.mockResolvedValue(LOCKED);

      const result = await verifyBackupCode(BACKUP_CODE);

      expect(result).toEqual({ success: false, error: LOCKOUT_MESSAGE });
    });

    it('records a failure when the backup code does not match', async () => {
      serviceDouble(await storedBackupCode());

      const result = await verifyBackupCode('ZZZZZZZZ');

      expect(result.success).toBe(false);
      expect(mockRecordMfaFailure).toHaveBeenCalledWith(USER_ID);
    });

    it('clears the counters when the backup code matches', async () => {
      serviceDouble(await storedBackupCode());

      const result = await verifyBackupCode(BACKUP_CODE);

      expect(result.success).toBe(true);
      expect(mockClearMfaFailures).toHaveBeenCalledWith(USER_ID);
      expect(mockRecordMfaFailure).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmailMFAChallenge', () => {
    async function storedEmailCode() {
      return {
        email_mfa_secret: await sha256Hash(CODE),
        email_mfa_attempts: 0,
        email_mfa_last_sent: new Date().toISOString(),
      };
    }

    it('refuses to check a code while the user is locked out', async () => {
      serviceDouble(await storedEmailCode());
      mockCheckMfaRateLimit.mockResolvedValue(LOCKED);

      const result = await verifyEmailMFAChallenge(CODE);

      expect(result).toEqual({ success: false, error: LOCKOUT_MESSAGE });
    });

    it('records a failure when the code is wrong', async () => {
      serviceDouble(await storedEmailCode());

      const result = await verifyEmailMFAChallenge('000000');

      expect(result.success).toBe(false);
      expect(mockRecordMfaFailure).toHaveBeenCalledWith(USER_ID);
    });

    it('clears the counters when the code is correct', async () => {
      serviceDouble(await storedEmailCode());

      const result = await verifyEmailMFAChallenge(CODE);

      expect(result.success).toBe(true);
      expect(mockClearMfaFailures).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('verifyEmailMFAEnrollment', () => {
    async function storedEmailCode() {
      return {
        email_mfa_secret: await sha256Hash(CODE),
        email_mfa_attempts: 0,
        email_mfa_last_sent: new Date().toISOString(),
      };
    }

    it('refuses to check a code while the user is locked out', async () => {
      authDouble({ factors: [] });
      serviceDouble(await storedEmailCode());
      mockCheckMfaRateLimit.mockResolvedValue(LOCKED);

      const result = await verifyEmailMFAEnrollment(CODE);

      expect(result).toEqual({ success: false, error: LOCKOUT_MESSAGE });
    });

    it('records a failure when the code is wrong', async () => {
      authDouble({ factors: [] });
      serviceDouble(await storedEmailCode());

      const result = await verifyEmailMFAEnrollment('000000');

      expect(result.success).toBe(false);
      expect(mockRecordMfaFailure).toHaveBeenCalledWith(USER_ID);
    });

    it('clears the counters when the code is correct', async () => {
      authDouble({ factors: [] });
      serviceDouble(await storedEmailCode());

      const result = await verifyEmailMFAEnrollment(CODE);

      expect(result.success).toBe(true);
      expect(mockClearMfaFailures).toHaveBeenCalledWith(USER_ID);
    });
  });

  // One budget per user, not per method — otherwise the real total is however
  // many methods happen to exist.
  it('checks the same per-user budget from every verification path', async () => {
    mockCheckMfaRateLimit.mockResolvedValue(LOCKED);
    serviceDouble({
      backup_codes_used: [{ hash: await sha256Hash(BACKUP_CODE), used: false }],
      email_mfa_secret: await sha256Hash(CODE),
      email_mfa_attempts: 0,
      email_mfa_last_sent: new Date().toISOString(),
    });

    const results = [
      await verifyMFAChallenge(CODE),
      await verifyMFAEnrollment(CODE),
      await verifyBackupCode(BACKUP_CODE),
      await verifyEmailMFAChallenge(CODE),
      await verifyEmailMFAEnrollment(CODE),
    ];

    expect(results).toEqual(
      Array.from({ length: 5 }, () => ({
        success: false,
        error: LOCKOUT_MESSAGE,
      })),
    );
    expect(mockCheckMfaRateLimit).toHaveBeenCalledTimes(5);
    expect(mockCheckMfaRateLimit.mock.calls).toEqual(
      Array.from({ length: 5 }, () => [USER_ID]),
    );
  });
});
