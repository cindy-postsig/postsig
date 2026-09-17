jest.mock('@/app/lib/redis/service', () => ({ getRedisService: jest.fn() }));
jest.mock('@/app/lib/auth/trusted-device-utils', () => ({
  getServerDeviceContext: jest.fn(),
}));
jest.mock('@/utils/logging/alert', () => ({ logAlert: jest.fn() }));

import {
  checkLoginRateLimit,
  checkMfaRateLimit,
  checkPasswordResetRateLimit,
  clearLoginFailures,
  clearMfaFailures,
  clearPasswordResetFailures,
  recordLoginFailure,
  recordMfaFailure,
  recordPasswordResetFailure,
} from '@/app/lib/auth/login-rate-limit';
import { getRedisService } from '@/app/lib/redis/service';
import { getServerDeviceContext } from '@/app/lib/auth/trusted-device-utils';
import { logAlert } from '@/utils/logging/alert';
import { getHash } from '@/app/lib/utils';
import {
  CODE_VERIFY_LOCKOUT_AFTER_FAILURES,
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
  CODE_VERIFY_COOLDOWN_SECONDS,
  CODE_VERIFY_LOCKOUT_SECONDS,
  CODE_VERIFY_WINDOW_SECONDS,
} from '@/constants/security';

const mockGetRedisService = getRedisService as jest.Mock;
const mockGetServerDeviceContext = getServerDeviceContext as jest.Mock;
const mockLogAlert = logAlert as jest.Mock;

const EMAIL = 'User@Example.com';
const ADDRESS = 'user@example.com';
const IP = '203.0.113.10';
const USER_AGENT = 'test-agent/1.0';
const USER_ID = 'user-1';

const attemptKey = `auth:attempt:email:${getHash(ADDRESS)}`;
const failKey = `auth:fail:email:${getHash(ADDRESS)}`;
const cooldownKey = `auth:cooldown:email:${getHash(ADDRESS)}`;
const lockKey = `auth:lock:email:${getHash(ADDRESS)}`;
const lockCountKey = `auth:locks:email:${getHash(ADDRESS)}`;
const DEVICE_ID = `${IP}:${getHash(USER_AGENT)}`;
const ipFailKey = `auth:fail:ip:${DEVICE_ID}`;
const ipLockKey = `auth:lock:ip:${DEVICE_ID}`;
const ipCooldownKey = `auth:cooldown:ip:${DEVICE_ID}`;

const mfaAttemptKey = `auth:mfa:attempt:${USER_ID}`;
const mfaFailKey = `auth:mfa:fail:${USER_ID}`;
const mfaCooldownKey = `auth:mfa:cooldown:${USER_ID}`;
const mfaLockKey = `auth:mfa:lock:${USER_ID}`;

const resetAttemptKey = `auth:reset:attempt:${getHash(ADDRESS)}`;
const resetFailKey = `auth:reset:fail:${getHash(ADDRESS)}`;
const resetCooldownKey = `auth:reset:cooldown:${getHash(ADDRESS)}`;
const resetLockKey = `auth:reset:lock:${getHash(ADDRESS)}`;

const NO_KEY = -2;

type RedisStub = {
  deleteKeys: jest.Mock;
  getTtl: jest.Mock;
  getCount: jest.Mock;
  incrementWithExpiry: jest.Mock;
  setIfAbsent: jest.Mock;
  setWithTtl: jest.Mock;
};

/**
 * Redis stub: `ttls` seeds lifetimes (absent reads as -2, Redis' missing-key
 * sentinel), `counts`/`increments` seed counter values (peeked or incremented,
 * respectively — `increments` also backs `getCount` so a test only has to seed
 * one map when a key is read both ways), `held` names keys SET NX must refuse.
 */
function redisStub({
  ttls = {} as Record<string, number>,
  increments = {} as Record<string, number>,
  counts = {} as Record<string, number>,
  held = [] as string[],
} = {}): RedisStub {
  return {
    deleteKeys: jest.fn(async () => undefined),
    getTtl: jest.fn(async (key: string) => ttls[key] ?? NO_KEY),
    getCount: jest.fn(
      async (key: string) => counts[key] ?? increments[key] ?? 0,
    ),
    incrementWithExpiry: jest.fn(async (key: string) => increments[key] ?? 1),
    setIfAbsent: jest.fn(async (key: string) => !held.includes(key)),
    setWithTtl: jest.fn(async () => undefined),
  };
}

