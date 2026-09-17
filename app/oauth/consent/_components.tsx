import Image from 'next/image';
import Link from 'next/link';
import { Check } from 'lucide-react';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { InterstitialSummary } from '@/app/lib/mcp/interstitial';
import { synthesizeFaviconUrl } from '@/app/lib/mcp/favicon';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { SubmitButton } from './_submit-button';

export type ConsentErrorParam =
  | 'denied'
  | 'approve_failed'
  | 'deny_failed'
  | 'csrf_failed'
  | undefined;

type Module = 'cpm' | 'investor';

const MODULE_NAME: Record<Module, string> = {
  cpm: 'CPM',
  investor: 'Investor',
};

// Standard OIDC scopes mapped to plain-English share descriptions. Anything
// not in here renders as the raw scope string so unknown scopes are at least
// visible.
const IDENTITY_SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: 'A stable identifier for your PostSig account',
  email: 'Your email address',
  profile: 'Your name',
  phone: 'Your phone number',
};

const ERROR_MESSAGES: Record<Exclude<ConsentErrorParam, undefined>, string> = {
  denied: 'You denied the previous request.',
  approve_failed:
    "We couldn't complete the approval. The request may have expired — try connecting again from your MCP client.",
  deny_failed:
    "We couldn't record your denial. The request may have already expired.",
  csrf_failed:
    'Your session check expired. Review the request and choose again.',
};

function initials(value: string | null | undefined, max = 2): string {
  if (!value) return '?';
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, max)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function ConsentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center px-6 py-12">
      {children}
    </div>
  );
}

function PostSigMark() {
  return (
    <div className="flex items-center gap-2 border-b border-border/70 px-5 py-3">
      <Image
        src="/PS_Icon.svg"
        alt="PostSig"
        width={20}
        height={20}
        className="dark:invert"
        priority
      />
      <span className="font-medium pt-[1px] font-sans text-[0.85rem]">
        PostSig
      </span>
    </div>
  );
}

export function SimpleStatusCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <ConsentShell>
      <Card className="w-full max-w-md">
        <PostSigMark />
        <CardHeader>
          <CardTitle className="text-lg/tight">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{body}</p>
        </CardContent>
      </Card>
    </ConsentShell>
  );
}

export function MissingAuthIdCard() {
  return (
    <SimpleStatusCard
      title="Missing authorization request"
      body="Start the connection from your MCP client. This page can't be opened directly."
    />
  );
}

export function ExpiredCard() {
  return (
    <SimpleStatusCard
      title="Authorization request expired"
      body="This request is no longer valid. Start the connection again from your MCP client."
    />
  );
}

export function LoadErrorCard() {
  return (
    <SimpleStatusCard
      title="Couldn't load this request"
      body="We hit a snag loading the authorization details. It may have expired — try connecting again from your MCP client."
    />
  );
}

export function McpDisabledCard({ module }: { module: Module }) {
  return (
    <SimpleStatusCard
      title="MCP access isn't enabled"
      body={`MCP server access for the ${MODULE_NAME[module]} module isn't enabled for your organization yet. Contact PostSig support to enable it, then start the connection again from your MCP client.`}
    />
  );
}

function ClientIdentity({
  name,
  uriHost,
  faviconHost,
  logoUri,
}: {
  name: string;
  uriHost: string | null;
  // Favicon source — separate from uriHost so we can pull a logo through from
  // the OAuth-validated redirect host even when the client didn't formally
  // declare a client_uri (keeps "no website" warnings honest while still
  // giving brand recognition).
  faviconHost?: string | null;
  logoUri: string | null;
}) {
  const logoHost = faviconHost ?? uriHost;
  const effectiveLogo =
    logoUri ?? (logoHost ? synthesizeFaviconUrl(logoHost) : null);
  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-10 w-10 rounded-md border border-border">
        {effectiveLogo && (
          <AvatarImage src={effectiveLogo} alt="" className="object-contain" />
        )}
        <AvatarFallback className="font-medium rounded-md bg-muted font-sans text-sm">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="font-medium truncate text-sm">{name}</p>
        {uriHost && (
          <p className="truncate text-xs text-muted-foreground">{uriHost}</p>
        )}
      </div>
    </div>
  );
}

function UserIdentity({ email }: { email: string }) {
  return (
    <p className="truncate text-xs text-muted-foreground">
      Signed in as <span className="font-medium text-foreground">{email}</span>
    </p>
  );
}

function ScopeBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <Check
        aria-hidden
        className="mt-0.5 h-4 w-4 flex-shrink-0 text-foreground/70"
      />
      {/* `div` rather than `span` so block-level children like Badge nest
          legally (span > div would be invalid HTML). */}
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {children}
      </div>
    </li>
  );
}

function FinePrint({
  clientName,
  policyUri,
  tosUri,
}: {
  clientName: string;
  policyUri?: string | null;
  tosUri?: string | null;
}) {
  const hasLegal = Boolean(policyUri || tosUri);
  // No legal links to show → render nothing so CardContent's space-y-4 doesn't
  // reserve an empty slot below the inner panel.
  if (!hasLegal) return null;
  return (
    <div className="space-y-1 pr-6 text-xs text-muted-foreground">
      <p>
        By approving, you agree to {clientName}&apos;s{' '}
        {policyUri && (
          <a
            href={policyUri}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-foreground"
          >
            privacy policy
          </a>
        )}
        {policyUri && tosUri && ' and '}
        {tosUri && (
          <a
            href={tosUri}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-foreground"
          >
            terms of service
          </a>
        )}
        . You can revoke this connection any time in your PostSig settings.
      </p>
    </div>
  );
}

