import {
  CODE_VERIFY_COOLDOWN_AFTER_ATTEMPTS,
  CODE_VERIFY_COOLDOWN_MAX_SECONDS,
  CODE_VERIFY_COOLDOWN_SECONDS,
  CODE_VERIFY_LOCKOUT_AFTER_FAILURES,
  CODE_VERIFY_LOCKOUT_SECONDS,
  CODE_VERIFY_WINDOW_SECONDS,
  LOGIN_COOLDOWN_AFTER_ATTEMPTS,
  LOGIN_COOLDOWN_MAX_SECONDS,
  LOGIN_COOLDOWN_SECONDS,
  LOGIN_FAILURE_WINDOW_SECONDS,
  LOGIN_IP_COOLDOWN_AFTER_FAILURES,
  LOGIN_IP_COOLDOWN_MAX_SECONDS,
  LOGIN_IP_COOLDOWN_SECONDS,
  LOGIN_IP_LOCKOUT_AFTER_FAILURES,
  LOGIN_IP_LOCKOUT_SECONDS,
  LOGIN_LOCKOUT_AFTER_FAILURES,
  LOGIN_LOCKOUT_ESCALATION_WINDOW_SECONDS,
  LOGIN_LOCKOUT_REPEAT_SECONDS,
  LOGIN_LOCKOUT_SECONDS,
  LOGIN_RATE_LIMIT_TIMEOUT_MS,
} from '@/constants/security';
import { getRedisService } from '@/app/lib/redis/service';
import { getServerDeviceContext } from '@/app/lib/auth/trusted-device-utils';
import { getHash } from '@/app/lib/utils';
import { logAlert } from '@/utils/logging/alert';
import logger from '@/utils/pino';

export type LoginRateLimitDecision =
  /**
   * `nextAttemptInSeconds` is a cooldown this call has just planted: the attempt
   * goes ahead, but the one after it is refused until the wait elapses. Handing
   * it back lets the caller pace the user rather than let them spend a
   * submission discovering the wall.
   */
  | { allowed: true; nextAttemptInSeconds?: number }
  | { allowed: false; retryAfterSeconds: number };

/**
 * What a failure did to the counters; the caller owns the audit write.
 * Nullable fields are null when unknown (limiter off, or store unreachable) —
 * never 0, which would read as "no attempts left".
 */
export type LoginFailureOutcome = {
  emailLocked: boolean;
  ipLocked: boolean;
  failures: number;
  /** Attempts left before the email locks, floored at 0. */
  attemptsRemaining: number | null;
  /** How long the lock applied by *this* failure holds; null if none was. */
  lockedForSeconds: number | null;
};

type Redis = Awaited<ReturnType<typeof getRedisService>>;

const ALLOWED: LoginRateLimitDecision = { allowed: true };

/** Redis reports a missing key as a TTL of -2 and one with no expiry as -1. */
const NO_KEY = -2;

// Emails are hashed so a keyspace dump is not a ready-made list of addresses.
// Unsalted, so it will not resist confirming an address someone already guessed.
const emailAttemptKey = (email: string) =>
  `auth:attempt:email:${getHash(email)}`;
const emailFailureKey = (email: string) => `auth:fail:email:${getHash(email)}`;
const emailCooldownKey = (email: string) =>
  `auth:cooldown:email:${getHash(email)}`;
const emailLockKey = (email: string) => `auth:lock:email:${getHash(email)}`;
const emailLockCountKey = (email: string) =>
  `auth:locks:email:${getHash(email)}`;
const ipFailureKey = (id: string) => `auth:fail:ip:${id}`;
const ipLockKey = (id: string) => `auth:lock:ip:${id}`;
const ipCooldownKey = (id: string) => `auth:cooldown:ip:${id}`;
const mfaAttemptKey = (userId: string) => `auth:mfa:attempt:${userId}`;
const mfaFailureKey = (userId: string) => `auth:mfa:fail:${userId}`;
const mfaCooldownKey = (userId: string) => `auth:mfa:cooldown:${userId}`;
const mfaLockKey = (userId: string) => `auth:mfa:lock:${userId}`;
const resetAttemptKey = (email: string) =>
  `auth:reset:attempt:${getHash(email)}`;
const resetFailureKey = (email: string) => `auth:reset:fail:${getHash(email)}`;
const resetCooldownKey = (email: string) =>
  `auth:reset:cooldown:${getHash(email)}`;
