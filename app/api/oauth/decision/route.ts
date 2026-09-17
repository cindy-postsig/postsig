import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import logger from '@/utils/pino';

// Use 303 so the browser downgrades POST → GET when following the redirect.
// OAuth callback URLs only accept GET; the default 307 keeps the method as
// POST and the callback re-fires a second approve attempt.
const SEE_OTHER = 303;

function seeOther(url: string | URL): NextResponse {
  return NextResponse.redirect(url, SEE_OTHER);
}

// Constant-time string compare. Returns false on length mismatch instead of
// throwing, since the form value is attacker-controlled.
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const decision = formData.get('decision');
  const authorizationId = formData.get('authorization_id');
  const formCsrfToken = formData.get('csrf_token');

  if (typeof authorizationId !== 'string' || !authorizationId) {
    return NextResponse.json(
      { error: 'Missing authorization_id' },
      { status: 400 },
    );
  }

  // Double-submit cookie check. Middleware mints `oauth_csrf` on every
  // /oauth/consent render and we mirror the value into the form. A cross-site
  // POST won't carry the cookie (SameSite=Strict) or won't know the token.
  const cookieStore = await cookies();
  const cookieCsrfToken = cookieStore.get('oauth_csrf')?.value;
  if (
    typeof formCsrfToken !== 'string' ||
    !formCsrfToken ||
    !cookieCsrfToken ||
    !safeEqual(formCsrfToken, cookieCsrfToken)
  ) {
    logger.warn({ authorizationId }, 'oauth: csrf token mismatch on decision');
    // Legitimate users land here too — the 10-minute token expired or they
    // submitted the older of two tabs. Re-rendering consent mints a fresh
    // token (middleware), so a retry succeeds; a bare 403 would dead-end them.
    return seeOther(
      new URL(
        `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&error=csrf_failed`,
        request.url,
      ),
    );
  }
  // Single-use: drop the cookie once validated, regardless of outcome.
  cookieStore.delete('oauth_csrf');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Bounce back through login — preserves authorization_id so the consent
    // page can resume once the session cookie is set.
    const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    return seeOther(
      new URL(`/login?redirect=${encodeURIComponent(next)}`, request.url),
    );
  }

  if (decision === 'approve') {
    const { data, error } =
      await supabase.auth.oauth.approveAuthorization(authorizationId);
    if (error || !data) {
      logger.warn(
        { err: error, authorizationId, userId: user.id },
        'oauth: approve failed',
      );
      return seeOther(
        new URL(
          `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&error=approve_failed`,
          request.url,
        ),
      );
    }
    return seeOther(data.redirect_url);
  }

  const { data, error } =
    await supabase.auth.oauth.denyAuthorization(authorizationId);
  if (error || !data) {
    logger.warn(
      { err: error, authorizationId, userId: user.id },
      'oauth: deny failed',
    );
    return seeOther(
      new URL(
        `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&error=deny_failed`,
        request.url,
      ),
    );
  }
  return seeOther(data.redirect_url);
}
