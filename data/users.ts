'use server';
import { cache } from 'react';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { userRoles } from '@/constants/data';
import {
  AuthorizationError,
  DatabaseError,
  AuthenticationError,
} from '@/lib/errors';
import logger from '@/utils/pino';
import { isPortcoModuleEnabled } from '@/lib/v2/modules/portco';
import { filterVisibleOrgUsers } from '@/lib/utils/users';
import { isAssistantEnabled } from '@/lib/config/edge-config';
import { resolveDateFormat, DATE_FORMAT_DEFAULT } from '@/lib/date-format';
import { getOrgDateFormatPattern } from '@/lib/date-format-server';
import { BASE_CURRENCY_DEFAULT, type BaseCurrency } from '@/lib/base-currency';
import { getOrgBaseCurrency } from '@/lib/base-currency-server';
import { getUserRenderPreferences } from '@/lib/user-preferences-server';
import {
  PasswordResetState,
  UserMetadata,
  AccountAccessResult,
  MfaSessionState,
  MfaType,
  ModuleInfo,
} from '@/constants/types';
import { logAlert } from '@/utils/logging/alert';
import { acceptedUserRoles } from '@/constants/data';
import { resolveDefaultModule } from '@/lib/modules/default-module';
import { redirect } from 'next/navigation';
import { sendPasswordResetEmail } from '@/app/lib/auth/actions';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/database.types';
import {
  createResetState,
  getResetState,
  setResetEmailCookie,
} from '@/app/lib/auth/resetSession';
import { getMcpContext } from '@/app/lib/mcp/context';
import {
  checkLoginRateLimit,
  checkPasswordResetRateLimit,
  clearLoginFailures,
  clearPasswordResetFailures,
  recordLoginFailure,
  recordPasswordResetFailure,
  type LoginFailureOutcome,
} from '@/app/lib/auth/login-rate-limit';
import { rateLimitMessage } from '@/app/lib/auth/rate-limit-message';
import { getServerDeviceContext } from '@/app/lib/auth/trusted-device-utils';
import {
  checkMFATrustStatus,
  cleanupOrphanedMFAFactors,
} from '@/app/lib/auth/mfa-actions';
import {
  auditLogger,
  extractAuditContext,
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  type AuditEventContext,
} from '@/lib/audit';

type User = Database['public']['Tables']['users']['Row'];

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (Object.keys(user as object).length === 0) return null;
  const picked: any = [
    'id',
    'email',
    'confirmed_at',
    'user_metadata',
    'app_metadata',
  ].reduce((obj, key) => {
    if (user && key in user) {
      // @ts-ignore
      obj[key] = user[key];
    }
    return obj;
  }, {});
  return picked;
}

export async function getOrganizationData(organizationId: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('organizations')
      .select<string, any>('*')
      .eq('id', organizationId)
      .single();

    if (error) throw error;

    return data || null;
  } catch (error) {
    console.error('Error fetching organization name:', error);
    return null;
  }
}

export async function getUserProfile(userId: string): Promise<User | null> {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('users')
      .select<string, User>('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    logger.error(error, 'Error fetching user profile');
    return null;
  }
}

export async function getAllOrgUsers(orgId: string) {
  if (!orgId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .select<string, { id: string }>('*')
    .eq('organization_id', orgId);
  if (error)
    throw new DatabaseError('Error fetching organization users', error);
  return data.map((user: any) => user.id);
}

export async function getAllOrgUserData(
  orgId: string,
  options?: {
    includePostsigUsers?: boolean;
    currentUserEmail?: string | null;
  },
) {
  if (!orgId) return [];
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('users')
      .select<
        string,
        {
          id: string;
          email: string;
          name: string;
          job_title: string | null;
          department: string | null;
          user_role: Array<{ role_id: number }>;
        }
      >(
        `
        id,
        email,
        name,
        job_title,
        department,
        user_role:user_roles2(role_id)
      `,
      )
      .eq('organization_id', orgId);

    if (error) throw error;

    const users =
      data?.map((user) => ({
        ...user,
        user_role: user.user_role[0]?.role_id ?? null,
      })) ?? [];

    return filterVisibleOrgUsers(users, options);
  } catch (error) {
    logger.error(error, 'Error fetching organization users');
    throw new DatabaseError(
      'Error fetching organization users',
      error as Error,
    );
  }
}