function useRedis(stub: RedisStub) {
  mockGetRedisService.mockResolvedValue(stub);
  return stub;
}

// The alert is throttled to one per minute per process, so without a clock that
// moves between tests the first alert assertion would silence every later one.
let clock = Date.now();

describe('login rate limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENV = 'staging';
    process.env.ELASTICACHE_REDIS_URL = 'redis://test';
    clock += 10 * 60_000;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    mockGetServerDeviceContext.mockResolvedValue({
      ipAddress: IP,
      userAgent: USER_AGENT,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // In the afterEach rather than the test body: a failing assertion would
    // otherwise leak fake timers into every test that follows it.
    jest.useRealTimers();
  });

  describe('checkLoginRateLimit', () => {
    it('allows an attempt with no recorded history', async () => {
      useRedis(redisStub());

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: true,
      });
    });

    it('refuses a locked email and reports the time left on the lock', async () => {
      useRedis(redisStub({ ttls: { [lockKey]: 900 } }));

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 900,
      });
    });

    it('refuses a locked source IP even when the email itself is clean', async () => {
      useRedis(redisStub({ ttls: { [ipLockKey]: 1200 } }));

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 1200,
      });
    });

    // A lock with no TTL must not tell the caller to retry immediately.
    it('falls back to the full email lockout period when the lock has no TTL', async () => {
      useRedis(redisStub({ ttls: { [lockKey]: -1 } }));

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: LOGIN_LOCKOUT_SECONDS,
      });
    });

    // The IP tier is shared by everyone behind an egress address and must keep
    // its own duration rather than inheriting the per-email one.
    it('falls back to the IP lockout period, not the email one, for an IP lock with no TTL', async () => {
      useRedis(redisStub({ ttls: { [ipLockKey]: -1 } }));

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: LOGIN_IP_LOCKOUT_SECONDS,
      });
      expect(LOGIN_IP_LOCKOUT_SECONDS).not.toEqual(LOGIN_LOCKOUT_SECONDS);
    });

    it('normalizes case and surrounding whitespace before keying', async () => {
      const redis = useRedis(redisStub({ ttls: { [lockKey]: 60 } }));

      await checkLoginRateLimit('  USER@example.COM  ');

      expect(redis.getTtl).toHaveBeenCalledWith(lockKey);
    });

    it('does not claim a cooldown while attempts are inside the free allowance', async () => {
      const redis = useRedis(redisStub({ increments: { [attemptKey]: 3 } }));

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: true,
      });
      expect(redis.setIfAbsent).not.toHaveBeenCalled();
    });

    it('counts the attempt at the gate so a concurrent burst cannot share one low count', async () => {
      const redis = useRedis(redisStub());

      await checkLoginRateLimit(EMAIL);

      expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
        attemptKey,
        LOGIN_FAILURE_WINDOW_SECONDS,
      );
    });

    // 10s, 20s, 30s, then capped — stepped by failures recorded, so the ladder
    // advances once per password actually tested.
    it.each([
      [3, LOGIN_COOLDOWN_SECONDS],
      [4, LOGIN_COOLDOWN_SECONDS * 2],
      [5, LOGIN_COOLDOWN_SECONDS * 3],
      [8, LOGIN_COOLDOWN_MAX_SECONDS],
    ])(
      'claims a progressively longer cooldown at failure %i',
      async (failures, expected) => {
        const redis = useRedis(
          redisStub({
            increments: { [attemptKey]: failures + 1 },
            counts: { [failKey]: failures },
          }),
        );

        // Allowed, but reporting the wait it just placed on the next attempt.
        await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
          allowed: true,
          nextAttemptInSeconds: expected,
        });
        expect(redis.setIfAbsent).toHaveBeenCalledWith(cooldownKey, expected);
      },
    );

    // Regression: the ladder used to step on the attempt counter, so pressing
    // the button through a cooldown — which never reaches a password — pushed
    // the next wait up and skipped rungs (10s, then 30s, never 20s).
    it('does not let refused submissions push the wait up the ladder', async () => {
      const redis = useRedis(
        redisStub({
          increments: { [attemptKey]: 20 },
          counts: { [failKey]: 3 },
        }),
      );

      await checkLoginRateLimit(EMAIL);

      expect(redis.setIfAbsent).toHaveBeenCalledWith(
        cooldownKey,
        LOGIN_COOLDOWN_SECONDS,
      );
    });

    it('never lets the progressive cooldown exceed the cap', async () => {
      const redis = useRedis(
        redisStub({
          increments: { [attemptKey]: 40 },
          counts: { [failKey]: 40 },
        }),
      );

      await checkLoginRateLimit(EMAIL);

      expect(redis.setIfAbsent).toHaveBeenCalledWith(
        cooldownKey,
        LOGIN_COOLDOWN_MAX_SECONDS,
      );
    });

    it('refuses when the cooldown is already held by another attempt', async () => {
      useRedis(
        redisStub({
          increments: { [attemptKey]: 5 },
          held: [cooldownKey],
          ttls: { [cooldownKey]: 7 },
        }),
      );

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 7,
      });
    });

    // The whole point of SET NX here: a read-then-write gate would let every
    // member of a concurrent burst through.
    it('admits exactly one of several concurrent attempts past the allowance', async () => {
      const stub = redisStub({ increments: { [attemptKey]: 5 } });
      let taken = false;
      stub.setIfAbsent = jest.fn(async () => {
        if (taken) return false;
        taken = true;
        return true;
      });
      stub.getTtl = jest.fn(async (key: string) =>
        key === cooldownKey ? 5 : NO_KEY,
      );
      useRedis(stub);

      const decisions = await Promise.all(
        Array.from({ length: 8 }, () => checkLoginRateLimit(EMAIL)),
      );

      expect(decisions.filter((d) => d.allowed)).toHaveLength(1);
    });

    // Regression guard for the cold-start connect race: the two lock reads must
    // stay sequential, so an answered email lock never issues the IP read.
    it('does not consult the IP lock once the email lock has answered', async () => {
      const redis = useRedis(redisStub({ ttls: { [lockKey]: 300 } }));

      await checkLoginRateLimit(EMAIL);

      expect(redis.getTtl).toHaveBeenCalledTimes(1);
      expect(redis.getTtl).toHaveBeenCalledWith(lockKey);
    });

    it('counts every address in one IPv6 /64 against a single budget', async () => {
      const redis = useRedis(redisStub());
      mockGetServerDeviceContext.mockResolvedValue({
        ipAddress: '2001:0db8:0000:0000:aaaa:bbbb:cccc:dddd',
        userAgent: USER_AGENT,
      });

      await checkLoginRateLimit(EMAIL);

      expect(redis.getTtl).toHaveBeenCalledWith(
        `auth:lock:ip:2001:db8:0:0:${getHash(USER_AGENT)}`,
      );
    });

    it('keys an IPv4-mapped IPv6 address on the IPv4 address, not the shared prefix', async () => {
      const redis = useRedis(redisStub());
      mockGetServerDeviceContext.mockResolvedValue({
        ipAddress: '::ffff:203.0.113.10',
        userAgent: USER_AGENT,
      });

      await checkLoginRateLimit(EMAIL);

      expect(redis.getTtl).toHaveBeenCalledWith(ipLockKey);
    });

    it('strips a zone index and brackets before keying', async () => {
      const redis = useRedis(redisStub());
      mockGetServerDeviceContext.mockResolvedValue({
        ipAddress: '[2001:db8::1]%eth0',
        userAgent: USER_AGENT,
      });

      await checkLoginRateLimit(EMAIL);

      expect(redis.getTtl).toHaveBeenCalledWith(
        `auth:lock:ip:2001:db8:0:0:${getHash(USER_AGENT)}`,
      );
    });

    // A script and a real browser sharing one office IP must not share a budget.
    it('keys two user agents behind the same IP as separate clients', async () => {
      const redis = useRedis(redisStub());
      mockGetServerDeviceContext.mockResolvedValue({
        ipAddress: IP,
        userAgent: 'a-different-agent/2.0',
      });

      await checkLoginRateLimit(EMAIL);

      expect(redis.getTtl).not.toHaveBeenCalledWith(ipLockKey);
      expect(redis.getTtl).toHaveBeenCalledWith(
        `auth:lock:ip:${IP}:${getHash('a-different-agent/2.0')}`,
      );
    });

    // A spray tool without a UA header still gets a (coarser) bucket rather
    // than crashing the check.
    it('still keys a client with no user agent at all', async () => {
      const redis = useRedis(redisStub());
      mockGetServerDeviceContext.mockResolvedValue({
        ipAddress: IP,
        userAgent: undefined,
      });

      await checkLoginRateLimit(EMAIL);

      expect(redis.getTtl).toHaveBeenCalledWith(
        `auth:lock:ip:${IP}:${getHash('')}`,
      );
    });
  });

  describe('IP+device cooldown', () => {
    // 10s, 20s, 30s, then capped — the same ladder as the email tier. These are
    // failures already recorded rather than attempts made, so the allowance is
    // spent exactly at the threshold, not one attempt past it.
    it.each([
      [LOGIN_IP_COOLDOWN_AFTER_FAILURES, LOGIN_IP_COOLDOWN_SECONDS],
      [LOGIN_IP_COOLDOWN_AFTER_FAILURES + 1, LOGIN_IP_COOLDOWN_SECONDS * 2],
      [LOGIN_IP_COOLDOWN_AFTER_FAILURES + 2, LOGIN_IP_COOLDOWN_SECONDS * 3],
      [LOGIN_IP_COOLDOWN_AFTER_FAILURES + 5, LOGIN_IP_COOLDOWN_MAX_SECONDS],
    ])(
      'claims a progressively longer cooldown once IP failures reach %i',
      async (ipFailures, expected) => {
        const redis = useRedis(
          redisStub({ counts: { [ipFailKey]: ipFailures } }),
        );

        await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
          allowed: true,
          nextAttemptInSeconds: expected,
        });
        expect(redis.setIfAbsent).toHaveBeenCalledWith(ipCooldownKey, expected);
      },
    );

    it('does not claim a cooldown while IP failures are inside the free allowance', async () => {
      const redis = useRedis(
        redisStub({
          counts: { [ipFailKey]: LOGIN_IP_COOLDOWN_AFTER_FAILURES - 1 },
        }),
      );

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: true,
      });
      expect(redis.setIfAbsent).not.toHaveBeenCalledWith(
        ipCooldownKey,
        expect.anything(),
      );
    });

    it('refuses when the IP cooldown is already held by another attempt', async () => {
      useRedis(
        redisStub({
          counts: { [ipFailKey]: LOGIN_IP_COOLDOWN_AFTER_FAILURES },
          held: [ipCooldownKey],
          ttls: { [ipCooldownKey]: 7 },
        }),
      );

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 7,
      });
    });

    // Peeked with getCount, never incremented here — only an actual credential
    // failure should spend this budget, or ordinary concurrent office traffic
    // would throttle itself with zero failures involved.
    it('peeks the IP failure count rather than incrementing it', async () => {
      const redis = useRedis(redisStub());

      await checkLoginRateLimit(EMAIL);

      expect(redis.getCount).toHaveBeenCalledWith(ipFailKey);
      expect(redis.incrementWithExpiry).not.toHaveBeenCalledWith(
        ipFailKey,
        expect.anything(),
      );
    });

    // The gate reads the device's failure count, not anything scoped to the
    // submitted address, so it refuses the same way no matter which email is
    // in the request — one client spraying many accounts locks out as one.
    it('applies the same device lock regardless of which email is submitted', async () => {
      useRedis(redisStub({ ttls: { [ipLockKey]: 1200 } }));

      const first = await checkLoginRateLimit('first@example.com');
      const second = await checkLoginRateLimit('second@example.com');

      expect(first).toEqual({ allowed: false, retryAfterSeconds: 1200 });
      expect(second).toEqual({ allowed: false, retryAfterSeconds: 1200 });
    });
  });

  describe('when the counter store is unavailable', () => {
    it('allows the attempt and raises an alert when the connection cannot be made', async () => {
      mockGetRedisService.mockRejectedValue(new Error('no redis'));

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: true,
      });
      expect(mockLogAlert).toHaveBeenCalledWith(
        'login-rate-limit-backend-failure',
        expect.any(Error),
        expect.objectContaining({ action: 'checkLoginRateLimit' }),
        expect.any(String),
      );
    });

    // The likely outage: connected but a command fails. Used to be swallowed
    // into "not locked, no failures", switching the control off silently.
    it('allows the attempt and raises an alert when a command fails', async () => {
      const stub = redisStub();
      stub.getTtl = jest.fn(async () => {
        throw new Error('command timeout');
      });
      useRedis(stub);

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: true,
      });
      expect(mockLogAlert).toHaveBeenCalledWith(
        'login-rate-limit-backend-failure',
        expect.any(Error),
        expect.objectContaining({ action: 'checkLoginRateLimit' }),
        expect.any(String),
      );
    });

    it('records nothing but still alerts when the counter cannot be incremented', async () => {
      const stub = redisStub();
      stub.incrementWithExpiry = jest.fn(async () => {
        throw new Error('command timeout');
      });
      useRedis(stub);

      await expect(recordLoginFailure(EMAIL)).resolves.toEqual({
        emailLocked: false,
        ipLocked: false,
        failures: 0,
        attemptsRemaining: null,
        lockedForSeconds: null,
      });
      expect(mockLogAlert).toHaveBeenCalledWith(
        'login-rate-limit-backend-failure',
        expect.any(Error),
        expect.objectContaining({ action: 'recordLoginFailure' }),
        expect.any(String),
      );
    });

    // A hung store answers neither quickly nor with an error, so the gate has
    // to give up rather than add its own multi-second delay to every login.
    it('gives up on a hung store once the deadline passes', async () => {
      jest.useFakeTimers({ doNotFake: ['Date'] });
      const stub = redisStub();
      stub.getTtl = jest.fn(() => new Promise<number>(() => {}));
      useRedis(stub);

      const pending = checkLoginRateLimit(EMAIL);
      await jest.advanceTimersByTimeAsync(LOGIN_RATE_LIMIT_TIMEOUT_MS);

      await expect(pending).resolves.toEqual({ allowed: true });
      expect(mockLogAlert).toHaveBeenCalled();
    });

    it('throttles repeated alerts so an outage cannot flood the monitor', async () => {
      mockGetRedisService.mockRejectedValue(new Error('no redis'));

      await checkLoginRateLimit(EMAIL);
      await checkLoginRateLimit(EMAIL);
      await checkLoginRateLimit(EMAIL);

      expect(mockLogAlert).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordLoginFailure', () => {
    it('counts the failure against both the email and the source IP', async () => {
      const redis = useRedis(redisStub());

      await recordLoginFailure(EMAIL);

      expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
        failKey,
        LOGIN_FAILURE_WINDOW_SECONDS,
      );
      expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
        ipFailKey,
        LOGIN_FAILURE_WINDOW_SECONDS,
      );
    });

    // The device budget is shared across every email tried from it — a spray
    // across many accounts and repeated guesses against one account both spend
    // the same counter, the same way MFA shares one budget across methods.
    it('shares one device counter across different emails, not one per email', async () => {
      const redis = useRedis(redisStub());

      await recordLoginFailure('first@example.com');
      await recordLoginFailure('second@example.com');

      expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
        ipFailKey,
        LOGIN_FAILURE_WINDOW_SECONDS,
      );
      expect(
        redis.incrementWithExpiry.mock.calls.filter(
          ([key]) => key === ipFailKey,
        ),
      ).toHaveLength(2);
    });

    it('reports no lock while both counters are below their thresholds', async () => {
      useRedis(
        redisStub({
          increments: {
            [failKey]: 9,
            [ipFailKey]: LOGIN_IP_LOCKOUT_AFTER_FAILURES - 1,
          },
        }),
      );

      await expect(recordLoginFailure(EMAIL)).resolves.toEqual({
        emailLocked: false,
        ipLocked: false,
        failures: 9,
        attemptsRemaining: 1,
        lockedForSeconds: null,
      });
    });

    it('locks the email and reports the transition at the threshold', async () => {
      const redis = useRedis(
        redisStub({ increments: { [failKey]: 10, [lockCountKey]: 1 } }),
      );

      await expect(recordLoginFailure(EMAIL)).resolves.toMatchObject({
        emailLocked: true,
        failures: 10,
        attemptsRemaining: 0,
        lockedForSeconds: LOGIN_LOCKOUT_REPEAT_SECONDS[0],
      });
      expect(redis.setWithTtl).toHaveBeenCalledWith(
        lockKey,
        LOGIN_LOCKOUT_REPEAT_SECONDS[0],
      );
    });

    it.each([
      [1, LOGIN_LOCKOUT_REPEAT_SECONDS[0]],
      [2, LOGIN_LOCKOUT_REPEAT_SECONDS[1]],
      [3, LOGIN_LOCKOUT_REPEAT_SECONDS[2]],
      [9, LOGIN_LOCKOUT_REPEAT_SECONDS[2]],
    ])(
      'escalates the lock duration on repeat lock number %i',
      async (locks, expected) => {
        const redis = useRedis(
          redisStub({ increments: { [failKey]: 10, [lockCountKey]: locks } }),
        );

        await recordLoginFailure(EMAIL);

        expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
          lockCountKey,
          LOGIN_LOCKOUT_ESCALATION_WINDOW_SECONDS,
        );
        expect(redis.setWithTtl).toHaveBeenCalledWith(lockKey, expected);
      },
    );

    it('locks the source IP at the spray threshold using the IP duration', async () => {
      const redis = useRedis(
        redisStub({
          increments: { [ipFailKey]: LOGIN_IP_LOCKOUT_AFTER_FAILURES },
        }),
      );

      await expect(recordLoginFailure(EMAIL)).resolves.toMatchObject({
        ipLocked: true,
        lockedForSeconds: LOGIN_IP_LOCKOUT_SECONDS,
      });
      expect(redis.setWithTtl).toHaveBeenCalledWith(
        ipLockKey,
        LOGIN_IP_LOCKOUT_SECONDS,
      );
    });

    // The form counts down from this figure, so it has to be the distance to
    // the lock rather than the raw failure count.
    it.each([
      [1, LOGIN_LOCKOUT_AFTER_FAILURES - 1],
      [6, LOGIN_LOCKOUT_AFTER_FAILURES - 6],
      [9, 1],
    ])(
      'reports the attempts left after failure %i',
      async (failures, remaining) => {
        useRedis(redisStub({ increments: { [failKey]: failures } }));

        await expect(recordLoginFailure(EMAIL)).resolves.toMatchObject({
          attemptsRemaining: remaining,
        });
      },
    );

    // A failure counted past the threshold — the lock was cleared under it, or
    // two crossed it together — must not report a negative countdown.
    it('floors the attempts left at zero past the threshold', async () => {
      useRedis(
        redisStub({
          increments: {
            [failKey]: LOGIN_LOCKOUT_AFTER_FAILURES + 3,
            [lockCountKey]: 1,
          },
        }),
      );

      await expect(recordLoginFailure(EMAIL)).resolves.toMatchObject({
        attemptsRemaining: 0,
      });
    });

    // The gate refuses until the later of the two expires, so reporting the
    // email lock would send the user back before it would let them in.
    it('reports the longer wait when the email and the IP lock together', async () => {
      useRedis(
        redisStub({
          increments: {
            [failKey]: LOGIN_LOCKOUT_AFTER_FAILURES,
            [lockCountKey]: 1,
            [ipFailKey]: LOGIN_IP_LOCKOUT_AFTER_FAILURES,
          },
        }),
      );

      await expect(recordLoginFailure(EMAIL)).resolves.toMatchObject({
        emailLocked: true,
        ipLocked: true,
        lockedForSeconds: Math.max(
          LOGIN_LOCKOUT_REPEAT_SECONDS[0],
          LOGIN_IP_LOCKOUT_SECONDS,
        ),
      });
    });

    it('still counts the email when no source IP is available', async () => {
      mockGetServerDeviceContext.mockResolvedValue({ ipAddress: undefined });
      const redis = useRedis(redisStub());

      await recordLoginFailure(EMAIL);

      expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
        failKey,
        LOGIN_FAILURE_WINDOW_SECONDS,
      );
      expect(redis.incrementWithExpiry).not.toHaveBeenCalledWith(
        ipFailKey,
        expect.anything(),
      );
    });
  });

  describe('clearLoginFailures', () => {
    it('clears the email counters and leaves the IP and escalation counters alone', async () => {
      const redis = useRedis(redisStub());

      await clearLoginFailures(EMAIL);

      expect(redis.deleteKeys).toHaveBeenCalledWith([
        attemptKey,
        failKey,
        cooldownKey,
        lockKey,
      ]);
      expect(redis.deleteKeys).not.toHaveBeenCalledWith(
        expect.arrayContaining([ipFailKey]),
      );
      expect(redis.deleteKeys).not.toHaveBeenCalledWith(
        expect.arrayContaining([ipLockKey]),
      );
      expect(redis.deleteKeys).not.toHaveBeenCalledWith(
        expect.arrayContaining([ipCooldownKey]),
      );
      expect(redis.deleteKeys).not.toHaveBeenCalledWith(
        expect.arrayContaining([lockCountKey]),
      );
    });
  });

  // The cleanup used to run through RedisService.del, which swallows its own
  // errors, so this alert could never fire and a signed-in user could stay
  // throttled with nothing to say so.
  it('alerts when the counters cannot be cleared', async () => {
    const stub = redisStub();
    stub.deleteKeys = jest.fn(async () => {
      throw new Error('command timeout');
    });
    useRedis(stub);

    await clearLoginFailures(EMAIL);

    expect(mockLogAlert).toHaveBeenCalledWith(
      'login-rate-limit-backend-failure',
      expect.any(Error),
      expect.objectContaining({ action: 'clearLoginFailures' }),
      expect.any(String),
    );
  });

  describe('MFA verification', () => {
    it('allows a verification with no recorded history', async () => {
      useRedis(redisStub());

      await expect(checkMfaRateLimit(USER_ID)).resolves.toEqual({
        allowed: true,
      });
    });

    it('refuses a locked user and reports the time left', async () => {
      useRedis(redisStub({ ttls: { [mfaLockKey]: 600 } }));

      await expect(checkMfaRateLimit(USER_ID)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 600,
      });
    });

    it('falls back to the full MFA lockout period when the lock has no TTL', async () => {
      useRedis(redisStub({ ttls: { [mfaLockKey]: -1 } }));

      await expect(checkMfaRateLimit(USER_ID)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: CODE_VERIFY_LOCKOUT_SECONDS,
      });
    });

    it('claims a cooldown past the free allowance rather than jumping to a lock', async () => {
      const redis = useRedis(redisStub({ increments: { [mfaAttemptKey]: 4 } }));

      await expect(checkMfaRateLimit(USER_ID)).resolves.toEqual({
        allowed: true,
      });
      expect(redis.setIfAbsent).toHaveBeenCalledWith(
        mfaCooldownKey,
        CODE_VERIFY_COOLDOWN_SECONDS,
      );
    });

    it('refuses while an MFA cooldown is held', async () => {
      useRedis(
        redisStub({
          increments: { [mfaAttemptKey]: 5 },
          held: [mfaCooldownKey],
          ttls: { [mfaCooldownKey]: 12 },
        }),
      );

      await expect(checkMfaRateLimit(USER_ID)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 12,
      });
    });

    it('locks the user at the MFA failure threshold', async () => {
      const redis = useRedis(redisStub({ increments: { [mfaFailKey]: 10 } }));

      await recordMfaFailure(USER_ID);

      expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
        mfaFailKey,
        CODE_VERIFY_WINDOW_SECONDS,
      );
      expect(redis.setWithTtl).toHaveBeenCalledWith(
        mfaLockKey,
        CODE_VERIFY_LOCKOUT_SECONDS,
      );
    });

    it('does not lock below the MFA failure threshold', async () => {
      const redis = useRedis(redisStub({ increments: { [mfaFailKey]: 9 } }));

      await recordMfaFailure(USER_ID);

      expect(redis.setWithTtl).not.toHaveBeenCalled();
    });

    it('clears every MFA counter on success', async () => {
      const redis = useRedis(redisStub());

      await clearMfaFailures(USER_ID);

      expect(redis.deleteKeys).toHaveBeenCalledWith([
        mfaAttemptKey,
        mfaFailKey,
        mfaCooldownKey,
        mfaLockKey,
      ]);
    });
  });

  // The recovery code clears the login lockout when it is accepted, so leaving
  // it unmetered would make it the cheapest way past every tier above.
  describe('password reset recovery code', () => {
    it('allows a verification with no recorded history', async () => {
      useRedis(redisStub());

      await expect(checkPasswordResetRateLimit(EMAIL)).resolves.toEqual({
        allowed: true,
      });
    });

    it('refuses a locked address and reports the time left', async () => {
      useRedis(redisStub({ ttls: { [resetLockKey]: 600 } }));

      await expect(checkPasswordResetRateLimit(EMAIL)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 600,
      });
    });

    it('claims a cooldown past the free allowance rather than jumping to a lock', async () => {
      const redis = useRedis(
        redisStub({ increments: { [resetAttemptKey]: 4 } }),
      );

      await expect(checkPasswordResetRateLimit(EMAIL)).resolves.toEqual({
        allowed: true,
      });
      expect(redis.setIfAbsent).toHaveBeenCalledWith(
        resetCooldownKey,
        CODE_VERIFY_COOLDOWN_SECONDS,
      );
    });

    // The whole point: exhausting the login budget must not leave guessing
    // recovery codes as an unmetered alternative from the same client.
    it('refuses a client the spray tier has already locked', async () => {
      useRedis(redisStub({ ttls: { [ipLockKey]: 900 } }));

      await expect(checkPasswordResetRateLimit(EMAIL)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 900,
      });
    });

    it('locks the address at the code threshold', async () => {
      const redis = useRedis(
        redisStub({
          increments: {
            [resetFailKey]: CODE_VERIFY_LOCKOUT_AFTER_FAILURES,
          },
        }),
      );

      await recordPasswordResetFailure(EMAIL);

      expect(redis.setWithTtl).toHaveBeenCalledWith(
        resetLockKey,
        CODE_VERIFY_LOCKOUT_SECONDS,
      );
    });

    // A code sprayed across many addresses spends the same client budget the
    // password tier uses, so it cannot outrun both by alternating between them.
    it('counts a bad code against the device tier too', async () => {
      const redis = useRedis(redisStub());

      await recordPasswordResetFailure(EMAIL);

      expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
        resetFailKey,
        CODE_VERIFY_WINDOW_SECONDS,
      );
      expect(redis.incrementWithExpiry).toHaveBeenCalledWith(
        ipFailKey,
        LOGIN_FAILURE_WINDOW_SECONDS,
      );
    });

    it('clears every recovery counter once a code is accepted', async () => {
      const redis = useRedis(redisStub());

      await clearPasswordResetFailures(EMAIL);

      expect(redis.deleteKeys).toHaveBeenCalledWith([
        resetAttemptKey,
        resetFailKey,
        resetCooldownKey,
        resetLockKey,
      ]);
    });

    it('allows the attempt and alerts when the store is unavailable', async () => {
      mockGetRedisService.mockRejectedValue(new Error('no redis'));

      await expect(checkPasswordResetRateLimit(EMAIL)).resolves.toEqual({
        allowed: true,
      });
      expect(mockLogAlert).toHaveBeenCalledWith(
        'login-rate-limit-backend-failure',
        expect.any(Error),
        expect.objectContaining({ action: 'checkPasswordResetRateLimit' }),
        expect.any(String),
      );
    });
  });

  describe('the local development switch', () => {
    it('skips the store entirely when running locally with none configured', async () => {
      process.env.ENV = 'local';
      delete process.env.ELASTICACHE_REDIS_URL;

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: true,
      });
      await expect(recordLoginFailure(EMAIL)).resolves.toEqual({
        emailLocked: false,
        ipLocked: false,
        failures: 0,
        attemptsRemaining: null,
        lockedForSeconds: null,
      });
      expect(mockGetRedisService).not.toHaveBeenCalled();
    });

    it('enforces the limit locally once a store is configured', async () => {
      process.env.ENV = 'local';
      process.env.ELASTICACHE_REDIS_URL = 'redis://localhost:6379';
      useRedis(redisStub({ ttls: { [lockKey]: 120 } }));

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 120,
      });
    });

    // A mis-set ENV in a deployed environment must not remove the control.
    it('stays enabled in a production build even if ENV says local', async () => {
      // NODE_ENV is typed read-only, so reach it through the record type.
      const env = process.env as Record<string, string | undefined>;
      const previous = env.NODE_ENV;
      env.NODE_ENV = 'production';
      process.env.ENV = 'local';
      delete process.env.ELASTICACHE_REDIS_URL;
      useRedis(redisStub({ ttls: { [lockKey]: 120 } }));

      await expect(checkLoginRateLimit(EMAIL)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 120,
      });

      env.NODE_ENV = previous;
    });
  });
});
