import 'server-only';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { fetchClientMetadataDocument } from '@/app/lib/mcp/client-metadata';
import { canonicalResourceUrl } from '@/app/lib/mcp/oauth-metadata';

export interface InterstitialSummary {
  clientName: string;
  clientUriHost: string | null;
  logoUri: string | null;
  policyUri: string | null;
  tosUri: string | null;
  redirectUriHost: string | null;
  redirectUriDisplay: string | null;
  redirectIsLoopback: boolean;
  module: 'cpm' | 'investor' | null;
  expiresAt: string;
}

interface AuthorizationSummaryRow {
  client_id: string;
  redirect_uri: string;
  resource: string | null;
  status: string;
  expires_at: string;
}

function safeHostname(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function moduleFromResource(
  resource: string | null,
): 'cpm' | 'investor' | null {
  if (!resource) return null;
  if (resource === canonicalResourceUrl('cpm')) return 'cpm';
  if (resource === canonicalResourceUrl('investor')) return 'investor';
  return null;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function formatRedirectForDisplay(
  redirectUri: string,
  host: string | null,
): string | null {
  if (!host) return null;
  if (LOOPBACK_HOSTS.has(host)) {
    return redirectUri.length > 200
      ? `${redirectUri.slice(0, 200)}…`
      : redirectUri;
  }
  return host;
}

// Same null shape for not-found / expired / consumed to prevent enumeration
// of authorization_ids.
export async function getInterstitialSummary(
  authorizationId: string,
): Promise<InterstitialSummary | null> {
  if (!authorizationId || authorizationId.length > 128) return null;

  const supabase = createServiceClient();

  // Cloud PostgREST only serves schemas in db.schemas, so .schema('auth')
  // 404s in cloud. SECURITY DEFINER RPC sits in public to bypass that.
  const { data: rpcRows, error: rpcErr } = await supabase.rpc(
    'mcp_authorization_summary',
    { p_authorization_id: authorizationId },
  );

  if (rpcErr) {
    logger.info({ err: rpcErr }, 'mcp: interstitial auth lookup failed');
    return null;
  }

  const row = (rpcRows as AuthorizationSummaryRow[] | null)?.[0];
  if (!row) return null;

  if (row.status !== 'pending') return null;
  if (new Date(row.expires_at) < new Date()) return null;

  // Native-app clients (RFC 8252) can register custom URI schemes, which
  // safeHostname rejects. Pass null through rather than failing the whole
  // summary — the host is only a UI hint, not a security gate.
  const redirectHost = safeHostname(row.redirect_uri);

  // admin.oauth.getClient hits /auth/v1/admin (not PostgREST), so it isn't
  // subject to the schema gating above.
  const { data: client, error: clientErr } =
    await supabase.auth.admin.oauth.getClient(row.client_id);

  if (clientErr || !client) {
    if (clientErr) {
      logger.info({ err: clientErr }, 'mcp: interstitial client lookup failed');
    }
    return null;
  }

  // Cap label length so a hostile client can't poison the page with a
  // multi-KB string.
  const safeName =
    (client.client_name ?? '').slice(0, 80).trim() || 'Unknown application';
  const clientUri = client.client_uri ?? null;
  const logoUri = client.logo_uri ?? null;
  const logoHost = safeHostname(logoUri);
  // https-only — trust + avoids mixed content on the consent page.
  const registeredLogoUri =
    logoUri && logoHost && logoUri.startsWith('https://') ? logoUri : null;

  // CIMD wins when present: the client's self-hosted doc is more current
  // than whatever they handed us at registration. Typically null today.
  const enriched = await fetchClientMetadataDocument(clientUri);

  return {
    clientName: enriched?.clientName ?? safeName,
    clientUriHost: safeHostname(clientUri),
    logoUri: enriched?.logoUri ?? registeredLogoUri,
    policyUri: enriched?.policyUri ?? null,
    tosUri: enriched?.tosUri ?? null,
    redirectUriHost: redirectHost,
    redirectUriDisplay: formatRedirectForDisplay(
      row.redirect_uri,
      redirectHost,
    ),
    redirectIsLoopback: redirectHost ? LOOPBACK_HOSTS.has(redirectHost) : false,
    module: moduleFromResource(row.resource),
    expiresAt: row.expires_at,
  };
}
