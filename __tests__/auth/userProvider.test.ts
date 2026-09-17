import { buildSignedOutRedirect } from '@/app/userProvider';

describe('buildSignedOutRedirect', () => {
  it('returns null for root', () => {
    expect(buildSignedOutRedirect('/')).toBeNull();
  });

  it.each([
    '/login',
    '/login?message=foo',
    '/logout',
    '/signup',
    '/signup/trial',
    '/invites/abc',
    '/password/reset',
    '/password/verify',
    '/password/update',
    '/mfa/enroll',
    '/mfa/verify',
  ])('returns null for public path %s', (path) => {
    expect(buildSignedOutRedirect(path)).toBeNull();
  });

  it('redirects authenticated paths to /login with the original path', () => {
    const result = buildSignedOutRedirect('/dashboard');
    expect(result).toContain('/login');
    expect(result).toContain('redirect=%2Fdashboard');
    expect(result).toContain('Your%20session%20has%20ended');
  });

  it('URL-encodes paths with query strings and hash safely', () => {
    const result = buildSignedOutRedirect('/cpm/upload?view=list&page=2#row-9');
    expect(result).toContain(
      'redirect=%2Fcpm%2Fupload%3Fview%3Dlist%26page%3D2%23row-9',
    );
  });

  it('returns null for root with query string and hash', () => {
    expect(buildSignedOutRedirect('/?next=/dashboard#top')).toBeNull();
  });

  it('does not redirect paths that merely contain a public segment but do not start with one', () => {
    // '/admin/login' starts with '/admin', not '/login' → user is on a
    // protected path and should be redirected
    expect(buildSignedOutRedirect('/admin/login')).not.toBeNull();
  });

  it('treats /loginfoo as a public-prefix match', () => {
    // Documents the chosen semantics: prefix-match without slash anchoring.
    // /loginfoo starts with /login so is considered public. If this is ever
    // a concern (no current route under /login matches), tighten the helper
    // to require either equality or a trailing '/' after the prefix.
    expect(buildSignedOutRedirect('/loginfoo')).toBeNull();
  });
});
