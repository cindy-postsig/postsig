import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/database.types';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import {
  emailDomain,
  isPersonName,
  ssoDisplayName,
} from '@/app/lib/auth/sso-identity';
import { VIEWER_ROLE } from '@/constants/data';
import { logAlert } from '@/utils/logging/alert';
import logger from '@/utils/pino';

export type SsoProvisionRejection =
  | 'no-email-domain'
  | 'missing-user-row'
  | 'no-matching-org'
  | 'ambiguous-org'
  | 'error';

export type SsoProvisionOutcome =
  | { status: 'provisioned'; organizationId: string }
  | { status: 'already-provisioned'; organizationId: string }
  | { status: 'rejected'; reason: SsoProvisionRejection };

interface OrgModuleRow {
  module_id: number;
  is_enabled: boolean | null;
  app_modules: { code: string; is_active: boolean } | null;
}

function rejected(
  reason: SsoProvisionRejection,
  context: Record<string, unknown>,
  error: unknown = null,
): SsoProvisionOutcome {
  logAlert(
    'sso-provision-failure',
    error,
    { reason, ...context },
    'SSO sign-in could not be provisioned',
  );
  return { status: 'rejected', reason };
}

// A returning user must not be locked out over a cosmetic write.
async function backfillName(
  supabase: SupabaseClient<Database>,
  userId: string,
  name: string,
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ name })
    .eq('id', userId);
  if (error) {
    logger.warn(
      { userId, error, action: 'ssoNameBackfill' },
      'Could not backfill a blank SSO user name',
    );
  }
}

export async function provisionSsoUser(
  user: Pick<User, 'id' | 'email' | 'user_metadata'>,
  supabase: SupabaseClient<Database> = createServiceClient(),
): Promise<SsoProvisionOutcome> {
  const domain = emailDomain(user.email);
  const context = { userId: user.id, domain };

  if (!domain) return rejected('no-email-domain', context);

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('organization_id, name')
    .eq('id', user.id)
    .maybeSingle();

  if (userError || !userRow) {
    return rejected('missing-user-row', context, userError);
  }

  const name = isPersonName(userRow.name) ? undefined : ssoDisplayName(user);

  if (userRow.organization_id) {
    if (name) await backfillName(supabase, user.id, name);
    return {
      status: 'already-provisioned',
      organizationId: userRow.organization_id,
    };
  }

  const { data: orgs, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('domain', domain);

  if (orgError) return rejected('error', context, orgError);
  if (!orgs || orgs.length === 0) return rejected('no-matching-org', context);
  if (orgs.length > 1) return rejected('ambiguous-org', context);

  const organizationId = orgs[0].id;

  const { data: existingRole, error: roleLookupError } = await supabase
    .from('user_roles2')
    .select('id')
    .eq('user_id', user.id)
    .eq('role_id', VIEWER_ROLE)
    .maybeSingle();

  if (roleLookupError) {
    return rejected('error', context, roleLookupError);
  }
  if (!existingRole) {
    const { error: roleError } = await supabase
      .from('user_roles2')
      .insert({ user_id: user.id, role_id: VIEWER_ROLE });
    if (roleError) return rejected('error', context, roleError);
  }

  const { data: orgModules, error: moduleError } = await supabase
    .from('organization_modules')
    .select<
      string,
      OrgModuleRow
    >('module_id, is_enabled, app_modules(code, is_active)')
    .eq('organization_id', organizationId);

  if (moduleError) {
    return rejected('error', context, moduleError);
  }

  const activeModules = (orgModules ?? []).filter(
    (m) => m.is_enabled && m.app_modules?.is_active,
  );
  const moduleToGrant =
    activeModules.find((m) => m.app_modules?.code === 'cpm') ??
    activeModules[0];

  if (moduleToGrant) {
    const { data: existingGrant, error: grantLookupError } = await supabase
      .from('user_module_access')
      .select('id')
      .eq('user_id', user.id)
      .eq('module_id', moduleToGrant.module_id)
      .maybeSingle();

    if (grantLookupError) {
      return rejected('error', context, grantLookupError);
    }
    if (!existingGrant) {
      const { error: grantError } = await supabase
        .from('user_module_access')
        .insert({
          user_id: user.id,
          organization_id: organizationId,
          module_id: moduleToGrant.module_id,
          is_default: true,
        });
      if (grantError) {
        return rejected('error', context, grantError);
      }
    }
  }

  // organization_id is written last so a partial failure re-enters this
  // provisioner (organization_id still null) on the next sign-in.
  const { error: updateError } = await supabase
    .from('users')
    .update({
      organization_id: organizationId,
      signed_up: true,
      ...(name ? { name } : {}),
    })
    .eq('id', user.id);

  if (updateError) return rejected('error', context, updateError);

  return { status: 'provisioned', organizationId };
}