const resetLockKey = (email: string) => `auth:reset:lock:${getHash(email)}`;

// Off only in local dev with no store configured, so a mis-set ENV cannot
// disable the control in a deployed environment.
const isDisabled = () =>
  process.env.NODE_ENV !== 'production' &&
  process.env.ENV === 'local' &&
  !process.env.ELASTICACHE_REDIS_URL;

if (isDisabled()) {
  logger.warn(
    { action: 'loginRateLimit' },
    'Login rate limiting disabled: local development with no ELASTICACHE_REDIS_URL',
  );
}

const normalize = (email: string) => email.trim().toLowerCase();

/**
 * Counts an IPv6 /64 as one source, since a routed /64 is a single allocation.
 * IPv4 — including the IPv4-mapped form — is counted as the address itself.
 */
function normalizeIp(ip: string): string {
  const bare = ip
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split('%')[0];
  if (!bare) return bare;

  const mappedV4 = bare.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedV4) return mappedV4[1];
  if (!bare.includes(':')) return bare;

  const [head, tail] = bare.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const groups = bare.includes('::')
    ? [
        ...headGroups,
        ...Array<string>(
          Math.max(0, 8 - headGroups.length - tailGroups.length),
        ).fill('0'),
        ...tailGroups,
      ]
    : headGroups;

  if (groups.length < 4) return bare;
  return groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':');
}

/**
 * Coarse per-client identity for the spray tier: the normalized IP plus a
 * hashed user agent, so a shared office address or CGNAT is not one bucket.
 * Weak alone — a script can omit or copy a UA string — but a spray run
 * typically reuses one UA throughout, so pairing it with the IP still isolates
 * that run from the other people behind the same address.
 */
function deviceId(ip: string, userAgent: string | undefined): string {
  return `${ip}:${getHash(userAgent ?? '')}`;
}

// Throttled: an outage would otherwise alert on every login and get the
// monitor muted, silencing the only signal that the limiter is off.
const ALERT_INTERVAL_MS = 60_000;
let lastAlertAt = 0;

function alertOnce(
  error: unknown,
  context: Record<string, unknown>,
  message: string,
): void {
  const now = Date.now();
  if (now - lastAlertAt < ALERT_INTERVAL_MS) return;
  lastAlertAt = now;
  logAlert('login-rate-limit-backend-failure', error, context, message);
}

function failOpen(
  error: unknown,
  context: Record<string, unknown>,
): LoginRateLimitDecision {
  alertOnce(
    error,
    context,
    'Login rate limiting unavailable; allowing the attempt',
  );
  return ALLOWED;
}

/**
 * Bounds how long the limiter may spend before the login proceeds anyway.
 */
async function withDeadline<T>(
  operation: () => Promise<T>,
  onUnavailable: (error: unknown) => T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          resolve(onUnavailable(new Error('Login rate limit store timed out')));
        }, LOGIN_RATE_LIMIT_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    return onUnavailable(error);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Falls back to the full period for a missing or non-expiring key, never 0. */
function refuse(ttl: number, fallbackSeconds: number): LoginRateLimitDecision {
  return {
    allowed: false,
    retryAfterSeconds: ttl > 0 ? ttl : fallbackSeconds,
  };
}

/** Allowed, carrying any wait this call planted for the attempt after it. */
function planted(seconds: number): LoginRateLimitDecision {
  return seconds > 0
    ? { allowed: true, nextAttemptInSeconds: seconds }
    : ALLOWED;
}

/** Climbs by one base step at a time, capped (10s, 20s, 30s, 40s). Step 1 = first past the allowance. */
function progressiveCooldown(
  step: number,
  baseSeconds: number,
  maxSeconds: number,
): number {
  return Math.min(maxSeconds, baseSeconds * step);
}

/**
 * The spray tier, shared by every unauthenticated credential check so one client
 * working through many accounts spends one budget however it varies the address.
 *
 * Reads the failures already recorded rather than counting this attempt, so a
 * shared address carrying ordinary successful traffic never throttles itself.
 */