export async function getSession() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data;
}

export async function verifyUser(userId: string) {
  const supabase = await createClient();
  const { error, status } = await verifyUserRoles(userId, acceptedUserRoles);
  if (!status) {
    await supabase.auth.signOut();
    throw new AuthorizationError(
      'User does not have the correct roles assigned.',
    );
  }
  if (error) {
    logger.error(error as Error, 'Error verifying user roles');
    throw error;
  }
}

export async function verifyUserRoles(userId: string, roles: number[]) {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('user_roles2')
      .select<string, { role_id: number }>('role_id')
      .eq('user_id', userId);
    if (error) throw error;
    if (data.length === 0)
      throw new AuthorizationError("User doesn't have any roles assigned.");
    const userRoles = data.map((role) => role.role_id);
    return { status: roles.some((role) => userRoles.includes(role)) };
  } catch (error: any) {
    return { error };
  }
}

/**
 * Whether a sign-in error means the credentials were rejected, as opposed to the
 * auth service being unable to answer. Only a rejection may spend an attempt:
 * counting a 429 or a 5xx would turn an upstream blip into a wave of real
 * lockouts that outlive it, escalating to hours on the repeat ladder.
 */
function isCredentialRejection(error: { status?: number }): boolean {
  const status = error.status ?? 0;
  return status !== 429 && status < 500;
}

/**
 * Records a failure and, if it crossed a threshold, audits the lockout itself —
 * the LOGIN_FAILED rows alone do not say when enforcement started.
 */
async function recordFailureAndAuditLockout(
  email: string,
  context: AuditEventContext,
): Promise<LoginFailureOutcome> {
  const outcome = await recordLoginFailure(email);

  if (outcome.emailLocked) {
    await auditLogger.logEvent({
      action: AUDIT_ACTIONS.ACCOUNT_LOCKED,
      resourceType: AUDIT_RESOURCE_TYPES.AUTHENTICATION,
      // No user id on a wrong password, so the address is the only identifier.
      resourceId: email,
      newData: { scope: 'email', failures: outcome.failures },
      context: { ...context, metadata: { ...context.metadata, email } },
    });
  }

  if (outcome.ipLocked) {
    await auditLogger.logEvent({
      action: AUDIT_ACTIONS.SUSPICIOUS_ACTIVITY,
      resourceType: AUDIT_RESOURCE_TYPES.AUTHENTICATION,
      resourceId: context.ipAddress,
      newData: { scope: 'device', userAgent: context.userAgent },
      context,
    });
    // Either a spray in progress or a whole office shut out — both need a human,
    // so this alerts rather than only landing in the audit table.
    logAlert(
      'login-ip-lockout-triggered',
      null,
      { ipAddress: context.ipAddress, userAgent: context.userAgent },
      'Login lockout applied to a client (source IP and user agent)',
    );
  }

  return outcome;
}

