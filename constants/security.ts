// Trusted device time-to-live in days
export const TRUSTED_DEVICE_TTL_DAYS = 30;

// Milliseconds helper, useful for date math
export const TRUSTED_DEVICE_TTL_MS =
  TRUSTED_DEVICE_TTL_DAYS * 24 * 60 * 60 * 1000;

// How long a verified MFA session stays valid before re-verification is required.
export const MFA_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

// Cookie holding the raw trusted-device token. Set server-side as HttpOnly so
// it survives client-side cookie clearing and stays out of reach of XSS.
export const TRUSTED_DEVICE_COOKIE_NAME = 'device_trust_token';

// Fixed window, anchored to the first attempt in it. A lock may outlive the
// window — the 1h and 4h repeat steps below do — which is fine: the lock holds on
// its own key, and the counter starting fresh underneath is what gives a released
// user their next allowance. Escalation is tracked separately, on a 24h key.
export const LOGIN_FAILURE_WINDOW_SECONDS = 30 * 60;

// Free attempts, then a delay climbing by the base each step (10s, 20s, 30s, 40s).
// Counted at the gate, so this threshold is attempts made, not failures recorded.
export const LOGIN_COOLDOWN_AFTER_ATTEMPTS = 3;
export const LOGIN_COOLDOWN_SECONDS = 10;
export const LOGIN_COOLDOWN_MAX_SECONDS = 40;

// Lockout threshold. A repeat lock inside the escalation window steps along the
// ladder, so the first lock stays short for a user who just forgot.
export const LOGIN_LOCKOUT_AFTER_FAILURES = 10;
export const LOGIN_LOCKOUT_SECONDS = 15 * 60;
export const LOGIN_LOCKOUT_REPEAT_SECONDS = [15 * 60, 60 * 60, 4 * 60 * 60];
export const LOGIN_LOCKOUT_ESCALATION_WINDOW_SECONDS = 24 * 60 * 60;

// Remaining attempts at which the form starts warning — early enough to reset
// the password instead, late enough not to alarm an ordinary typo.
export const LOGIN_ATTEMPTS_WARNING_AT = 4;

// Spray tier: keyed on IP + a hashed user agent. Unlike the tier above this one
// counts failures already recorded, not attempts made, so ordinary traffic from a
// shared address never spends it — only bad credentials do.
export const LOGIN_IP_COOLDOWN_AFTER_FAILURES = 8;
export const LOGIN_IP_COOLDOWN_SECONDS = 10;
export const LOGIN_IP_COOLDOWN_MAX_SECONDS = 40;
export const LOGIN_IP_LOCKOUT_AFTER_FAILURES = 20;
export const LOGIN_IP_LOCKOUT_SECONDS = 30 * 60;

// Deadline before a login proceeds anyway. A hung store answers neither quickly
// nor with an error, and the client allows seconds per command.
export const LOGIN_RATE_LIMIT_TIMEOUT_MS = 1000;

// Short numeric codes — MFA verification and the password-reset recovery code —
// share one policy, and the same allowance and ladder as the password tier above,
// so there is one set of numbers to reason about rather than three. Ten failures
// rather than five because authenticator clock drift makes some failures routine.
export const CODE_VERIFY_WINDOW_SECONDS = 30 * 60;
export const CODE_VERIFY_COOLDOWN_AFTER_ATTEMPTS = 3;
export const CODE_VERIFY_COOLDOWN_SECONDS = 10;
export const CODE_VERIFY_COOLDOWN_MAX_SECONDS = 40;
export const CODE_VERIFY_LOCKOUT_AFTER_FAILURES = 10;
export const CODE_VERIFY_LOCKOUT_SECONDS = 15 * 60;
