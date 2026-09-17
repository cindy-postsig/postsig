import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import logger from '@/utils/pino';
import { checkMFATrustStatus } from '@/app/lib/auth/mfa-actions';
import { getInterstitialSummary } from '@/app/lib/mcp/interstitial';
import { loadUserMetadataById } from '@/app/lib/mcp/auth';
import {
  ConsentForm,
  ExpiredCard,
  Interstitial,
  LoadErrorCard,
  McpDisabledCard,
  MissingAuthIdCard,
  type ConsentErrorParam,
} from './_components';

export const dynamic = 'force-dynamic';

interface ConsentSearchParams {
  authorization_id?: string;
  error?: string;
}

const KNOWN_ERROR_PARAMS = new Set<string>([
  'denied',
  'approve_failed',
  'deny_failed',
  'csrf_failed',
]);

function asConsentError(value: string | undefined): ConsentErrorParam {
  return value && KNOWN_ERROR_PARAMS.has(value)
    ? (value as ConsentErrorParam)
    : undefined;
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

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<ConsentSearchParams>;
}) {
  const { authorization_id: authorizationId, error: errParam } =
    await searchParams;

  if (!authorizationId) {
    return <MissingAuthIdCard />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const summary = await getInterstitialSummary(authorizationId);
    if (!summary) return <ExpiredCard />;
    return <Interstitial authorizationId={authorizationId} summary={summary} />;
  }

  // Middleware exempts /oauth/consent from the MFA gate so the pre-login
  // interstitial can render, so we re-check here for AAL1 sessions.
  const mfaTrust = await checkMFATrustStatus();
  if (mfaTrust.needsMFAEnroll) {
    redirect('/mfa/enroll');
  }
  if (mfaTrust.needsVerification) {
    const returnTo = `/oauth/consent?authorization_id=${encodeURIComponent(
      authorizationId,
    )}`;
    redirect(`/mfa/verify?redirect=${encodeURIComponent(returnTo)}`);
  }

  // Need both: getAuthorizationDetails drives the consent UI, summary carries
  // the `resource`-derived module label that isn't in the public SDK response.
  // Viewer metadata carries the org's per-module mcp_enabled flags.
  const [authResult, summary, viewerMetadata] = await Promise.all([
    supabase.auth.oauth.getAuthorizationDetails(authorizationId),
    getInterstitialSummary(authorizationId),
    loadUserMetadataById(user.id),
  ]);

  if (authResult.error) {
    // Match the pre-login neutral response when our own lookup also misses,
    // so pre- and post-login enumeration signals stay indistinguishable.
    if (!summary) return <ExpiredCard />;
    logger.warn(
      { err: authResult.error, authorizationId },
      'oauth: consent lookup failed',
    );
    return <LoadErrorCard />;
  }

  const details = authResult.data;

  // Approving (or fast-forwarding an existing grant) for an org without MCP
  // enabled just moves the failure to the MCP endpoint, where the client
  // shows a generic auth error. Say it plainly here instead. Only blocks on
  // a positive disabled signal — a metadata load failure falls through to
  // the normal flow rather than guessing.
  const requestedModule = summary?.module ?? null;
  if (requestedModule && viewerMetadata) {
    const mcpEnabled =
      requestedModule === 'cpm'
        ? viewerMetadata.cpmMcpEnabled
        : viewerMetadata.investorMcpEnabled;
    if (!mcpEnabled) {
      logger.warn(
        {
          authorizationId,
          module: requestedModule,
          orgId: viewerMetadata.organizationId,
        },
        'oauth: consent blocked — org does not have MCP enabled for module',
      );
      return <McpDisabledCard module={requestedModule} />;
    }
  }

  // Supabase signals "already granted" by echoing a redirect_url; forward
  // the browser instead of re-prompting.
  if (details.redirect_url) {
    redirect(details.redirect_url);
  }

  const client = details.client;

  // Middleware mints `oauth_csrf` on every /oauth/consent render and mirrors
  // it onto the request cookies. If we don't see it, fail loud — rendering a
  // form without a token would bypass /api/oauth/decision validation.
  const csrfToken = (await cookies()).get('oauth_csrf')?.value;
  if (!csrfToken) {
    logger.error({ authorizationId }, 'oauth: csrf cookie missing on consent');
    return <LoadErrorCard />;
  }

  // Sparse registrations (Claude Desktop sends only client_name + redirect_uris)
  // leave client_uri null; redirectUriHost is the last-resort favicon source.
  return (
    <ConsentForm
      authorizationId={authorizationId}
      csrfToken={csrfToken}
      clientName={summary?.clientName ?? client?.name ?? 'this application'}
      clientUriHost={
        summary?.clientUriHost ??
        safeHostname(client?.uri) ??
        summary?.redirectUriHost ??
        null
      }
      logoUri={summary?.logoUri ?? client?.logo_uri ?? null}
      policyUri={summary?.policyUri ?? null}
      tosUri={summary?.tosUri ?? null}
      userEmail={user.email ?? ''}
      userName={(user.user_metadata as { name?: string } | null)?.name ?? null}
      module={summary?.module ?? null}
      scope={details.scope ?? ''}
      errorParam={asConsentError(errParam)}
    />
  );
}