export async function signInWithPassword({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<{
  state: boolean;
  requiresMFA: boolean;
  user?: any;
  mfaType?: MfaType;
  rateLimited?: { retryAfterSeconds: number };
  serviceError?: boolean;
  invalidCredentials?: {
    attemptsRemaining: number | null;
    lockedForSeconds: number | null;
    /** Wait the limiter has already placed on the next attempt, if any. */
    nextAttemptInSeconds: number | null;
  };
}> {
  const { ipAddress, userAgent } = await getServerDeviceContext();
  const context = extractAuditContext(undefined, { ipAddress, userAgent });
  let auditLogged = false;
  const rateLimit = await checkLoginRateLimit(email);

  const nextAttemptInSeconds = rateLimit.allowed
    ? rateLimit.nextAttemptInSeconds
    : undefined;
  if (!rateLimit.allowed) {
    await auditLogger.logAuthenticationEvent(
      AUDIT_ACTIONS.LOGIN_BLOCKED,
      {
        ...context,
        metadata: {
          email,
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
      },
      { email, retryAfterSeconds: rateLimit.retryAfterSeconds },
    );
    return {
      state: false,
      requiresMFA: false,
      rateLimited: { retryAfterSeconds: rateLimit.retryAfterSeconds },
    };
  }

  try {
    const supabase = await createClient();
    const {
      error: signInError,
      data: { user, session },
    } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      // Log failed login attempt
      await auditLogger.logAuthenticationEvent(
        AUDIT_ACTIONS.LOGIN_FAILED,
        {
          ...context,
          metadata: {
            email,
            reason: signInError.message,
          },
        },
        { email, error: signInError.message },
      );
      if (!isCredentialRejection(signInError)) {
        return { state: false, requiresMFA: false, serviceError: true };
      }
      // Returned, not thrown, for the same reason as the throttled result
      // above — otherwise the attempts left and the lockout are never shown.
      const outcome = await recordFailureAndAuditLockout(email, context);
      return {
        state: false,
        requiresMFA: false,
        invalidCredentials: {
          attemptsRemaining: outcome.attemptsRemaining,
          lockedForSeconds: outcome.lockedForSeconds,
          nextAttemptInSeconds: nextAttemptInSeconds ?? null,
        },
      };
    }

    if (!user) {
      await auditLogger.logAuthenticationEvent(
        AUDIT_ACTIONS.LOGIN_FAILED,
        {
          ...context,
          metadata: {
            email,
            reason: 'Authentication failed - no user returned',
          },
        },
        { email },
      );
      // No error and no user says nothing about the password, so it must not
      // spend an attempt either.
      return { state: false, requiresMFA: false, serviceError: true };
    }

    // Runs before the MFA branch below: that branch returns early, so an
    // authorization check placed after it never sees an MFA-enabled account.
    // Deactivated users were reaching the MFA prompt and then an empty app.
    const access = await getAccountAccess(supabase, user.id);
    if (access.status === 'denied') {
      await supabase.auth.signOut();

      await auditLogger.logAuthenticationEvent(
        AUDIT_ACTIONS.LOGIN_FAILED,
        {
          ...context,
          userId: user.id,
          metadata: { email, reason: access.reason },
        },
        { email, reason: access.reason },
      );
      auditLogged = true;
      throw new AuthorizationError('Account is not permitted to sign in.');
    }

    const { data: mfaData, error: mfaError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (mfaError) throw new AuthenticationError(mfaError.message);
    // Check for Supabase TOTP MFA
    const hasTotpMFA =
      mfaData.nextLevel === 'aal2' &&
      mfaData.nextLevel !== mfaData.currentLevel &&
      user.factors &&
      user.factors.length > 0;

    const mfaTrustStatus = await checkMFATrustStatus();
    const { needsVerification, mfaType } = mfaTrustStatus;
    // Check if any MFA is required
    if (needsVerification) {
      // Log partial login (requires MFA)
      await auditLogger.logAuthenticationEvent(
        AUDIT_ACTIONS.MFA_REQUIRED,
        {
          ...context,
          userId: user.id,
          metadata: {
            email,
            requiresMFA: true,
            trustExpired: true,
            mfaType,
          },
        },
        {
          email,
          requiresMFA: true,
          trustExpired: true,
          mfaType,
        },
      );
      auditLogged = true;
      await clearLoginFailures(email);

      // User has MFA enabled and trust has expired - require verification
      return {
        state: true,
        requiresMFA: true,
        user,
        mfaType,
      };
    }

    // Log successful login
    await auditLogger.logAuthenticationEvent(
      AUDIT_ACTIONS.LOGIN_SUCCESS,
      {
        ...context,
        userId: user.id,
        organizationId: user.user_metadata.organization_id,
        metadata: {
          email,
          requiresMFA: false,
        },
      },
      { email, requiresMFA: false },
    );
    auditLogged = true;
    await clearLoginFailures(email);
    return {
      state: true,
      requiresMFA: false,
      mfaType,
    };
  } catch (error: any) {
    // An authorization denial is final: it has already signed the session out
    // and written its own audit entry, and remapping it to AuthenticationError
    // would lose the reason. Callers must still surface the same generic
    // message they show for a bad password — a denial that reads differently
    // lets an attacker enumerate which accounts exist and are disabled.
    if (error instanceof AuthorizationError) throw error;

    logger.error({ error: error.message }, 'User role check failed');

    // Log generic login failure if not already logged
    if (!auditLogged) {
      await auditLogger.logAuthenticationEvent(
        AUDIT_ACTIONS.LOGIN_FAILED,
        {
          ...context,
          metadata: {
            email,
            reason: error?.message || 'Sign in failed',
          },
        },
        { email, error: error?.message },
      );
      auditLogged = true;
    }

    const supabase = await createClient();
    await supabase.auth.signOut();
    throw new AuthenticationError(error?.message || 'Sign in failed');
  }
}

export async function getUserRole() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('user_roles2')
    .select<string, { role_id: number }>('role_id')
    .eq('user_id', user.id);
  const roles = data?.map((role) => role.role_id);

  switch (true) {
    case roles?.includes(userRoles.clientSupervisor):
      return userRoles.clientSupervisor;
    case roles?.includes(userRoles.clientAdmin):
      return userRoles.clientAdmin;
    case roles?.includes(userRoles.clientReviewer):
      return userRoles.clientReviewer;
    case roles?.includes(userRoles.clientUser):
      return userRoles.clientUser;
    case roles?.includes(userRoles.postsigAdmin):
      return userRoles.postsigAdmin;
    case roles?.includes(userRoles.postsigUser):
      return userRoles.postsigUser;
    case roles?.includes(userRoles.postsigExtractor):
      return userRoles.postsigExtractor;
    case roles?.includes(userRoles.postsigReviewer):
      return userRoles.postsigReviewer;
    default:
      return userRoles.clientUser;
  }
}

export async function getAllUserRoles(): Promise<number[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  try {
    const { data, error } = await supabase
      .from('user_roles2')
      .select<string, { role_id: number }>('role_id')
      .eq('user_id', user.id);

    if (error) throw error;
    return data.map((role) => role.role_id);
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return [];
  }
}

/**
 * Resolve the highest-priority role from a list of role IDs.
 *
 * Must list every member of `acceptedUserRoles`. A role that is accepted but
 * missing here resolves to null, which the access gate reads as "disabled" and
 * locks the account out.
 */
function resolveTopRole(roleIds: number[]): number | null {
  const priority = [
    userRoles.clientSupervisor,
    userRoles.clientAdmin,
    userRoles.clientReviewer,
    userRoles.clientUser,
    userRoles.clientTrialUser,
    userRoles.postsigSuperAdmin,
    userRoles.postsigAdmin,
    userRoles.postsigUser,
    userRoles.postsigExtractor,
    userRoles.postsigReviewer,
  ];
  for (const role of priority) {
    if (roleIds.includes(role)) return role;
  }
  return null;
}

/** Shape for the single joined query result. */
interface UserMetadataRow {
  id: string;
  name: string | null;
  email: string | null;
  organization_id: string | null;
  job_title: string | null;
  email_alerts: boolean | null;
  email_frequency: string | null;
  advance_notice_period: number | null;
  signed_up: boolean | null;
  ftux_status: Record<string, boolean> | null;
  user_roles2: Array<{ role_id: number }>;
  organizations: {
    name: string;
    fiscal_year_start_month: number;
    trial: boolean | null;
    is_demo_org: boolean | null;
    missing_clauses_settings: unknown[] | null;
    missing_clauses_confirmed: boolean;
    organization_modules: Array<{
      is_enabled: boolean | null;
      settings: Record<string, unknown> | null;
      app_modules: { code: string } | null;
    }>;
  } | null;
  user_module_access: Array<{
    is_active: boolean | null;
    is_default: boolean | null;
    app_modules: {
      code: string;
      name: string;
      base_path: string;
      is_active: boolean;
    } | null;
  }>;
}

const DEFAULT_CPM_MODULE: ModuleInfo = {
  code: 'cpm',
  name: 'PostSig CPM',
  basePath: '/dashboard',
};

export const getUserMetadata = cache(async (): Promise<UserMetadata | null> => {
  const mcpContext = getMcpContext();
  if (mcpContext) {
    return mcpContext.userMetadata;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Single joined query: user profile + roles + org + modules
  const { data, error } = await supabase
    .from('users')
    .select<string, UserMetadataRow>(
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
    .eq('id', user.id)
    .eq('user_module_access.is_active', true)
    .single();

  if (error || !data) {
    logger.error(
      {
        errorMessage: error?.message,
        errorCode: error?.code,
        errorDetails: error?.details,
        errorHint: error?.hint,
        userId: user.id,
      },
      'Failed to fetch user metadata',
    );
    return null;
  }

  // Resolve highest-priority role
  const roles = data.user_roles2?.map((r) => r.role_id) ?? [];
  const userRole = resolveTopRole(roles);
  if (!userRole) return null;

  const organizationId = data.organization_id;
  if (!organizationId) return null;

  const org = data.organizations;
  if (!org) return null;

  // Build module access (fall back to default CPM if none)
  const activeModules: ModuleInfo[] = (data.user_module_access ?? [])
    .filter((uma) => uma.app_modules?.is_active)
    .map((uma) => ({
      code: uma.app_modules!.code,
      name: uma.app_modules!.name,
      basePath: uma.app_modules!.base_path,
    }));

  let modules = activeModules;
  let defaultModule: ModuleInfo | null = null;

  if (modules.length === 0) {
    modules = [DEFAULT_CPM_MODULE];
    defaultModule = DEFAULT_CPM_MODULE;
  } else {
    defaultModule = resolveDefaultModule(
      data.user_module_access ?? [],
      modules,
    );
  }

  // Check per-module trial from org modules
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

  // Process missing clauses settings
  let missingClausesSettings: string[] = [];
  const isClausesConfirmed = Boolean(org.missing_clauses_confirmed);

  if (
    org.missing_clauses_settings &&
    Array.isArray(org.missing_clauses_settings)
  ) {
    missingClausesSettings = org.missing_clauses_settings
      .filter((item: unknown) => item !== null && item !== undefined)
      .map((item: unknown) => String(item));
  }

  const assistantEnabled = await isAssistantEnabled(
    organizationId,
    !!data.email?.includes('@postsig.com'),
  );

  // Date format: org default from org_preferences, optional per-user override
  // from user_preferences — which is also where column layouts live, so both
  // per-user reads share a single query.
  const [orgDatePattern, userPreferences, baseCurrency] = await Promise.all([
    getOrgDateFormatPattern(organizationId),
    getUserRenderPreferences(supabase, user.id),
    getOrgBaseCurrency(organizationId),
  ]);
  const userDatePattern = userPreferences.dateFormatPattern;

  return {
    userId: user.id,
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
    columnLayouts: userPreferences.columnLayouts,
    organizationMissingClauseSettings: {
      settings: missingClausesSettings,
      isConfirmed: isClausesConfirmed,
    },
    appModules: modules,
    defaultModule: defaultModule ?? undefined,
    isTrial: org.trial ?? false,
    isPostsig: data.email?.includes('@postsig.com'),
    isDemoOrg: org.is_demo_org ?? false,
    assistantEnabled,
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
});

/**
 * Resolve the effective date-fns pattern for the current user (server-side).
 * Falls back to the hard default when metadata is unavailable.
 */
export const getEffectiveDateFormat = cache(async (): Promise<string> => {
  const metadata = await getUserMetadata();
  return metadata?.dateFormat ?? DATE_FORMAT_DEFAULT;
});

/**
 * Resolve the effective base display currency for the current user (server-side).
 * Falls back to the hard default when metadata is unavailable.
 */
export const getEffectiveBaseCurrency = cache(
  async (): Promise<BaseCurrency> => {
    const metadata = await getUserMetadata();
    return metadata?.baseCurrency ?? BASE_CURRENCY_DEFAULT;
  },
);

/** Shape for the slim middleware query result. */
interface MiddlewareMetadataRow extends MfaSessionState {
  signed_up: boolean | null;
  user_roles2: Array<{ role_id: number }>;
  organizations: {
    status: Database['public']['Enums']['organization_status'] | null;
    trial: boolean | null;
    organization_modules: Array<{
      settings: Record<string, unknown> | null;
      app_modules: { code: string } | null;
    }>;
  } | null;
  user_module_access: Array<{
    is_active: boolean | null;
    is_default: boolean | null;
    app_modules: {
      code: string;
      name: string;
      base_path: string;
      is_active: boolean;
    } | null;
  }>;
}

/**
 * Authorization gate for an already-authenticated session, plus the metadata
 * middleware routes on. Called at login (so a locked-out account is rejected at
 * the password step, before MFA) and on every middleware pass (so SSO, magic
 * links and sessions that were already live are covered too).
 *
 * `denied` and `error` are deliberately distinct: `denied` is a real
 * authorization decision and callers must fail closed on it, while `error` is
 * an infrastructure failure — failing closed there would sign every user out
 * over a transient database blip.
 *
 * Accepts the already-authenticated userId to avoid a redundant getUser() call.
 * The MFA columns ride along on the same row so the middleware's MFA gate does
 * not have to read `users` a second time.
 */
export async function getAccountAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AccountAccessResult> {
  const { data, error } = await supabase
    .from('users')
    .select<string, MiddlewareMetadataRow>(
      `
      signed_up,
      mfa_enabled,
      mfa_type,
      mfa_last_verified_at,
      email_mfa_session_verified_at,
      email_mfa_session_id,
      user_roles2(role_id),
      organizations!users_organization_id_fkey(
        status,
        trial,
        organization_modules(settings, app_modules(code))
      ),
      user_module_access!user_module_access_user_id_fkey(
        is_active, is_default,
        app_modules(code, name, base_path, is_active)
      )
    `,
    )
    // Revoked grants are fetched too, not filtered out in the query: "has
    // grants, none live" and "was never granted anything" mean different
    // things below and are indistinguishable once the query drops the
    // revoked rows.
    .eq('id', userId)
    .single();

  if (error || !data) {
    logAlert(
      'account-access-lookup-failure',
      error,
      { userId, action: 'getAccountAccess' },
      'Failed to fetch account access metadata',
    );
    return { status: 'error' };
  }

  const org = data.organizations;

  const roles = data.user_roles2?.map((r) => r.role_id) ?? [];
  const userRole = resolveTopRole(roles);
  if (!userRole) return { status: 'denied', reason: 'no-role' };

  if (!acceptedUserRoles.includes(userRole)) {
    return { status: 'denied', reason: 'role-not-permitted' };
  }

  if (org?.status === 'inactive') {
    return { status: 'denied', reason: 'org-inactive' };
  }

  // Deactivating a user in the admin app revokes their module grants — every
  // row flips to is_active=false with revoked_at/revoked_by set, rather than
  // being deleted. So "holds grants, none of them live" is a deliberate
  // revocation and must be denied. An account with no grant rows at all was
  // never provisioned into the module system and still gets the CPM fallback
  // below; conflating the two would lock those accounts out.
  const grants = data.user_module_access ?? [];
  const liveGrants = grants.filter((uma) => uma.is_active);
  if (grants.length > 0 && liveGrants.length === 0) {
    return { status: 'denied', reason: 'modules-revoked' };
  }

  // Build module access
  const activeModules: ModuleInfo[] = liveGrants
    .filter((uma) => uma.app_modules?.is_active)
    .map((uma) => ({
      code: uma.app_modules!.code,
      name: uma.app_modules!.name,
      basePath: uma.app_modules!.base_path,
    }));

  let modules = activeModules;
  let defaultModule: ModuleInfo | null = null;

  if (modules.length === 0) {
    modules = [DEFAULT_CPM_MODULE];
    defaultModule = DEFAULT_CPM_MODULE;
  } else {
    // liveGrants, not data.user_module_access: this query returns revoked rows
    // too (they are what marks an account deactivated), and a revoked row must
    // never supply the default module.
    defaultModule = resolveDefaultModule(liveGrants, modules);
  }

  // Check per-module trial from org modules
  const mwOrgModules = org?.organization_modules ?? [];
  const cpmTrialEnabled =
    (
      mwOrgModules.find((om) => om.app_modules?.code === 'cpm')
        ?.settings as Record<string, unknown> | null
    )?.trial_enabled === true;
  const investorTrialEnabled =
    (
      mwOrgModules.find((om) => om.app_modules?.code === 'investor')
        ?.settings as Record<string, unknown> | null
    )?.trial_enabled === true;

  return {
    status: 'ok',
    metadata: {
      userRole,
      appModules: modules,
      defaultModule: defaultModule ?? undefined,
      isTrial: org?.trial ?? false,
      cpmTrialEnabled,
      investorTrialEnabled,
      userProfile: { signed_up: data.signed_up },
      mfa: {
        mfa_enabled: data.mfa_enabled,
        mfa_type: data.mfa_type,
        mfa_last_verified_at: data.mfa_last_verified_at,
        email_mfa_session_verified_at: data.email_mfa_session_verified_at,
        email_mfa_session_id: data.email_mfa_session_id,
      },
    },
  };
}

export async function resetPasswordForEmail(formData: FormData) {
  try {
    const email = formData.get('email') as string;

    // Store email with expiry
    setResetEmailCookie(email);

    const supabase = createServiceClient();
    const userStatus = await verifyUserSignedUp(email);

    if ((userStatus && !userStatus.signed_up) || !userStatus) {
      redirect('/password/verify');
    }

    const { data: inviteData, error: inviteDataError } =
      await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
      });

    if (inviteDataError) {
      redirect(
        '/password/reset?error=Failed to generate password reset request',
      );
    }

    await sendPasswordResetEmail({
      otpToken: inviteData.properties.email_otp,
      email,
    });

    redirect('/password/verify');
  } catch (error) {
    console.error('Error requesting password reset:', error);
    throw error;
  }
}

export async function verifyUserSignedUp(email: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('users')
      .select<string, { id: string; signed_up: boolean }>('id, signed_up')
      .eq('email', email)
      .single();

    if (error) throw error;

    return data || null;
  } catch (error) {
    console.error('Error fetching user name:', error);
    return null;
  }
}

export async function verifyOTP(email: string, token: string) {
  const supabase = await createClient();

  try {
    const rateLimit = await checkPasswordResetRateLimit(email);
    if (!rateLimit.allowed) {
      return {
        error: rateLimitMessage(rateLimit.retryAfterSeconds),
        success: false,
      };
    }

    const { error: verifyError, data } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    });

    if (verifyError) {
      await recordPasswordResetFailure(email);
      return {
        error: 'Invalid or expired code. Please try again.',
        success: false,
      };
    }

    // Mailbox control lifts the lockout — the only self-service way out, since
    // a locked address cannot clear itself by signing in. Not done when the code
    // is requested: that step is unauthenticated.
    await clearPasswordResetFailures(email);
    await clearLoginFailures(email);

    // Create reset state with 15-minute window for password update
    createResetState(email, Date.now());

    return {
      success: true,
      error: null,
    };
  } catch (err) {
    return {
      error: 'An error occurred. Please try again.',
      success: false,
    };
  }
}

