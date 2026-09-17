/**
 * Paths that do not require authentication.
 *
 * Middleware enforces these via exact match (so `/login` is public but
 * `/login/anything` is not). The client (userProvider) needs prefix-match
 * semantics for the "don't bounce a signed-out user away from these pages"
 * check, because pages like `/invites/<token>` or `/signup/trial` are also
 * legitimately accessible mid-auth-flow.
 *
 * Keep these two views in sync — diverging lists were a known bug source.
 */
export const PUBLIC_PATHS_EXACT: readonly string[] = [
  '/login',
  '/login/sso',
  '/logout',
  '/signup',
  '/invites',
  '/password/reset',
  '/password/verify',
  '/password/update',
  '/api/auth/confirm',
  '/api/auth/signup',
  '/api/auth/refresh-token',
  '/auth/callback',
  '/signup/token-expired',
  '/',
];

export const PUBLIC_API_PATH_PREFIXES: readonly string[] = ['/api/auth'];

/**
 * Prefixes a signed-out user is allowed to remain on after logout.
 * Broader than PUBLIC_PATHS_EXACT because deep paths under these roots
 * (`/invites/<token>`, `/signup/trial`, `/password/reset?...`) are valid
 * destinations during auth flows.
 */
export const PUBLIC_PATH_PREFIXES_FOR_REDIRECT: readonly string[] = [
  '/login',
  '/logout',
  '/signup',
  '/invites',
  '/password/reset',
  '/password/verify',
  '/password/update',
  '/mfa/enroll',
  '/mfa/verify',
];