async function checkDeviceTier(
  redis: Redis,
  id: string,
): Promise<LoginRateLimitDecision> {
  const lockTtl = await redis.getTtl(ipLockKey(id));
  if (lockTtl !== NO_KEY) return refuse(lockTtl, LOGIN_IP_LOCKOUT_SECONDS);

  const failures = await redis.getCount(ipFailureKey(id));
  if (failures < LOGIN_IP_COOLDOWN_AFTER_FAILURES) return ALLOWED;

  const cooldown = ipCooldownKey(id);
  // +1 because these are failures *behind* this attempt, where the other tiers
  // count the attempt itself — without it the allowance runs one attempt long.
  const wait = progressiveCooldown(
    failures - LOGIN_IP_COOLDOWN_AFTER_FAILURES + 1,
    LOGIN_IP_COOLDOWN_SECONDS,
    LOGIN_IP_COOLDOWN_MAX_SECONDS,
  );
  if (await redis.setIfAbsent(cooldown, wait)) return planted(wait);

  return refuse(await redis.getTtl(cooldown), wait);
}

/** Counts a failure against the client and locks it at the spray threshold. */
async function recordDeviceFailure(redis: Redis, id: string): Promise<boolean> {
  const failures = await redis.incrementWithExpiry(
    ipFailureKey(id),
    LOGIN_FAILURE_WINDOW_SECONDS,
  );
  if (failures < LOGIN_IP_LOCKOUT_AFTER_FAILURES) return false;

  await redis.setWithTtl(ipLockKey(id), LOGIN_IP_LOCKOUT_SECONDS);
  return true;
}

/** Repeat locks inside the escalation window step along the ladder. */
async function nextLockoutSeconds(
  redis: Redis,
  address: string,
): Promise<number> {
  const locks = await redis.incrementWithExpiry(
    emailLockCountKey(address),
    LOGIN_LOCKOUT_ESCALATION_WINDOW_SECONDS,
  );
  const index = Math.min(locks, LOGIN_LOCKOUT_REPEAT_SECONDS.length) - 1;
  return LOGIN_LOCKOUT_REPEAT_SECONDS[index] ?? LOGIN_LOCKOUT_SECONDS;
}

/**
 * Runs before the credentials reach Supabase, so a throttled attempt cannot
 * test a password. Keyed on the submitted email whether or not it exists, so
 * the refusal cannot be used to enumerate accounts.
 */
export async function checkLoginRateLimit(
  email: string,
): Promise<LoginRateLimitDecision> {
  if (isDisabled()) return ALLOWED;

  const address = normalize(email);

  return withDeadline(
    async () => {
      const redis = await getRedisService();
      const { ipAddress, userAgent } = await getServerDeviceContext();

      // Sequential, not parallel: on a lazily connected client the first two
      // commands race to open the connection and the loser used to read as
      // "not locked".
      const emailLockTtl = await redis.getTtl(emailLockKey(address));
      if (emailLockTtl !== NO_KEY) {
        return refuse(emailLockTtl, LOGIN_LOCKOUT_SECONDS);
      }

      const id = ipAddress
        ? deviceId(normalizeIp(ipAddress), userAgent)
        : undefined;
      let pending = 0;
      if (id) {
        const device = await checkDeviceTier(redis, id);
        if (!device.allowed) return device;
        pending = device.nextAttemptInSeconds ?? 0;
      }

      // Counted at the gate so a concurrent burst cannot all read one low count.
      const attempts = await redis.incrementWithExpiry(
        emailAttemptKey(address),
        LOGIN_FAILURE_WINDOW_SECONDS,
      );
      if (attempts <= LOGIN_COOLDOWN_AFTER_ATTEMPTS) return planted(pending);

      // Stepped from failures rather than the attempt count above: a submission
      // this gate refuses never reached a password, so it must not push the next
      // wait up the ladder. Counting attempts let anyone pressing the button
      // during a cooldown skip themselves straight to the cap.
      const failures = await redis.getCount(emailFailureKey(address));
      const cooldownKey = emailCooldownKey(address);
      const wait = progressiveCooldown(
        Math.max(1, failures - LOGIN_COOLDOWN_AFTER_ATTEMPTS + 1),
        LOGIN_COOLDOWN_SECONDS,
        LOGIN_COOLDOWN_MAX_SECONDS,
      );
      // SET NX is the gate: exactly one caller per cooldown wins.
      if (await redis.setIfAbsent(cooldownKey, wait)) {
        return planted(Math.max(pending, wait));
      }

      return refuse(await redis.getTtl(cooldownKey), wait);
    },
    (error) => failOpen(error, { action: 'checkLoginRateLimit' }),
  );
}

