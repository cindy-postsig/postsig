import {
  LOGIN_ATTEMPTS_WARNING_AT,
  LOGIN_LOCKOUT_SECONDS,
} from '@/constants/security';

const TOO_MANY = 'Too many attempts. Please try again in';

/** A wait as prose. Rounded up, and floored at 1s so it never reads "0 seconds". */
function formatDuration(seconds: number): string {
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const whole = Math.max(1, Math.ceil(seconds));
  return `${whole} second${whole === 1 ? '' : 's'}`;
}

export function rateLimitMessage(retryAfterSeconds: number): string {
  return `${TOO_MANY} ${formatDuration(retryAfterSeconds)}.`;
}

/** A wait as a ticking clock: m:ss over a minute, bare seconds under one. */
export function formatCountdown(secondsLeft: number): string {
  const left = Math.max(0, Math.ceil(secondsLeft));
  if (left < 60) return `${left}s`;
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function countdownMessage(secondsLeft: number): string {
  return `${TOO_MANY} ${formatCountdown(secondsLeft)}.`;
}

export function nextAttemptMessage(secondsLeft: number): string {
  return `You can try again in ${formatCountdown(secondsLeft)}.`;
}

/** How close this address is to locking, or null while it is too far to matter. */
export function attemptsRemainingMessage(
  attemptsRemaining: number,
): string | null {
  if (attemptsRemaining <= 0) return null;
  if (attemptsRemaining > LOGIN_ATTEMPTS_WARNING_AT) return null;
  return `${attemptsRemaining} attempt${
    attemptsRemaining === 1 ? '' : 's'
  } remaining before this account is locked for at least ${formatDuration(
    LOGIN_LOCKOUT_SECONDS,
  )}.`;
}