export async function updateUserFtuxStatus(
  userId: string,
  ftuxKey: string,
  seen: boolean = true,
) {
  const supabase = await createClient();

  try {
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select<
        string,
        { ftux_status: Record<string, boolean> | null }
      >('ftux_status')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;

    const currentFtux =
      (currentUser?.ftux_status as Record<string, boolean>) || {};
    const updatedFtux = { ...currentFtux, [ftuxKey]: seen };

    const { error: updateError } = await supabase
      .from('users')
      // @ts-ignore - Supabase type issue with update operation
      .update({
        ftux_status: updatedFtux,
      } as any)
      .eq('id', userId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error) {
    logger.error(error, 'Error updating FTUX status', {
      userId,
      ftuxKey,
      seen,
    });
    return { success: false, error };
  }
}

export async function getUserFtuxStatus(
  userId: string,
  ftuxKey: string,
): Promise<boolean> {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('users')
      .select<
        string,
        { ftux_status: Record<string, boolean> | null }
      >('ftux_status')
      .eq('id', userId)
      .single();

    if (error) throw error;

    const ftuxStatus = (data?.ftux_status as Record<string, boolean>) || {};
    return ftuxStatus[ftuxKey] || false;
  } catch (error) {
    logger.error(error, 'Error fetching FTUX status', { userId, ftuxKey });
    return false;
  }
}