/** Counts a failure against the email and the IP, locking either at its threshold. */
export async function recordLoginFailure(
  email: string,
): Promise<LoginFailureOutcome> {
  const unchanged: LoginFailureOutcome = {
    emailLocked: false,
    ipLocked: false,
    failures: 0,
    attemptsRemaining: null,
    lockedForSeconds: null,
  };
  if (isDisabled()) return unchanged;

  const address = normalize(email);

  return withDeadline(
    async () => {
      const redis = await getRedisService();
      const { ipAddress, userAgent } = await getServerDeviceContext();
      const outcome: LoginFailureOutcome = { ...unchanged };

      outcome.failures = await redis.incrementWithExpiry(
        emailFailureKey(address),
        LOGIN_FAILURE_WINDOW_SECONDS,
      );
      outcome.attemptsRemaining = Math.max(
        0,
        LOGIN_LOCKOUT_AFTER_FAILURES - outcome.failures,
      );
      if (outcome.failures >= LOGIN_LOCKOUT_AFTER_FAILURES) {
        const lockSeconds = await nextLockoutSeconds(redis, address);
        await redis.setWithTtl(emailLockKey(address), lockSeconds);
        outcome.emailLocked = true;
        outcome.lockedForSeconds = lockSeconds;
      }

      const id = ipAddress
        ? deviceId(normalizeIp(ipAddress), userAgent)
        : undefined;
      if (!id) return outcome;

      if (await recordDeviceFailure(redis, id)) {
        outcome.ipLocked = true;
        // Both tiers can lock on one failure; report the longer wait.
        outcome.lockedForSeconds = Math.max(
          outcome.lockedForSeconds ?? 0,
          LOGIN_IP_LOCKOUT_SECONDS,
        );
      }

      return outcome;
    },
    (error) => {
      alertOnce(
        error,
        { action: 'recordLoginFailure' },
        'Login failure not counted; rate limiting degraded',
      );
      return unchanged;
    },
  );
}

/**
 * Clears the email counters on success. The IP and repeat-lock counters are
 * left alone: one sign-in from a shared address must not reset spray
 * protection for everyone behind it, and escalation should survive a reset.
 */
export async function clearLoginFailures(email: string): Promise<void> {
  if (isDisabled()) return;

  const address = normalize(email);

  await withDeadline(
    async () => {
      const redis = await getRedisService();
      await redis.deleteKeys([
        emailAttemptKey(address),
        emailFailureKey(address),
        emailCooldownKey(address),
        emailLockKey(address),
      ]);
    },
    (error) => {
      alertOnce(
        error,
        { action: 'clearLoginFailures' },
        'Login counters not cleared; a signed-in user may stay throttled',
      );
    },
  );
}

/**
 * One budget per user, shared by every verification method — so spending it on
 * one method denies the others. Keyed on the user, not the email or IP, because
 * this step runs on an already authenticated (aal1) session.
 */
export async function checkMfaRateLimit(
  userId: string,
): Promise<LoginRateLimitDecision> {
  if (isDisabled()) return ALLOWED;

  return withDeadline(
    async () => {
      const redis = await getRedisService();

      const lockTtl = await redis.getTtl(mfaLockKey(userId));
      if (lockTtl !== NO_KEY) {
        return refuse(lockTtl, CODE_VERIFY_LOCKOUT_SECONDS);
      }

      const attempts = await redis.incrementWithExpiry(
        mfaAttemptKey(userId),
        CODE_VERIFY_WINDOW_SECONDS,
      );
      if (attempts <= CODE_VERIFY_COOLDOWN_AFTER_ATTEMPTS) return ALLOWED;

      const cooldownKey = mfaCooldownKey(userId);
      const wait = progressiveCooldown(
        attempts - CODE_VERIFY_COOLDOWN_AFTER_ATTEMPTS,
        CODE_VERIFY_COOLDOWN_SECONDS,
        CODE_VERIFY_COOLDOWN_MAX_SECONDS,
      );
      if (await redis.setIfAbsent(cooldownKey, wait)) return ALLOWED;

      return refuse(await redis.getTtl(cooldownKey), wait);
    },
    (error) => failOpen(error, { action: 'checkMfaRateLimit', userId }),
  );
}

export async function recordMfaFailure(userId: string): Promise<void> {
  if (isDisabled()) return;

  await withDeadline(
    async () => {
      const redis = await getRedisService();
      const failures = await redis.incrementWithExpiry(
        mfaFailureKey(userId),
        CODE_VERIFY_WINDOW_SECONDS,
      );
      if (failures >= CODE_VERIFY_LOCKOUT_AFTER_FAILURES) {
        await redis.setWithTtl(mfaLockKey(userId), CODE_VERIFY_LOCKOUT_SECONDS);
      }
    },
    (error) => {
      alertOnce(
        error,
        { action: 'recordMfaFailure', userId },
        'MFA failure not counted; rate limiting degraded',
      );
    },
  );
}