export interface ConsentFormProps {
  authorizationId: string;
  csrfToken: string;
  clientName: string;
  clientUriHost: string | null;
  logoUri: string | null;
  /** From client metadata document. URL to the application's privacy policy. */
  policyUri?: string | null;
  /** From client metadata document. URL to the application's terms of service. */
  tosUri?: string | null;
  userEmail: string;
  userName?: string | null;
  module: Module | null;
  scope: string;
  errorParam: ConsentErrorParam;
}

export function ConsentForm({
  authorizationId,
  csrfToken,
  clientName,
  clientUriHost,
  logoUri,
  policyUri,
  tosUri,
  userEmail,
  userName,
  module,
  scope,
  errorParam,
}: ConsentFormProps) {
  const identityScopes = scope
    .split(' ')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => IDENTITY_SCOPE_DESCRIPTIONS[s] ?? s);

  const errorMessage = errorParam ? ERROR_MESSAGES[errorParam] : null;

  return (
    <ConsentShell>
      <Card className="w-full max-w-md">
        <PostSigMark />
        <CardHeader>
          <CardTitle className="pb-1 text-lg/tight">
            Authorize {clientName} to access
            <br />
            your PostSig account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMessage && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
              {errorMessage}
            </p>
          )}
          <div className="overflow-hidden rounded-md border border-border/70">
            <div className="space-y-4 p-4">
              <ClientIdentity
                name={clientName}
                uriHost={clientUriHost}
                logoUri={logoUri}
              />
              <div className="space-y-4">
                {module && (
                  <div>
                    <p className="font-medium text-sm">
                      {clientName} will be able to
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      <ScopeBullet>
                        <span>
                          Read your{' '}
                          <span className="font-bold">
                            {MODULE_NAME[module]}
                          </span>{' '}
                          data
                        </span>{' '}
                        <Badge variant="outline" size="xs">
                          Read-only
                        </Badge>
                      </ScopeBullet>
                    </ul>
                  </div>
                )}
                {identityScopes.length > 0 && (
                  <div>
                    <p className="font-medium text-sm">
                      You&apos;ll share with {clientName}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {identityScopes.map((s) => (
                        <ScopeBullet key={s}>{s}</ScopeBullet>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-border/70 bg-muted/40 px-4 py-2">
              <UserIdentity email={userEmail} />
            </div>
          </div>
          <FinePrint
            clientName={clientName}
            policyUri={policyUri}
            tosUri={tosUri}
          />
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <form action="/api/oauth/decision" method="POST" className="w-full">
            <input
              type="hidden"
              name="authorization_id"
              value={authorizationId}
            />
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <SubmitButton
              name="decision"
              value="approve"
              className="w-full"
              size="lg"
              pendingLabel="Approving…"
            >
              Approve and connect
            </SubmitButton>
          </form>
          <form action="/api/oauth/decision" method="POST" className="w-full">
            <input
              type="hidden"
              name="authorization_id"
              value={authorizationId}
            />
            <input type="hidden" name="csrf_token" value={csrfToken} />
            <Button
              type="submit"
              name="decision"
              value="deny"
              variant="ghost"
              className="w-full"
            >
              Cancel
            </Button>
          </form>
        </CardFooter>
      </Card>
    </ConsentShell>
  );
}

export function Interstitial({
  authorizationId,
  summary,
}: {
  authorizationId: string;
  summary: InterstitialSummary;
}) {
  const loginHref = `/login?redirect=${encodeURIComponent(
    `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`,
  )}&message=${encodeURIComponent(
    `Sign in to authorize ${summary.clientName}.`,
  )}`;

  return (
    <ConsentShell>
      <Card className="w-full max-w-md">
        <PostSigMark />
        <CardHeader>
          <CardTitle className="pb-1 text-lg/tight">
            {summary.clientName} wants to connect to your
            <br />
            PostSig account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4 rounded-md border border-border/70 p-4">
            <ClientIdentity
              name={summary.clientName}
              uriHost={summary.clientUriHost}
              faviconHost={summary.clientUriHost ?? summary.redirectUriHost}
              logoUri={summary.logoUri}
            />
            <dl className="space-y-3 text-sm">
              {summary.module && (
                <div>
                  <dt className="font-medium text-xs text-muted-foreground">
                    Access requested
                  </dt>
                  <dd className="mt-0.5">
                    <span>
                      Read your{' '}
                      <span className="font-bold">
                        {MODULE_NAME[summary.module]}
                      </span>{' '}
                      data
                    </span>{' '}
                    <Badge variant="outline" size="xs">
                      Read-only
                    </Badge>
                  </dd>
                </div>
              )}
              {summary.redirectUriDisplay && (
                <div>
                  <dt className="font-medium text-xs text-muted-foreground">
                    Sign-in will redirect to
                  </dt>
                  <dd
                    className={
                      summary.redirectIsLoopback
                        ? 'mt-0.5 break-all font-mono text-xs'
                        : 'mt-0.5 break-all'
                    }
                  >
                    {summary.redirectUriDisplay}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          {!summary.clientUriHost && (
            <p className="rounded-md border border-amber-300/60 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              This application didn&apos;t provide a website. Only continue if
              you recognize where the sign-in will redirect.
            </p>
          )}
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button asChild className="w-full" size="lg">
            <Link href={loginHref}>Sign in to continue</Link>
          </Button>
        </CardFooter>
      </Card>
    </ConsentShell>
  );
}
