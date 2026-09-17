import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockMaybeSingle = jest.fn<() => Promise<unknown>>();
const mockSingle = jest.fn<() => Promise<unknown>>();
const mockUpdate = jest.fn<() => Promise<unknown>>();
const mockGetClaims = jest.fn<() => Promise<unknown>>();

jest.mock('@/utils/supabase/service_server', () => ({
  __esModule: true,
  createClient: () => ({
    auth: { getClaims: mockGetClaims },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: mockMaybeSingle,
            }),
            single: mockSingle,
            // Date-format preference lookups end in .maybeSingle() after two
            // .eq() filters (organization_id/user_id + preference_key).
            maybeSingle: mockMaybeSingle,
            // Third .eq() level — the mcp_oauth_grants lookup filters on
            // user_id, client_id, and module before maybeSingle.
            eq: () => ({ maybeSingle: mockMaybeSingle }),
          }),
        }),
      }),
      update: () => ({
        eq: () => mockUpdate(),
      }),
    }),
  }),
}));

const mockLoadUserMetadata = jest.fn<() => Promise<unknown>>();
jest.mock('@/data/users', () => ({
  __esModule: true,
}));

import {
  generateTokenPlaintext,
  hashToken,
  MODULE_DISABLED,
  resolveBearerToken,
} from '@/app/lib/mcp/auth';

const VALID_TOKEN_ROW = {
  id: 't1',
  user_id: 'u1',
  organization_id: 'org-a',
  scopes: ['read'],
  expires_at: null,
  revoked_at: null,
};

function userRowWithMcp(mcpEnabled: boolean) {
  return {
    id: 'u1',
    name: 'Test User',
    email: 'user@example.com',
    organization_id: 'org-a',
    job_title: null,
    email_alerts: null,
    email_frequency: null,
    advance_notice_period: null,
    signed_up: true,
    ftux_status: null,
    user_roles2: [{ role_id: 12 }],
    organizations: {
      name: 'Org A',
      fiscal_year_start_month: 1,
      trial: false,
      missing_clauses_settings: null,
      missing_clauses_confirmed: false,
      organization_modules: [
        {
          settings: { mcp_enabled: mcpEnabled },
          app_modules: { code: 'cpm' },
        },
      ],
    },
    user_module_access: [],
  };
}

describe('hashToken', () => {
  it('produces a stable hex digest', () => {
    const a = hashToken('psk_mcp_abc');
    const b = hashToken('psk_mcp_abc');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns different digests for different inputs', () => {
    expect(hashToken('one')).not.toBe(hashToken('two'));
  });
});

describe('generateTokenPlaintext', () => {
  it('returns a postsig_mcp_-prefixed token and an 18-char prefix', () => {
    const { plaintext, prefix } = generateTokenPlaintext();
    expect(plaintext.startsWith('postsig_mcp_')).toBe(true);
    expect(prefix).toHaveLength(18);
    expect(plaintext.startsWith(prefix)).toBe(true);
  });

  it('produces unique tokens across calls', () => {
    const a = generateTokenPlaintext();
    const b = generateTokenPlaintext();
    expect(a.plaintext).not.toBe(b.plaintext);
  });
});

describe('resolveBearerToken', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockSingle.mockReset();
    mockUpdate.mockReset();
    mockGetClaims.mockReset();
    mockLoadUserMetadata.mockReset();
  });

  it('returns null for missing Authorization header', async () => {
    const result = await resolveBearerToken(null, 'cpm');
    expect(result).toBeNull();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('returns null for non-Bearer scheme', async () => {
    const result = await resolveBearerToken('Basic dXNlcjpwYXNz', 'cpm');
    expect(result).toBeNull();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('returns null for empty Bearer value', async () => {
    const result = await resolveBearerToken('Bearer ', 'cpm');
    expect(result).toBeNull();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('returns null when token is not in DB', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await resolveBearerToken(
      'Bearer postsig_mcp_unknown',
      'cpm',
    );
    expect(result).toBeNull();
  });

  it('returns null when DB lookup errors', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    const result = await resolveBearerToken('Bearer postsig_mcp_x', 'cpm');
    expect(result).toBeNull();
  });

  it('returns null when token is expired', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 't1',
        user_id: 'u1',
        organization_id: 'org-a',
        scopes: ['read'],
        expires_at: new Date(Date.now() - 60_000).toISOString(),
        revoked_at: null,
      },
      error: null,
    });
    const result = await resolveBearerToken(
      'Bearer postsig_mcp_expired',
      'cpm',
    );
    expect(result).toBeNull();
  });

  it('resolves a valid token when the org has MCP enabled', async () => {
    mockMaybeSingle.mockResolvedValue({ data: VALID_TOKEN_ROW, error: null });
    mockSingle.mockResolvedValue({ data: userRowWithMcp(true), error: null });
    const result = await resolveBearerToken('Bearer postsig_mcp_valid', 'cpm');
    expect(result).toMatchObject({
      tokenId: 't1',
      tokenSource: 'pat',
      scopes: ['read'],
    });
  });

  // MODULE_DISABLED, not null — null produces a 401 challenge that sends MCP
  // clients back into the OAuth loop; the routes turn this sentinel into 403.
  it('returns MODULE_DISABLED when the org has MCP disabled', async () => {
    mockMaybeSingle.mockResolvedValue({ data: VALID_TOKEN_ROW, error: null });
    mockSingle.mockResolvedValue({ data: userRowWithMcp(false), error: null });
    const result = await resolveBearerToken('Bearer postsig_mcp_valid', 'cpm');
    expect(result).toBe(MODULE_DISABLED);
  });

  it('returns MODULE_DISABLED on the OAuth path when the org has MCP disabled', async () => {
    mockGetClaims.mockResolvedValue({
      data: {
        claims: { sub: 'u1', client_id: 'client-1', scope: 'openid' },
      },
      error: null,
    });
    // Grant lookup: existing read grant, touched recently so the updated_at
    // refresh (which calls next/server after()) stays out of the test.
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'g1',
        scopes: ['read'],
        revoked_at: null,
        updated_at: new Date().toISOString(),
      },
      error: null,
    });
    mockSingle.mockResolvedValue({ data: userRowWithMcp(false), error: null });
    const result = await resolveBearerToken(
      'Bearer eyJhbGciOi.jwt.value',
      'cpm',
    );
    expect(result).toBe(MODULE_DISABLED);
    expect(mockGetClaims).toHaveBeenCalled();
  });
});