export async function updatePassword(formData: FormData) {
  const password = formData.get('password') as string;
  const supabase = await createClient();
  const context = extractAuditContext();
  const cookieStore = await cookies();

  try {
    const { id } = await getUser();
    if (!id) {
      return { error: 'User not found' };
    }

    await cleanupOrphanedMFAFactors();

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      // Log failed password change
      await auditLogger.logUserEvent(AUDIT_ACTIONS.PASSWORD_CHANGE, id, {
        ...context,
        userId: id,
        metadata: {
          success: false,
          reason: updateError.message,
        },
      });

      if (updateError.name === 'AuthSessionMissingError') {
        return {
          error: 'User session is not found.',
          redirect: '/password/reset?error=User session is not found',
        };
      }
      return { error: updateError.message };
    }

    const resetState = getResetState();
    if (resetState) {
      // Mark as completed with very short expiry
      const updatedState: PasswordResetState = {
        ...resetState,
        completed: true,
        email: '',
        recoveryTimestamp: 0,
      };

      // Clear the password reset state cookie
      cookieStore.set('password_reset_state', JSON.stringify(updatedState), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 10,
        path: '/',
      });
    }

    // Clear the temp email cookie
    cookieStore.set('temp_email', '', {
      path: '/password/verify',
      maxAge: 0,
    });

    // Invalidate every session for this user — including any other devices or
    // hijacked sessions an attacker may hold. They'll have to re-auth with the
    // new password to get back in. Loosely matches GitHub/AWS post-reset UX.
    await supabase.auth.signOut({ scope: 'global' });

    // Log successful password change
    await auditLogger.logUserEvent(AUDIT_ACTIONS.PASSWORD_CHANGE, id, {
      ...context,
      userId: id,
      metadata: {
        success: true,
        via: 'password_reset',
      },
    });

    const message = encodeURIComponent(
      'Password updated. Please sign in with your new password.',
    );
    return { success: true, redirect: `/login?message=${message}` };
  } catch (err) {
    // Log failed password change attempt
    const user = await getUser();
    if (user?.id) {
      await auditLogger.logUserEvent(AUDIT_ACTIONS.PASSWORD_CHANGE, user.id, {
        ...context,
        userId: user.id,
        metadata: {
          success: false,
          reason: 'Unknown error occurred',
        },
      });
    }

    return { error: 'An error occurred. Please try again.' };
  }
}
