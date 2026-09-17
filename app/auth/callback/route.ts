import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isSsoUser } from '@/app/lib/auth/sso-identity';
import { provisionSsoUser } from '@/app/lib/auth/sso-provisioning';
import { isValidInternalPath } from '@/lib/utils';
import logger from '@/utils/pino';
import { logAlert } from '@/utils/logging/alert';

const GENERIC_FAILURE = 'Sign-in failed. Please try again.';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const idpError = searchParams.get('error');
  const idpErrorDescription = searchParams.get('error_description');
  const next = searchParams.get('next') ?? '/';
  const origin = request.nextUrl.origin;

  const loginRedirect = (message: string) => {
    const url = new URL('/login', origin);
    url.searchParams.set('message', message);
    return NextResponse.redirect(url);
  };

  // Supabase redirects here with error/error_description when it rejects the
  // IdP's assertion — an unmapped email claim, an expired certificate, a bad
  // audience. Without this branch the only symptom is the generic message
  // below, and nothing records that an assertion was rejected at all.
  if (idpError) {
    logAlert(
      'sso-callback-failure',
      null,
      { action: 'ssoCallback', idpError, idpErrorDescription },
      'SSO assertion rejected before the code exchange',
    );
    return loginRedirect(GENERIC_FAILURE);
  }

  if (!code) {
    logAlert(
      'sso-callback-failure',
      null,
      { action: 'ssoCallback' },
      'SSO callback reached with neither a code nor an error',
    );
    return loginRedirect(GENERIC_FAILURE);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    logAlert(
      'sso-callback-failure',
      error,
      { action: 'ssoCallback' },
      'SSO code exchange failed',
    );
    return loginRedirect(GENERIC_FAILURE);
  }

  if (isSsoUser(data.user)) {
    const outcome = await provisionSsoUser(data.user);
    if (outcome.status === 'rejected') {
      await supabase.auth.signOut();
      return loginRedirect(
        'Your account is not set up yet. Please contact your administrator.',
      );
    }
    // First-login provisioning is rare and irreversible from the user's side;
    // one line per occurrence makes "did JIT provisioning run" answerable.
    if (outcome.status === 'provisioned') {
      logger.info(
        {
          userId: data.user.id,
          organizationId: outcome.organizationId,
          action: 'ssoProvisioned',
        },
        'Provisioned first-time SSO user',
      );
    }
  }

  const target = isValidInternalPath(next) ? next : '/';
  return NextResponse.redirect(new URL(target, origin));
}