export async function clearMfaFailures(userId: string): Promise<void> {
  if (isDisabled()) return;

  await withDeadline(
    async () => {
      const redis = await getRedisService();
      await redis.deleteKeys([
        mfaAttemptKey(userId),
        mfaFailureKey(userId),
        mfaCooldownKey(userId),
        mfaLockKey(userId),
      ]);
    },
    (error) => {
      alertOnce(
        error,
        { action: 'clearMfaFailures', userId },
        'MFA counters not cleared; a verified user may stay throttled',
      );
    },
  );
}

/**
 * The password-reset recovery code is a short numeric secret checked with no
 * session, and accepting one clears the login lockout — so without its own limit
 * it is both a brute-force target and the way around the tier above it. Gets the
 * shared code policy keyed on the address, plus the spray tier, so a client that
 * has exhausted its login budget cannot simply pivot to guessing codes.
 */
export async function checkPasswordResetRateLimit(
  email: string,
): Promise<LoginRateLimitDecision> {
  if (isDisabled()) return ALLOWED;

  const address = normalize(email);

  return withDeadline(
    async () => {
      const redis = await getRedisService();
      const { ipAddress, userAgent } = await getServerDeviceContext();

      const lockTtl = await redis.getTtl(resetLockKey(address));
      if (lockTtl !== NO_KEY) {
        return refuse(lockTtl, CODE_VERIFY_LOCKOUT_SECONDS);
      }

      const id = ipAddress
        ? deviceId(normalizeIp(ipAddress), userAgent)
        : undefined;
      if (id) {
        const device = await checkDeviceTier(redis, id);
        if (!device.allowed) return device;
      }

      const attempts = await redis.incrementWithExpiry(
        resetAttemptKey(address),
        CODE_VERIFY_WINDOW_SECONDS,
      );
      if (attempts <= CODE_VERIFY_COOLDOWN_AFTER_ATTEMPTS) return ALLOWED;

      const cooldownKey = resetCooldownKey(address);
      const wait = progressiveCooldown(
        attempts - CODE_VERIFY_COOLDOWN_AFTER_ATTEMPTS,
        CODE_VERIFY_COOLDOWN_SECONDS,
        CODE_VERIFY_COOLDOWN_MAX_SECONDS,
      );
      if (await redis.setIfAbsent(cooldownKey, wait)) return ALLOWED;

      return refuse(await redis.getTtl(cooldownKey), wait);
    },
    (error) => failOpen(error, { action: 'checkPasswordResetRateLimit' }),
  );
}

/** Counts a rejected recovery code against the address and the client. */
export async function recordPasswordResetFailure(email: string): Promise<void> {
  if (isDisabled()) return;

  const address = normalize(email);

  await withDeadline(
    async () => {
      const redis = await getRedisService();
      const { ipAddress, userAgent } = await getServerDeviceContext();

      const failures = await redis.incrementWithExpiry(
        resetFailureKey(address),
        CODE_VERIFY_WINDOW_SECONDS,
      );
      if (failures >= CODE_VERIFY_LOCKOUT_AFTER_FAILURES) {
        await redis.setWithTtl(
          resetLockKey(address),
          CODE_VERIFY_LOCKOUT_SECONDS,
        );
      }

      const id = ipAddress
        ? deviceId(normalizeIp(ipAddress), userAgent)
        : undefined;
      if (id) await recordDeviceFailure(redis, id);
    },
    (error) => {
      alertOnce(
        error,
        { action: 'recordPasswordResetFailure' },
        'Password reset failure not counted; rate limiting degraded',
      );
    },
  );
}

/** Clears the recovery counters once a code is accepted. */
export async function clearPasswordResetFailures(email: string): Promise<void> {
  if (isDisabled()) return;

  const address = normalize(email);

  await withDeadline(
    async () => {
      const redis = await getRedisService();
      await redis.deleteKeys([
        resetAttemptKey(address),
        resetFailureKey(address),
        resetCooldownKey(address),
        resetLockKey(address),
      ]);
    },
    (error) => {
      alertOnce(
        error,
        { action: 'clearPasswordResetFailures' },
        'Reset counters not cleared; a verified user may stay throttled',
      );
    },
  );
}
