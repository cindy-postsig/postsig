import {
  attemptsRemainingMessage,
  countdownMessage,
  formatCountdown,
  rateLimitMessage,
} from '@/app/lib/auth/rate-limit-message';
import {
  LOGIN_ATTEMPTS_WARNING_AT,
  LOGIN_LOCKOUT_SECONDS,
} from '@/constants/security';

describe('rateLimitMessage', () => {
  it('reports a single second in the singular', () => {
    expect(rateLimitMessage(1)).toBe(
      'Too many attempts. Please try again in 1 second.',
    );
  });

  it('reports several seconds in the plural', () => {
    expect(rateLimitMessage(10)).toBe(
      'Too many attempts. Please try again in 10 seconds.',
    );
  });

  // A sub-second wait still has to read as a wait, not as "0 seconds".
  it('never reports less than one second', () => {
    expect(rateLimitMessage(0)).toBe(
      'Too many attempts. Please try again in 1 second.',
    );
  });

  it('rounds a partial second up', () => {
    expect(rateLimitMessage(4.2)).toBe(
      'Too many attempts. Please try again in 5 seconds.',
    );
  });

  it('switches to minutes at exactly one minute', () => {
    expect(rateLimitMessage(60)).toBe(
      'Too many attempts. Please try again in 1 minute.',
    );
  });

  it('stays in seconds just below a minute', () => {
    expect(rateLimitMessage(59)).toBe(
      'Too many attempts. Please try again in 59 seconds.',
    );
  });

  it('reports several minutes in the plural', () => {
    expect(rateLimitMessage(900)).toBe(
      'Too many attempts. Please try again in 15 minutes.',
    );
  });

  // Rounding up keeps the message from expiring before the cooldown does.
  it('rounds a partial minute up', () => {
    expect(rateLimitMessage(61)).toBe(
      'Too many attempts. Please try again in 2 minutes.',
    );
  });
});

describe('formatCountdown', () => {
  it('shows a sub-minute wait as bare seconds', () => {
    expect(formatCountdown(9)).toBe('9s');
  });

  it('switches to m:ss at exactly one minute', () => {
    expect(formatCountdown(60)).toBe('1:00');
  });

  it('zero-pads the seconds so the clock does not jump width', () => {
    expect(formatCountdown(65)).toBe('1:05');
  });

  it('shows a quarter of an hour as minutes and seconds', () => {
    expect(formatCountdown(899)).toBe('14:59');
  });

  // The timer stops at zero rather than counting into negative numbers if a
  // tick lands after the wait has already elapsed.
  it('never counts below zero', () => {
    expect(formatCountdown(-5)).toBe('0s');
  });

  it('rounds a partial second up so the clock never reads short', () => {
    expect(formatCountdown(8.2)).toBe('9s');
  });
});

describe('countdownMessage', () => {
  it('wraps the ticking clock in the same wording as the static message', () => {
    expect(countdownMessage(899)).toBe(
      'Too many attempts. Please try again in 14:59.',
    );
  });

  it('reads naturally for a short cooldown', () => {
    expect(countdownMessage(5)).toBe(
      'Too many attempts. Please try again in 5s.',
    );
  });
});

describe('attemptsRemainingMessage', () => {
  it('warns once the remaining attempts reach the threshold', () => {
    expect(attemptsRemainingMessage(LOGIN_ATTEMPTS_WARNING_AT)).toBe(
      '4 attempts remaining before this account is locked for at least 15 minutes.',
    );
  });

  it('uses the singular on the last attempt', () => {
    expect(attemptsRemainingMessage(1)).toBe(
      '1 attempt remaining before this account is locked for at least 15 minutes.',
    );
  });

  // A countdown in front of a single typo would alarm far more people than it
  // would help, so the warning stays quiet until the lock is close.
  it('says nothing while the lockout is still far off', () => {
    expect(attemptsRemainingMessage(LOGIN_ATTEMPTS_WARNING_AT + 1)).toBeNull();
  });

  // Past the threshold the account is already locked, and the countdown says
  // so; a "0 attempts remaining" alongside it would only be noise.
  it('says nothing once there are no attempts left', () => {
    expect(attemptsRemainingMessage(0)).toBeNull();
  });

  // The escalation window can make a repeat lock longer than the base, so the
  // figure quoted has to be a floor rather than a promise.
  it('quotes the base lockout as a floor, not an exact wait', () => {
    expect(attemptsRemainingMessage(2)).toContain(
      `at least ${LOGIN_LOCKOUT_SECONDS / 60} minutes`,
    );
  });
});
