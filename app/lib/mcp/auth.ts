import { createHash, randomBytes } from 'node:crypto';
import { after } from 'next/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { isPortcoModuleEnabled } from '@/lib/v2/modules/portco';
import type { UserMetadata, ModuleInfo } from '@/constants/types';
import { resolveDateFormat } from '@/lib/date-format';
import {
  getOrgDateFormatPattern,
  getUserDateFormatPattern,
} from '@/lib/date-format-server';
import { getOrgBaseCurrency } from '@/lib/base-currency-server';
import type { McpScope, McpTokenSource } from '@/app/lib/mcp/context';
import {
  canonicalResourceUrl,
  MCP_REQUIRED_SCOPE,
} from '@/app/lib/mcp/oauth-metadata';

export interface ResolvedToken {
  tokenId: string;
  tokenSource: McpTokenSource;
  userMetadata: UserMetadata;
  scopes: McpScope[];
}

// Distinguishes "valid credentials, but the org doesn't have MCP enabled"
// from plain auth failure. Routes must answer it with 403 rather than the
// 401 + WWW-Authenticate challenge, which MCP clients treat as "token is
// bad, restart the OAuth flow" — an unrecoverable loop when the real
// problem is org configuration.
export const MODULE_DISABLED = Symbol('mcp-module-disabled');

export type BearerResolution = ResolvedToken | typeof MODULE_DISABLED | null;

export type McpModule = 'cpm' | 'investor';

const LEGACY_TOKEN_PREFIX_MARKER = 'postsig_mcp_';

const ROLE_PRIORITY = [12, 11, 14, 13, 1] as const;

function resolveTopRole(roleIds: number[]): number | null {
  for (const r of ROLE_PRIORITY) {
    if (roleIds.includes(r)) return r;
  }
  return roleIds[0] ?? null;
}

function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function resolveBearerToken(
  authHeader: string | null | undefined,
  module: McpModule,
): Promise<BearerResolution> {
  const plaintext = parseBearer(authHeader);
  if (!plaintext) return null;

  // Dispatch by token shape: legacy static tokens carry our prefix, OAuth JWTs
  // do not. Keeps the legacy path working until clients have migrated.
  if (plaintext.startsWith(LEGACY_TOKEN_PREFIX_MARKER)) {
    return resolveLegacyBearerToken(plaintext, module);
  }
  return resolveOAuthBearerToken(plaintext, module);
}

async function resolveLegacyBearerToken(
  plaintext: string,
  module: McpModule,
): Promise<BearerResolution> {
  const supabase = createServiceClient();
  const tokenHash = hashToken(plaintext);

  // Filter by module at the DB layer (not post-lookup) so a misissued
  // token doesn't leak even a row id.
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('mcp_api_tokens')
    .select('id, user_id, organization_id, scopes, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .eq('module', module)
    .is('revoked_at', null)
    .maybeSingle();

  if (tokenErr) {
    logger.error({ err: tokenErr }, 'mcp: token lookup failed');
    return null;
  }
  if (!tokenRow) return null;

  if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
    return null;
  }

  const userMetadata = await loadUserMetadataById(tokenRow.user_id);
  if (!userMetadata) {
    logger.warn(
      { tokenId: tokenRow.id, userId: tokenRow.user_id },
      'mcp: token resolved but user metadata not found',
    );
    return null;
  }

  if (userMetadata.organizationId !== tokenRow.organization_id) {
    logger.error(
      {
        tokenId: tokenRow.id,
        tokenOrg: tokenRow.organization_id,
        userOrg: userMetadata.organizationId,
      },
      'mcp: token org mismatch with user org',
    );
    return null;
  }

  const moduleEnabled =
    module === 'cpm'
      ? userMetadata.cpmMcpEnabled
      : userMetadata.investorMcpEnabled;
  if (!moduleEnabled) {
    logger.warn(
      { tokenId: tokenRow.id, orgId: userMetadata.organizationId, module },
      'mcp: token rejected because org no longer has MCP enabled for this module',
    );
    return MODULE_DISABLED;
  }

  const scopes = (tokenRow.scopes ?? []).filter(
    (s: string): s is McpScope => s === 'read' || s === 'write',
  );

  return {
    tokenId: tokenRow.id,
    tokenSource: 'pat',
    userMetadata,
    scopes,
  };
}

