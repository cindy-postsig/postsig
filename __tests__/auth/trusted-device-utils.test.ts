jest.mock('next/headers', () => ({ headers: jest.fn(), cookies: jest.fn() }));

import {
  validateDeviceContext,
  isMfaSessionValid,
} from '@/app/lib/auth/trusted-device-utils';
import { MFA_SESSION_MAX_AGE_MS } from '@/constants/security';

const CHROME_125 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const CHROME_126 =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FIREFOX_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0';

describe('validateDeviceContext', () => {
  it('stays valid when only the IP changes (VPN/WARP rotation)', () => {
    const result = validateDeviceContext(
      { userAgent: CHROME_125, ipAddress: '2.2.2.2' },
      { userAgent: CHROME_125, ipAddress: '1.1.1.1' },
    );
    expect(result.isValid).toBe(true);
    expect(result.ipAddressChanged).toBe(true);
  });

  it('stays valid across a browser version bump (same family + OS)', () => {
    const result = validateDeviceContext(
      { userAgent: CHROME_126, ipAddress: '1.1.1.1' },
      { userAgent: CHROME_125, ipAddress: '1.1.1.1' },
    );
    expect(result.isValid).toBe(true);
    expect(result.userAgentChanged).toBe(false);
  });

  it('invalidates when the browser family changes', () => {
    const result = validateDeviceContext(
      { userAgent: FIREFOX_MAC },
      { userAgent: CHROME_125 },
    );
    expect(result.isValid).toBe(false);
    expect(result.userAgentChanged).toBe(true);
  });

  it('invalidates when the OS changes', () => {
    const result = validateDeviceContext(
      { userAgent: CHROME_WINDOWS },
      { userAgent: CHROME_126 },
    );
    expect(result.isValid).toBe(false);
    expect(result.userAgentChanged).toBe(true);
  });

  it('invalidates when the request drops its User-Agent (stripped-UA replay)', () => {
    const result = validateDeviceContext(
      { ipAddress: '1.1.1.1' },
      { userAgent: CHROME_125, ipAddress: '1.1.1.1' },
    );
    expect(result.isValid).toBe(false);
    expect(result.userAgentChanged).toBe(true);
  });

  it('is valid when there is no stored context to compare against', () => {
    expect(validateDeviceContext({}, {}).isValid).toBe(true);
  });
});

describe('isMfaSessionValid', () => {
  const now = 1_700_000_000_000;
  const recent = new Date(now - 60_000).toISOString();
  const stale = new Date(now - MFA_SESSION_MAX_AGE_MS - 60_000).toISOString();

  it('allows a trusted device regardless of recency or AAL', () => {
    expect(
      isMfaSessionValid({
        isTrustedDevice: true,
        isEmailMfa: false,
        isAAL2: false,
        isEmailSessionMatch: false,
        lastVerifiedAt: null,
        now,
      }),
    ).toBe(true);
  });

  it('denies when there is no prior verification', () => {
    expect(
      isMfaSessionValid({
        isTrustedDevice: false,
        isEmailMfa: false,
        isAAL2: true,
        isEmailSessionMatch: true,
        lastVerifiedAt: null,
        now,
      }),
    ).toBe(false);
  });

  it('allows recent TOTP verification only when the session is AAL2', () => {
    expect(
      isMfaSessionValid({
        isTrustedDevice: false,
        isEmailMfa: false,
        isAAL2: true,
        isEmailSessionMatch: false,
        lastVerifiedAt: recent,
        now,
      }),
    ).toBe(true);
  });

  it('denies recent TOTP recency without AAL2 (account-global timestamp alone)', () => {
    expect(
      isMfaSessionValid({
        isTrustedDevice: false,
        isEmailMfa: false,
        isAAL2: false,
        isEmailSessionMatch: true,
        lastVerifiedAt: recent,
        now,
      }),
    ).toBe(false);
  });

  it('denies once the recency window has elapsed even with AAL2', () => {
    expect(
      isMfaSessionValid({
        isTrustedDevice: false,
        isEmailMfa: false,
        isAAL2: true,
        isEmailSessionMatch: false,
        lastVerifiedAt: stale,
        now,
      }),
    ).toBe(false);
  });

  it('allows recent email MFA only when the session_id matches', () => {
    expect(
      isMfaSessionValid({
        isTrustedDevice: false,
        isEmailMfa: true,
        isAAL2: false,
        isEmailSessionMatch: true,
        lastVerifiedAt: recent,
        now,
      }),
    ).toBe(true);
  });

  it('denies recent email MFA when the session_id does not match (fresh device)', () => {
    expect(
      isMfaSessionValid({
        isTrustedDevice: false,
        isEmailMfa: true,
        isAAL2: false,
        isEmailSessionMatch: false,
        lastVerifiedAt: recent,
        now,
      }),
    ).toBe(false);
  });

  it('denies stale email MFA even when the session_id matches', () => {
    expect(
      isMfaSessionValid({
        isTrustedDevice: false,
        isEmailMfa: true,
        isAAL2: false,
        isEmailSessionMatch: true,
        lastVerifiedAt: stale,
        now,
      }),
    ).toBe(false);
  });
});
