import { getSettingsBasePathForPath } from '@/lib/settings/config';

// PSK-1900: the investor settings pages re-export the CPM ones, so shared
// components render under both prefixes. Hardcoded `/settings/...` links sent
// IRI users into the CPM module and swapped their sidebar.
describe('getSettingsBasePathForPath', () => {
  test.each([
    '/investor',
    '/investor/settings',
    '/investor/settings/groups',
    '/investor/settings/groups/abc-123',
    '/investor/settings/organization/users/42',
  ])('returns the investor prefix for %s', (pathname) => {
    expect(getSettingsBasePathForPath(pathname)).toBe('/investor/settings');
  });

  test.each([
    '/',
    '/settings',
    '/settings/groups',
    '/settings/groups/abc-123',
    '/dashboard',
    '/contracts',
  ])('returns the CPM prefix for %s', (pathname) => {
    expect(getSettingsBasePathForPath(pathname)).toBe('/settings');
  });

  // `startsWith('/investor')` alone would misclassify a sibling route whose
  // name merely begins with "investor".
  test.each(['/investors', '/investor-relations', '/investorx/settings'])(
    'does not treat %s as the investor module',
    (pathname) => {
      expect(getSettingsBasePathForPath(pathname)).toBe('/settings');
    },
  );

  test('falls back to the CPM prefix for an empty pathname', () => {
    expect(getSettingsBasePathForPath('')).toBe('/settings');
  });
});
