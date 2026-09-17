'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import {
  AuthenticationError,
  DatabaseError,
  NotFoundError,
} from '@/lib/errors';
import logger from '@/utils/pino';
import type { McpModule } from '@/app/lib/mcp/auth';
import { fetchClientMetadataDocument } from '@/app/lib/mcp/client-metadata';

const CONNECTIONS_PATHS = {
  cpm: '/settings/connections',
  investor: '/investor/settings/connections',
} as const satisfies Record<McpModule, string>;

const ACCOUNT_CONNECTED_APPS_PATH = '/account/connected-apps';

export interface ConnectedAppGrant {
  id: string;
  clientId: string;
  clientName: string;
  clientUri: string | null;
  clientUriHost: string | null;
  // Fallback identity for sparse clients (Claude Desktop registers only
  // client_name + redirect_uris, leaving client_uri null).
  redirectUriHost: string | null;
  logoUri: string | null;
  policyUri: string | null;
  tosUri: string | null;
  module: McpModule;
  moduleLabel: string;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
}

function safeHttpsUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeHostname(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.hostname ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

interface ClientDisplay {
  name: string;
  clientUri: string | null;
  clientUriHost: string | null;
  redirectUriHost: string | null;
  logoUri: string | null;
  policyUri: string | null;
  tosUri: string | null;
}

async function loadClientDisplay(
  service: ReturnType<typeof createServiceClient>,
  clientId: string,
): Promise<ClientDisplay | null> {
  const { data: client, error } =
    await service.auth.admin.oauth.getClient(clientId);
  if (error || !client) {
    if (error) {
      logger.warn(
        { err: error, clientId },
        'oauth-grants: client lookup failed; row will use fallback label',
      );
    }
    return null;
  }

  // Cap so a hostile client can't poison the page with a multi-KB string.
  const safeName =
    (client.client_name ?? '').slice(0, 80).trim() || 'Unknown application';
  const clientUri = client.client_uri ?? null;

  const registeredLogoUri = safeHttpsUrl(client.logo_uri);
  // CIMD overrides registration — the client's self-hosted doc stays current
  // after registration.
  const enriched = await fetchClientMetadataDocument(clientUri);

  // RFC 8252 native clients use custom URI schemes safeHostname rejects;
  // null is fine since the host is only a UI hint.
  const redirectUriHost = safeHostname(client.redirect_uris?.[0]);

  return {
    name: enriched?.clientName ?? safeName,
    clientUri,
    clientUriHost: safeHostname(clientUri),
    redirectUriHost,
    logoUri: enriched?.logoUri ?? registeredLogoUri,
    policyUri: enriched?.policyUri ?? null,
    tosUri: enriched?.tosUri ?? null,
  };
}

async function getCurrentUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new AuthenticationError('Not authenticated');
  }
  return user.id;
}

export async function listConnectedApps(
  module?: McpModule | McpModule[],
): Promise<ConnectedAppGrant[]> {
  const userId = await getCurrentUserId();
  // RLS revokes select for authenticated; this server action is the
  // user-facing gate, filtering by the verified session user_id.
  const service = createServiceClient();

  // Revoked rows stay in the DB so resolveOrCreateGrantScopes still rejects
  // their tokens — they're just hidden here. app_modules(name) rides along via
  // the FK so the UI doesn't need a second lookup for display labels.
  let query = service
    .from('mcp_oauth_grants')
    .select(
      'id, client_id, module, scopes, created_at, updated_at, app_modules(name)',
    )
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (typeof module === 'string') {
    query = query.eq('module', module);
  } else if (Array.isArray(module)) {
    // Empty array = caller has no modules to query — distinct from undefined
    // which means "all modules for this user."
    if (module.length === 0) return [];
    query = query.in('module', module);
  }

  const { data: grants, error: grantsErr } = await query;

  if (grantsErr) {
    logger.error({ err: grantsErr, userId }, 'oauth-grants: list failed');
    throw new DatabaseError(`Failed to list grants: ${grantsErr.message}`);
  }

  if (!grants || grants.length === 0) return [];

  // Dedupe so (cpm + investor) grants for the same client don't double the
  // admin API + CIMD calls.
  const uniqueClientIds = Array.from(new Set(grants.map((g) => g.client_id)));
  const clientCache = new Map<string, ClientDisplay | null>();

  await Promise.all(
    uniqueClientIds.map(async (clientId) => {
      const display = await loadClientDisplay(service, clientId);
      clientCache.set(clientId, display);
    }),
  );

  return grants.map((row) => {
    const client = clientCache.get(row.client_id) ?? null;
    // PostgREST returns the joined row as an object for many-to-one,
    // but the supabase-js types can widen to an array. Normalise.
    // Cast through unknown because generated DB types lag the FK migration.
    const joined = (row as unknown as { app_modules: unknown }).app_modules as
      | { name: string }
      | { name: string }[]
      | null;
    const moduleName = Array.isArray(joined) ? joined[0]?.name : joined?.name;
    return {
      id: row.id,
      clientId: row.client_id,
      clientName: client?.name ?? 'Unknown application',
      clientUri: client?.clientUri ?? null,
      clientUriHost: client?.clientUriHost ?? null,
      redirectUriHost: client?.redirectUriHost ?? null,
      logoUri: client?.logoUri ?? null,
      policyUri: client?.policyUri ?? null,
      tosUri: client?.tosUri ?? null,
      module: row.module as McpModule,
      moduleLabel: moduleName ?? row.module,
      scopes: row.scopes ?? [],
      connectedAt: row.created_at,
      lastUsedAt:
        row.updated_at && row.updated_at !== row.created_at
          ? row.updated_at
          : null,
    };
  });
}

export async function revokeOAuthGrant(grantId: string): Promise<void> {
  if (!grantId || typeof grantId !== 'string') {
    throw new Error('Grant id is required');
  }
  const userId = await getCurrentUserId();
  const service = createServiceClient();

  // user_id filter is the authorization check.
  const { data, error } = await service
    .from('mcp_oauth_grants')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', grantId)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error(
      { err: error, userId, grantId },
      'oauth-grants: revoke failed',
    );
    throw new DatabaseError(`Failed to revoke grant: ${error.message}`);
  }

  if (!data) {
    // Doesn't-exist / not-ours / already-revoked all collapse to the same
    // error so grant existence isn't leaked.
    throw new NotFoundError('Grant');
  }

  revalidatePath(ACCOUNT_CONNECTED_APPS_PATH);
  revalidatePath(CONNECTIONS_PATHS.cpm);
  revalidatePath(CONNECTIONS_PATHS.investor);
}
