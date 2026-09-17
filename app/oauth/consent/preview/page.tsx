import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { InterstitialSummary } from '@/app/lib/mcp/interstitial';
import {
  ConsentForm,
  ConsentShell,
  ExpiredCard,
  Interstitial,
  LoadErrorCard,
  MissingAuthIdCard,
} from '../_components';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Dev-only design playground for the /oauth/consent screens. Renders each
// variant with hardcoded data so we can iterate on UI without driving a real
// OAuth handshake. Returns 404 in production.

export const dynamic = 'force-dynamic';

const STATES = [
  'index',
  'interstitial',
  'interstitial_no_uri',
  'interstitial_localhost',
  'consent',
  'consent_denied',
  'consent_approve_failed',
  'consent_deny_failed',
  'consent_minimal',
  'consent_investor',
  'consent_cimd',
  'expired',
  'missing_auth_id',
  'load_error',
] as const;

type PreviewState = (typeof STATES)[number];

const SAMPLE_AUTHORIZATION_ID = 'sample-auth-id-1234567890';

const SAMPLE_INTERSTITIAL: InterstitialSummary = {
  clientName: 'Claude Desktop',
  clientUriHost: 'claude.ai',
  logoUri:
    'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://claude.ai&size=64',
  policyUri: null,
  tosUri: null,
  redirectUriHost: 'claude.ai',
  redirectUriDisplay: 'claude.ai',
  redirectIsLoopback: false,
  module: 'cpm',
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
};

const SAMPLE_INTERSTITIAL_NO_URI: InterstitialSummary = {
  ...SAMPLE_INTERSTITIAL,
  clientName: 'Unverified Connector',
  clientUriHost: null,
  logoUri: null,
  redirectUriHost: 'unknown-app.example.com',
  redirectUriDisplay: 'unknown-app.example.com',
};

const SAMPLE_INTERSTITIAL_LOCALHOST: InterstitialSummary = {
  ...SAMPLE_INTERSTITIAL,
  clientName: 'Claude Code',
  clientUriHost: null,
  logoUri: null,
  redirectUriHost: 'localhost',
  redirectUriDisplay: 'http://localhost:50423/callback',
  redirectIsLoopback: true,
};

const SAMPLE_CONSENT = {
  authorizationId: SAMPLE_AUTHORIZATION_ID,
  csrfToken: 'preview-csrf-token',
  clientName: 'Claude Desktop',
  clientUriHost: 'claude.ai',
  logoUri: null,
  userEmail: 'cindy@postsig.com',
  userName: 'Cindy Ho',
  module: 'cpm' as const,
  scope: 'openid email profile',
};

export default async function ConsentPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { state: rawState } = await searchParams;
  const state: PreviewState = (STATES as readonly string[]).includes(
    rawState ?? '',
  )
    ? (rawState as PreviewState)
    : 'index';

  switch (state) {
    case 'interstitial':
      return (
        <Interstitial
          authorizationId={SAMPLE_AUTHORIZATION_ID}
          summary={SAMPLE_INTERSTITIAL}
        />
      );
    case 'interstitial_no_uri':
      return (
        <Interstitial
          authorizationId={SAMPLE_AUTHORIZATION_ID}
          summary={SAMPLE_INTERSTITIAL_NO_URI}
        />
      );
    case 'interstitial_localhost':
      return (
        <Interstitial
          authorizationId={SAMPLE_AUTHORIZATION_ID}
          summary={SAMPLE_INTERSTITIAL_LOCALHOST}
        />
      );
    case 'consent':
      return <ConsentForm {...SAMPLE_CONSENT} errorParam={undefined} />;
    case 'consent_denied':
      return <ConsentForm {...SAMPLE_CONSENT} errorParam="denied" />;
    case 'consent_approve_failed':
      return <ConsentForm {...SAMPLE_CONSENT} errorParam="approve_failed" />;
    case 'consent_deny_failed':
      return <ConsentForm {...SAMPLE_CONSENT} errorParam="deny_failed" />;
    case 'consent_minimal':
      return (
        <ConsentForm
          {...SAMPLE_CONSENT}
          clientUriHost={null}
          scope="openid"
          errorParam={undefined}
        />
      );
    case 'consent_investor':
      return (
        <ConsentForm
          {...SAMPLE_CONSENT}
          module="investor"
          errorParam={undefined}
        />
      );
    case 'consent_cimd':
      // Simulates the data shape after fetchClientMetadataDocument enriches
      // the registration: logo + name overridden by the client's published
      // metadata doc, and policy/tos links surface in the footer.
      return (
        <ConsentForm
          {...SAMPLE_CONSENT}
          clientName="Claude Desktop"
          logoUri="https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://claude.ai&size=64"
          policyUri="https://www.anthropic.com/legal/privacy"
          tosUri="https://www.anthropic.com/legal/consumer-terms"
          errorParam={undefined}
        />
      );
    case 'expired':
      return <ExpiredCard />;
    case 'missing_auth_id':
      return <MissingAuthIdCard />;
    case 'load_error':
      return <LoadErrorCard />;
    case 'index':
    default:
      return <IndexCard />;
  }
}

function IndexCard() {
  const links: Array<{ state: PreviewState; label: string; hint?: string }> = [
    {
      state: 'interstitial',
      label: 'Pre-login interstitial',
      hint: 'with client URI',
    },
    {
      state: 'interstitial_no_uri',
      label: 'Pre-login interstitial — no client URI',
      hint: 'amber warning visible',
    },
    {
      state: 'interstitial_localhost',
      label: 'Pre-login interstitial — localhost CLI',
      hint: 'full redirect URL shown',
    },
    { state: 'consent', label: 'Consent form (clean)' },
    {
      state: 'consent_minimal',
      label: 'Consent form — openid only, no client URI',
    },
    { state: 'consent_investor', label: 'Consent form — investor module' },
    {
      state: 'consent_cimd',
      label: 'Consent form — CIMD-enriched',
      hint: 'logo + privacy/terms links from client metadata',
    },
    { state: 'consent_denied', label: 'Consent form — denied' },
    {
      state: 'consent_approve_failed',
      label: 'Consent form — approve_failed',
    },
    { state: 'consent_deny_failed', label: 'Consent form — deny_failed' },
    { state: 'expired', label: 'Expired / not-found card' },
    { state: 'missing_auth_id', label: 'Missing authorization_id card' },
    { state: 'load_error', label: 'Load error card' },
  ];

  return (
    <ConsentShell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg/tight">
            Consent screen preview
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Dev-only. Hardcoded mock data. Returns 404 in production.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {links.map(({ state, label, hint }) => (
              <li key={state}>
                <Link
                  className="font-medium text-primary hover:underline"
                  href={`/oauth/consent/preview?state=${state}`}
                >
                  {label}
                </Link>
                {hint && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({hint})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </ConsentShell>
  );
}