interface ResolvedGrant {
  grantId: string;
  scopes: McpScope[];
}

async function resolveOrCreateGrant(
  userId: string,
  clientId: string,
  module: McpModule,
): Promise<ResolvedGrant | null> {
  const supabase = createServiceClient();

  const { data: existing, error: lookupErr } = await supabase
    .from('mcp_oauth_grants')
    .select('id, scopes, revoked_at, updated_at')
    .eq('user_id', userId)
    .eq('client_id', clientId)
    .eq('module', module)
    .maybeSingle();

  if (lookupErr) {
    logger.error({ err: lookupErr }, 'mcp: grant lookup failed');
    return null;
  }

  if (existing) {
    if (existing.revoked_at) return null;
    // after() keeps the touch alive across response — a detached promise
    // gets cut off when Vercel suspends the function, which stuck lastUsedAt
    // at created_at.
    const previousUpdatedAt = existing.updated_at;
    const lastTouchMs = new Date(previousUpdatedAt).getTime();
    if (Date.now() - lastTouchMs > 60_000) {
      after(async () => {
        // CAS on updated_at + revoked_at: concurrent requests can't both
        // win, and a revoke between SELECT and UPDATE is honored.
        const { error } = await supabase
          .from('mcp_oauth_grants')
          .update({ updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('client_id', clientId)
          .eq('module', module)
          .eq('updated_at', previousUpdatedAt)
          .is('revoked_at', null);
        if (error) {
          logger.warn(
            { err: error, userId, clientId, module },
            'mcp: grant touch failed',
          );
        }
      });
    }
    return {
      grantId: existing.id,
      scopes: (existing.scopes ?? []).filter(
        (s: string): s is McpScope => s === 'read' || s === 'write',
      ),
    };
  }

  // First MCP request from this client for this user/module — default to
  // read-only. Future settings UI can promote to read+write.
  const defaults: McpScope[] = ['read'];
  const { data: inserted, error: insertErr } = await supabase
    .from('mcp_oauth_grants')
    .insert({
      user_id: userId,
      client_id: clientId,
      module,
      scopes: defaults,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    // Race: another concurrent request just created it. Re-read.
    const { data: raced } = await supabase
      .from('mcp_oauth_grants')
      .select('id, scopes, revoked_at')
      .eq('user_id', userId)
      .eq('client_id', clientId)
      .eq('module', module)
      .maybeSingle();
    if (raced && !raced.revoked_at) {
      return {
        grantId: raced.id,
        scopes: (raced.scopes ?? []).filter(
          (s: string): s is McpScope => s === 'read' || s === 'write',
        ),
      };
    }
    logger.error({ err: insertErr }, 'mcp: grant insert failed');
    return null;
  }

  return { grantId: inserted.id, scopes: defaults };
}

interface OAuthClaims {
  sub?: string;
  client_id?: string;
  scope?: string;
  aud?: string | string[];
  resource?: string | string[];
  exp?: number;
}

function claimMatchesResource(
  claim: string | string[] | undefined,
  canonical: string,
): boolean {
  if (!claim) return false;
  return Array.isArray(claim) ? claim.includes(canonical) : claim === canonical;
}

function hasScope(scopeClaim: string | undefined, scope: string): boolean {
  if (!scopeClaim) return false;
  return scopeClaim.split(/\s+/).includes(scope);
}

async function resolveOAuthBearerToken(
  jwt: string,
  module: McpModule,
): Promise<BearerResolution> {
  const supabase = createServiceClient();

  // getClaims verifies the JWT against Supabase's JWKS (cached) and checks exp.
  // On an expired token it throws a plain Error('JWT has expired') rather than
  // returning it — that's not an AuthError, so getClaims re-throws instead of
  // surfacing it as { error }. Catch it here so an expired token resolves to a
  // 401 (prompting the client to refresh) rather than an uncaught 500.
  let data: Awaited<ReturnType<typeof supabase.auth.getClaims>>['data'];
  let error: Awaited<ReturnType<typeof supabase.auth.getClaims>>['error'];
  try {
    ({ data, error } = await supabase.auth.getClaims(jwt));
  } catch (err) {
    logger.debug({ err }, 'mcp: oauth jwt verification threw');
    return null;
  }
  if (error || !data) {
    logger.debug({ err: error }, 'mcp: oauth jwt verification failed');
    return null;
  }

  const claims = data.claims as OAuthClaims;

  // Only OAuth-issued tokens carry client_id. Reject regular session JWTs so
  // an end-user session cookie cannot be replayed against the MCP endpoint.
  if (!claims.client_id) {
    logger.warn(
      { sub: claims.sub },
      'mcp: rejected non-oauth jwt (missing client_id)',
    );
    return null;
  }

  if (!claims.sub) return null;

  if (!hasScope(claims.scope, MCP_REQUIRED_SCOPE)) {
    logger.warn(
      { client_id: claims.client_id, scope: claims.scope, module },
      `mcp: oauth token missing required scope (${MCP_REQUIRED_SCOPE})`,
    );
    return null;
  }

  // Audience binding (RFC 8707). Accept tokens whose `resource` or `aud` claim
  // names this MCP server. When neither matches we fall back to the endpoint
  // the token was presented at — log for visibility so we can tighten later.
  const canonical = canonicalResourceUrl(module);
  const explicitAudience =
    claimMatchesResource(claims.resource, canonical) ||
    claimMatchesResource(claims.aud, canonical);
  if (!explicitAudience) {
    logger.debug(
      { client_id: claims.client_id, aud: claims.aud, module },
      'mcp: oauth token without resource/aud binding — relying on endpoint match',
    );
  }

  // Per-module read/write lives in our own mcp_oauth_grants table — Supabase
  // can't validate custom scope strings. First request from a (user, client,
  // module) tuple gets a read-only grant; the settings page (future) can
  // promote it.
  const grant = await resolveOrCreateGrant(
    claims.sub,
    claims.client_id,
    module,
  );
  if (grant === null) {
    logger.warn(
      { client_id: claims.client_id, sub: claims.sub, module },
      'mcp: oauth grant revoked or unreadable',
    );
    return null;
  }

  const userMetadata = await loadUserMetadataById(claims.sub);
  if (!userMetadata) return null;

  const moduleEnabled =
    module === 'cpm'
      ? userMetadata.cpmMcpEnabled
      : userMetadata.investorMcpEnabled;
  if (!moduleEnabled) {
    logger.warn(
      {
        client_id: claims.client_id,
        orgId: userMetadata.organizationId,
        module,
      },
      'mcp: oauth token rejected — org does not have MCP enabled for this module',
    );
    return MODULE_DISABLED;
  }

  // Telemetry id: the grant row is our durable OAuth identity — stable across
  // token refresh and re-consent, unlike gotrue's session_id, and joinable
  // for per-grant "last used" the same way PATs derive it.
  return {
    tokenId: grant.grantId,
    tokenSource: 'oauth',
    userMetadata,
    scopes: grant.scopes,
  };
}

export async function loadUserMetadataById(
  userId: string,
): Promise<UserMetadata | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('users')
    .select(
      `
      id, name, email, organization_id, job_title, email_alerts,
      email_frequency, advance_notice_period, signed_up, ftux_status,
      user_roles2(role_id),
      organizations!users_organization_id_fkey(
        name, fiscal_year_start_month, trial, is_demo_org,
        missing_clauses_settings, missing_clauses_confirmed,
        organization_modules(is_enabled, settings, app_modules(code))
      ),
      user_module_access!user_module_access_user_id_fkey(
        is_active, is_default,
        app_modules(code, name, base_path, is_active)
      )
    `,
    )
    .eq('id', userId)
    .eq('user_module_access.is_active', true)
    .single();

  if (error || !data) {
    logger.error({ err: error, userId }, 'mcp: failed to load user metadata');
    return null;
  }

  const roles = (data.user_roles2 ?? []).map((r) => r.role_id);
  const userRole = resolveTopRole(roles);
  if (!userRole) return null;

  const organizationId = data.organization_id;
  if (!organizationId) return null;

  const org = data.organizations;
  if (!org) return null;

  const modules: ModuleInfo[] = (data.user_module_access ?? [])
    .filter((uma) => uma.app_modules?.is_active)
    .map((uma) => ({
      code: uma.app_modules!.code,
      name: uma.app_modules!.name,
      basePath: uma.app_modules!.base_path,
    }));

  const orgModules = org.organization_modules ?? [];
  const cpmSettings = orgModules.find((om) => om.app_modules?.code === 'cpm')
    ?.settings as Record<string, unknown> | null;
  const cpmTrialEnabled = cpmSettings?.trial_enabled === true;
  const cpmMcpEnabled = cpmSettings?.mcp_enabled === true;
  const cpmCsvExportEnabled = cpmSettings?.csv_export_enabled === true;
  const cpmInvoicesEnabled = cpmSettings?.invoices_enabled === true;
  const cpmExchangeAgreementsEnabled =
    cpmSettings?.exchange_agreements_enabled === true;
  const investorSettings = orgModules.find(
    (om) => om.app_modules?.code === 'investor',
  )?.settings as Record<string, unknown> | null;
  const investorTrialEnabled = investorSettings?.trial_enabled === true;
  const investorMcpEnabled = investorSettings?.mcp_enabled === true;
  const investorCsvExportEnabled =
    investorSettings?.csv_export_enabled === true;
  const portcoKpisEnabled = isPortcoModuleEnabled(orgModules);

  let missingClausesSettings: string[] = [];
  if (Array.isArray(org.missing_clauses_settings)) {
    missingClausesSettings = org.missing_clauses_settings
      .filter((item) => item !== null && item !== undefined)
      .map((item) => String(item));
  }

  // Date format: org default from org_preferences, optional per-user override
  // from user_preferences.
  const [orgDatePattern, userDatePattern, baseCurrency] = await Promise.all([
    getOrgDateFormatPattern(organizationId),
    getUserDateFormatPattern(supabase, data.id),
    getOrgBaseCurrency(organizationId),
  ]);

  return {
    userId: data.id,
    userProfile: {
      id: data.id,
      name: data.name,
      email: data.email,
      job_title: data.job_title,
      email_alerts: data.email_alerts,
      email_frequency: data.email_frequency,
      advance_notice_period: data.advance_notice_period,
      signed_up: data.signed_up,
      ftux_status: data.ftux_status as Record<string, boolean> | null,
      date_format: userDatePattern,
    },
    userRole,
    organizationId,
    organizationName: org.name,
    organizationFY: org.fiscal_year_start_month,
    dateFormat: resolveDateFormat(userDatePattern, orgDatePattern),
    organizationDateFormat: orgDatePattern,
    baseCurrency,
    organizationMissingClauseSettings: {
      settings: missingClausesSettings,
      isConfirmed: Boolean(org.missing_clauses_confirmed),
    },
    appModules: modules,
    defaultModule: modules[0],
    isTrial: org.trial ?? false,
    isPostsig: data.email?.includes('@postsig.com'),
    isDemoOrg: org.is_demo_org ?? false,
    assistantEnabled: false,
    cpmTrialEnabled,
    investorTrialEnabled,
    cpmMcpEnabled,
    investorMcpEnabled,
    cpmCsvExportEnabled,
    investorCsvExportEnabled,
    cpmInvoicesEnabled,
    cpmExchangeAgreementsEnabled,
    portcoKpisEnabled,
  };
}

const TOKEN_PREFIX = 'postsig_mcp_';
const PREFIX_ENTROPY_CHARS = 6;

export function generateTokenPlaintext(): {
  plaintext: string;
  prefix: string;
} {
  const plaintext = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, TOKEN_PREFIX.length + PREFIX_ENTROPY_CHARS),
  };
}

export { hashToken };
