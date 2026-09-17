import logger from '@/utils/pino';
import {
  TRUSTED_DEVICE_TTL_MS,
  MFA_SESSION_MAX_AGE_MS,
} from '@/constants/security';
import { headers } from 'next/headers';

export interface DeviceContext {
  userAgent?: string;
  ipAddress?: string;
}

export interface SecureDeviceInfo {
  name?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Extracts device context from server-side headers
 */
export async function getServerDeviceContext(): Promise<DeviceContext> {
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || undefined;
  const forwardedFor = headersList.get('x-forwarded-for');

  let ipAddress: string | undefined;
  if (forwardedFor) {
    ipAddress = forwardedFor.split(',')[0]?.trim() || undefined;
  } else {
    const realIp = headersList.get('x-real-ip');
    ipAddress = realIp ? realIp.trim() : undefined;
  }

  return { userAgent, ipAddress };
}

/**
 * Generates a user-friendly device name based on user agent
 */
export function generateDeviceName(userAgent?: string): string {
  if (!userAgent) return 'Unknown Device';

  // Extract browser name
  const detectBrowser = (userAgent: string) => {
    if (userAgent.includes('Edg')) return 'Edge';
    if (userAgent.includes('OPR')) return 'Opera';
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    return 'Unknown Browser';
  };

  const browser = detectBrowser(userAgent);

  // Extract OS
  const detectOS = (userAgent: string) => {
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS'))
      return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('iPhone')) return 'iOS';
    if (userAgent.includes('iPad')) return 'iPadOS';
    if (userAgent.includes('Android')) return 'Android';
    return 'Unknown OS';
  };
  const os = detectOS(userAgent);

  return `${browser} on ${os}`;
}

/**
 * Validates device context against stored values
 * Returns validation result and which attributes changed
 */
export function validateDeviceContext(
  current: DeviceContext,
  stored: DeviceContext,
): {
  isValid: boolean;
  userAgentChanged: boolean;
  ipAddressChanged: boolean;
} {
  // Loose match on browser family + OS, not the exact UA string: browser
  // auto-updates bump the version substring roughly monthly, which would
  // invalidate a 30-day trust for no security gain. Family/OS still catches a
  // token replayed from a different device. A UA present on one side but not
  // the other counts as changed so a stripped-UA replay can't slip through;
  // both-missing stays unchanged since there's nothing to compare.
  let userAgentChanged: boolean;
  if (!stored.userAgent && !current.userAgent) {
    userAgentChanged = false;
  } else if (!stored.userAgent || !current.userAgent) {
    userAgentChanged = true;
  } else {
    userAgentChanged =
      generateDeviceName(stored.userAgent) !==
      generateDeviceName(current.userAgent);
  }

  // Recorded for audit/anomaly signals only — never invalidates trust. Egress
  // IPs rotate constantly on VPNs, mobile, and Cloudflare WARP, so binding to
  // them guarantees churn for exactly the users most likely to be on a VPN.
  const ipAddressChanged = !!(
    stored.ipAddress &&
    current.ipAddress &&
    stored.ipAddress !== current.ipAddress
  );

  const isValid = !userAgentChanged;

  return {
    isValid,
    userAgentChanged,
    ipAddressChanged,
  };
}

export interface MfaSessionInput {
  isTrustedDevice: boolean;
  isEmailMfa: boolean;
  isAAL2: boolean;
  isEmailSessionMatch: boolean;
  lastVerifiedAt: string | null;
  now?: number;
}

/**
 * Whether an authenticated request may skip MFA re-verification.
 *
 * A trusted device passes outright. Otherwise recency alone is never enough:
 * both mfa_last_verified_at and email_mfa_session_verified_at are account-global,
 * so recency must be paired with a session-bound signal — Supabase AAL2 for
 * TOTP, a matching gotrue session_id for custom email MFA — to stop a fresh
 * verification on one browser from satisfying a different session.
 */
export function isMfaSessionValid({
  isTrustedDevice,
  isEmailMfa,
  isAAL2,
  isEmailSessionMatch,
  lastVerifiedAt,
  now = Date.now(),
}: MfaSessionInput): boolean {
  if (isTrustedDevice) return true;
  if (!lastVerifiedAt) return false;

  const recentlyVerified =
    now - new Date(lastVerifiedAt).getTime() < MFA_SESSION_MAX_AGE_MS;
  if (!recentlyVerified) return false;

  return isEmailMfa ? isEmailSessionMatch : isAAL2;
}

/**
 * Creates a trusted-device expiration timestamp
 */
export function createTrustExpirationDate(): Date {
  const now = new Date();
  return new Date(now.getTime() + TRUSTED_DEVICE_TTL_MS);
}

/**
 * Checks if a device trust has expired
 */
export function isTrustExpired(expiresAt: string | Date): boolean {
  const expiration =
    typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return new Date() > expiration;
}

/**
 * Sanitizes device info for storage (removes sensitive data)
 */
export function sanitizeDeviceInfo(deviceInfo: SecureDeviceInfo): object {
  return {
    name: deviceInfo.name,
    // Store basic info but not full user agent for privacy
    browserInfo: deviceInfo.userAgent
      ? {
          simplified: generateDeviceName(deviceInfo.userAgent),
        }
      : undefined,
  };
}

/**
 * Computes SHA-256 hash of input and returns as hex string
 */
export async function sha256Hex(input: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    logger.error({ error }, 'Failed to compute SHA-256 hash');
    throw new Error('Failed to compute SHA-256 hash');
  }
}

/**
 * Generates a random hexadecimal string of given byte length
 */
export function randomHex(bytes = 32): string {
  try {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (error) {
    logger.error({ error }, 'Failed to generate random hex');
    throw new Error('Failed to generate random hex');
  }
}
