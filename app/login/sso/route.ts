import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import logger from '@/utils/pino';

const SSO_UNAVAILABLE = 'Single sign-on is not enabled for your organization.';

/**
 * Sign-on URL for an IdP application tile.
 *
 * A true IdP-initiated assertion cannot be consumed: it arrives at Supabase
 * unsolicited, so there is no PKCE verifier for `/auth/callback` to exchange
 * the code with. Pointing the tile here instead turns the click into the
 * SP-initiated flow the app already supports — one invisible hop through the
 * IdP, which then answers with the session it already has.
 */
export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams
    .get('domain')
    ?.trim()
    .toLowerCase();
  const origin = request.nextUrl.origin;

  const loginRedirect = () => {
    const url = new URL('/login', origin);
    url.searchParams.set('message', SSO_UNAVAILABLE);
    return NextResponse.redirect(url);
  };

  if (!domain) {
    logger.warn(
      { action: 'ssoInit' },
      'SSO sign-on URL reached with no domain',
    );
    return loginRedirect();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithSSO({
    domain,
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data?.url) {
    logger.warn(
      { err: error, domain, action: 'ssoInit' },
      'SSO sign-on URL could not start a flow for the domain',
    );
    return loginRedirect();
  }

  return NextResponse.redirect(data.url);
}
