// Every response or redirect MUST go through addCSPHeaders. The nonce-based
// CSP is what blocks XSS, and any path that skips it leaves the page
// unprotected.

import { updateSession } from '@/utils/supabase/middleware';
import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { accessDenied } from '@/constants/system';
import { APP_MODULE_CODES } from '@/constants/data';
import { PasswordResetState } from '@/constants/types';
import { cookies } from 'next/headers';
import { userRoles } from '@/constants/data';
import { checkMFATrustStatus } from './app/lib/auth/mfa-actions';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { isValidInternalPath } from '@/lib/utils';
import { generateCSPHeader } from '@/utils/middleware';
import { PUBLIC_PATHS_EXACT, PUBLIC_API_PATH_PREFIXES } from '@/constants/auth';
import {
  MCP_REWRITE_MAP,
  MCP_ROOT_RESPONSE,
  isMcpHost,
} from '@/app/lib/mcp/host-gate';

async function getResetState(): Promise<PasswordResetState | null> {
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get('password_reset_state');
  if (!stateCookie) return null;

  try {
    const state = JSON.parse(stateCookie.value) as PasswordResetState;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (state.recoveryTimestamp < oneHourAgo) {
      cookieStore.delete('password_reset_state');
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

// CPM lives at root and acts as the fallback; everything else needs a prefix.
const MODULE_ROUTE_PREFIXES: Array<{ prefix: string; module: string }> = [
  { prefix: '/investor', module: 'investor' },
];

function getRequiredModule(path: string): string {
  for (const { prefix, module } of MODULE_ROUTE_PREFIXES) {
    if (path.startsWith(prefix)) {
      return module;
    }
  }
  return 'cpm';
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Runs before auth/CSP — MCP responses are JSON, don't need a session,
  // and shouldn't trigger app-side redirects on a host that has no UI.
  if (isMcpHost(request.headers.get('host'))) {
    if (path === '/') {
      return NextResponse.json(MCP_ROOT_RESPONSE);
    }
    const destination = MCP_REWRITE_MAP[path];
    if (destination) {
      return NextResponse.rewrite(new URL(destination, request.url));
    }
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (/^\/api\/(?:[^/]+\/)?mcp\/?$/.test(path)) {
    return NextResponse.next();
  }

  // RFC 9728 protected-resource metadata and any other /.well-known/ documents
  // must be reachable without credentials — MCP clients fetch them before they
  // have a token.
  if (path.startsWith('/.well-known/')) {
    return NextResponse.next();
  }

  const resetState = await getResetState();

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const cspHeader = generateCSPHeader(nonce, path);

  const addCSPHeaders = (response: NextResponse): NextResponse => {
    response.headers.set('x-nonce', nonce);
    response.headers.set('Content-Security-Policy', cspHeader);
    return response;
  };

  // OAuth consent page renders a pre-login interstitial showing what the
  // requesting app wants access to. The page itself handles the redirect to
  // /login once the user clicks Sign In. /oauth/consent/preview is the
  // dev-only design playground and gates itself on NODE_ENV. We still apply
  // CSP because the page returns HTML.
  if (path === '/oauth/consent' || path.startsWith('/oauth/consent/')) {
    // Mint a CSRF token on every consent render and mirror it onto the
    // request cookies so the server component reads the same value we set
    // on the response. /api/oauth/decision validates form value == cookie
    // (double-submit) and clears the cookie. SameSite=Lax on Supabase's
    // session cookie already blocks cross-site POSTs in modern browsers;
    // this is OAuth 2.1 §4.1 defense-in-depth on top of that.
    const csrfToken = crypto.randomUUID();
    request.cookies.set('oauth_csrf', csrfToken);
    const response = addCSPHeaders(NextResponse.next({ request }));
    response.cookies.set('oauth_csrf', csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 600,
    });
    return response;
  }

  const createLoginRedirect = (
    message: string,
    includePath: boolean = true,
  ) => {
    const params = new URLSearchParams();
    params.append('message', message);
    params.append('rid', Date.now().toString());

    if (
      includePath &&
      path !== '/login' &&
      path !== '/signup' &&
      path !== '/password/reset' &&
      !path.startsWith('/api/') &&
      path !== '/'
    ) {
      params.append('redirect', path);
    }

    return new URL(`/login?${params.toString()}`, request.url);
  };

  if (request.nextUrl.pathname.startsWith('/password/update')) {
    if (!resetState || resetState.completed) {
      const supabase = await createClient();
      await supabase.auth.signOut();
      return addCSPHeaders(
        NextResponse.redirect(
          new URL(
            '/password/reset?error=Password reset session expired. Please request a new verification code.',
            request.url,
          ),
        ),
      );
    }
  } else if (resetState && !resetState.completed) {
    return addCSPHeaders(
      NextResponse.redirect(new URL('/password/update', request.url)),
    );
  }

  if (request.nextUrl.pathname.startsWith('/api/inngest')) {
    return addCSPHeaders(NextResponse.next());
  }

  // Auth handled by Hono middleware on this route, not here.
  if (request.nextUrl.pathname === '/api/v2/investor/extraction-fields') {
    return addCSPHeaders(NextResponse.next());
  }

  // Shared with userProvider so both layers see the same list. See constants/auth.ts.
  const PUBLIC_PATHS = PUBLIC_PATHS_EXACT;
  const PUBLIC_API_PATHS = PUBLIC_API_PATH_PREFIXES;

  const { response, user, access, userMetadata, authenticated } =
    await updateSession(request);

  // devmode gates feature flags and is restricted to PostSig employees.
  const devmodeParam = request.nextUrl.searchParams.get('devmode');
  if (devmodeParam !== null) {
    const isPostsigUser =
      authenticated && user?.email?.endsWith('@postsig.com');

    if (isPostsigUser) {
      const cleanUrl = new URL(request.url);
      cleanUrl.searchParams.delete('devmode');
      const redirectResponse = NextResponse.redirect(cleanUrl);

      if (devmodeParam === 'true') {
        redirectResponse.cookies.set('devmode', 'true', {
          maxAge: 60 * 60 * 24,
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.ENV !== 'local',
          path: '/',
        });
      } else if (devmodeParam === 'false') {
        redirectResponse.cookies.delete('devmode');
      }

      return addCSPHeaders(redirectResponse);
    } else {
      if (process.env.ENV === 'local') {
        const logData = sanitizeForLogging({
          userEmail: user?.email || 'unauthenticated',
          ip:
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            request.headers.get('x-real-ip') ||
            'unknown',
        });
        logger.warn(logData, '[Security] Unauthorized devmode attempt');
      }

      const cleanUrl = new URL(request.url);
      cleanUrl.searchParams.delete('devmode');
      return addCSPHeaders(NextResponse.redirect(cleanUrl));
    }
  }

  if (authenticated && user) {
    // Fails closed on a user deactivated in the admin app (module grants
    // revoked, or no usable role) and on a deactivated org. Must run before
    // MFA routing, otherwise the account gets an MFA prompt on its way to an
    // app it is not allowed into. `error` is an infrastructure failure, not a
    // decision — treating it as a denial would sign every user out over a
    // transient database blip, so it falls through to the gates below, which
    // already tolerate absent metadata.
    if (access?.status === 'denied') {
      logger.info(
        {
          userId: user.id,
          path,
          reason: access.reason,
          action: 'accessDenied',
        },
        'Signing out session that is no longer permitted',
      );
      const supabase = await createClient();
      await supabase.auth.signOut();
      return addCSPHeaders(
        NextResponse.redirect(
          createLoginRedirect('User has no privileges for access', false),
        ),
      );
    }

    // Runs before MFA routing so no-module accounts can't reach /mfa either.
    if (
      !path.startsWith('/api/') &&
      userMetadata?.appModules &&
      !userMetadata.appModules.some((m) => APP_MODULE_CODES.includes(m.code))
    ) {
      const supabase = await createClient();
      await supabase.auth.signOut();
      return addCSPHeaders(
        NextResponse.redirect(
          createLoginRedirect('User has no privileges for access', false),
        ),
      );
    }

    const mfaTrustStatus = await checkMFATrustStatus({
      user,
      mfa: userMetadata?.mfa,
    });
    const { needsMFAEnroll, needsVerification, trustFailureReason } =
      mfaTrustStatus;

    const mfaExemptPaths = [
      '/logout',
      '/api/auth',
      '/password/update',
      '/password/reset',
      '/password/verify',
      '/invites',
      '/login',
      '/signup',
      '/mfa/enroll',
      '/mfa/verify',
    ];

    const isExemptPath = mfaExemptPaths.some((exemptPath) =>
      path.startsWith(exemptPath),
    );

    const isPublic =
      PUBLIC_PATHS.includes(path) ||
      PUBLIC_API_PATHS.some((p) => path.startsWith(p));

    const requiresMFAAction =
      (needsMFAEnroll || needsVerification) && !isExemptPath && !isPublic;
    const isApiRoute = path.startsWith('/api/');

    if (requiresMFAAction && isApiRoute) {
      const msg = needsMFAEnroll
        ? 'MFA enrollment required'
        : 'MFA verification required';
      return addCSPHeaders(NextResponse.json({ error: msg }, { status: 401 }));
    }

    if (needsMFAEnroll && requiresMFAAction) {
      return addCSPHeaders(
        NextResponse.redirect(new URL('/mfa/enroll', request.url)),
      );
    }

    if (needsVerification && requiresMFAAction) {
      // Logged only at the redirect, not on every request, so one line maps to
      // one user-visible re-prompt. `no_cookie` on a user who has trusted a
      // device means the trust cookie never came back.
      logger.info(
        {
          userId: user.id,
          path,
          trustFailureReason: trustFailureReason ?? 'unknown',
          action: 'mfaReverificationRequired',
        },
        'Redirecting to MFA verification',
      );

      const verifyUrl = new URL('/mfa/verify', request.url);
      if (path !== '/') {
        verifyUrl.searchParams.set(
          'redirect',
          `${path}${request.nextUrl.search}`,
        );
      }
      return addCSPHeaders(NextResponse.redirect(verifyUrl));
    }
  }

  const signedUp = user && userMetadata?.userProfile?.signed_up;
  const isTrial = user && userMetadata?.isTrial;

  if (path.startsWith('/invites/')) {
    return addCSPHeaders(response);
  }

  const isPublicPath =
    PUBLIC_PATHS.some((p) => path === p) ||
    PUBLIC_API_PATHS.some((p) => path.startsWith(p));

  if (isPublicPath) {
    return addCSPHeaders(response);
  }

  if (!authenticated) {
    return addCSPHeaders(
      NextResponse.redirect(createLoginRedirect('Please log in to continue')),
    );
  }

  if (signedUp === false && !user?.email?.endsWith('@postsig.com')) {
    if (
      path === '/signup' ||
      path === '/signup/terms' ||
      path === '/signup/trial' ||
      path === '/api/auth/signup' ||
      path === '/welcome' ||
      path === '/api/auth/confirm' ||
      path === '/mfa/enroll' ||
      path === '/mfa/verify'
    ) {
      return addCSPHeaders(response);
    } else if (path !== '/login' && path !== '/') {
      if (process.env.ENV !== 'local') {
        const supabase = await createClient();
        await supabase.auth.signOut();
        return addCSPHeaders(
          NextResponse.redirect(
            new URL(
              `/login?message=User has not completed sign up&rid=${Date.now().toString()}`,
              request.url,
            ),
          ),
        );
      }
    }
  } else if (signedUp === true && !user?.email?.endsWith('@postsig.com')) {
    if (
      path === '/signup' ||
      path === '/signup/token-expired' ||
      path === '/signup/trial'
    ) {
      return addCSPHeaders(
        NextResponse.redirect(new URL('/dashboard', request.url)),
      );
    }
  }

  if (isTrial === true) {
    if (path === '/upload') {
      return addCSPHeaders(
        NextResponse.redirect(new URL('/dashboard', request.url)),
      );
    }
  }

  const SHARED_PATHS = ['/settings', '/account', '/welcome', '/terms', '/mfa'];
  const isSharedPath = SHARED_PATHS.some((sp) => path.startsWith(sp));

  // The role check that used to live here now runs in the access gate above,
  // which fails closed regardless of sign-up state.
  if (authenticated && signedUp) {
    if (
      !isSharedPath &&
      !path.startsWith('/api/') &&
      userMetadata?.appModules
    ) {
      const requiredModule = getRequiredModule(path);
      const hasModuleAccess = userMetadata.appModules.some(
        (m) => m.code === requiredModule,
      );

      if (!hasModuleAccess) {
        let defaultPath = userMetadata.defaultModule?.basePath || '/dashboard';
        // Dashboard overview is hidden; bypass it
        if (defaultPath === '/investor') {
          defaultPath = userMetadata.investorTrialEnabled
            ? '/investor/documents'
            : '/investor/portfolio';
        }
        return addCSPHeaders(
          NextResponse.redirect(new URL(defaultPath, request.url)),
        );
      }
    }
  }

  const denied = (await accessDenied(userMetadata?.userRole as number)).filter(
    (deny) => {
      if (!path.startsWith(deny.from)) return;
      if (authenticated !== deny?.authenticated) return;
      if (deny.exceptions && deny.exceptions.includes(path)) return;
      return deny;
    },
  )[0];

  if (denied) {
    // Defense-in-depth: validate redirect path even though accessDenied returns hardcoded paths
    if (!isValidInternalPath(denied.to)) {
      logger.error(
        { path: denied.to },
        'Invalid redirect path in accessDenied',
      );
      return addCSPHeaders(
        NextResponse.redirect(new URL('/dashboard', request.url)),
      );
    }
    return addCSPHeaders(
      NextResponse.redirect(new URL(denied.to, request.url)),
    );
  }

  // // Maintenance mode check at the end
  // try {
  //   const isInMaintenanceMode = await get<boolean>('isInMaintenanceMode');
  //   if (isInMaintenanceMode) {
  //     if (user && !user.email?.endsWith('@postsig.com')) {
  //       request.nextUrl.pathname = `/maintenance`;
  //       return addCSPHeaders(NextResponse.rewrite(request.nextUrl));
  //     }
  //     return addCSPHeaders(NextResponse.redirect(
  //       new URL(
  //         "/login?message=We're currently performing scheduled maintenance.",
  //         request.url,
  //       ),
  //     ));
  //   }
  // } catch (error) {}

  return addCSPHeaders(response);
}

// `pdfjs/` holds the vendored pdf.js worker, CMap, font, wasm and ICC assets
// (see scripts/copy-pdfjs-assets.mjs). They must be excluded here: the module
// gate below maps every non-`/investor` path to the `cpm` module, so an
// investor-only user requesting the worker got redirected to an HTML page and
// pdf.js failed on both the real worker and its fake-worker fallback.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|fonts/|pdfjs/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
