import { filterVisibleOrgUsers, isPostsigUser } from '@/lib/utils/users';

const CUSTOMER = 'ada@acme.com';
const SHADOW = 'support@postsig.com';

describe('isPostsigUser', () => {
  it('matches the postsig domain case-insensitively', () => {
    expect(isPostsigUser(SHADOW)).toBe(true);
    expect(isPostsigUser('Support@PostSig.com')).toBe(true);
  });

  it('does not match customers or lookalike domains', () => {
    expect(isPostsigUser(CUSTOMER)).toBe(false);
    expect(isPostsigUser('ada@notpostsig.com')).toBe(false);
    expect(isPostsigUser('ada@postsig.com.evil.com')).toBe(false);
    expect(isPostsigUser(null)).toBe(false);
    expect(isPostsigUser(undefined)).toBe(false);
  });
});

describe('filterVisibleOrgUsers', () => {
  const users = [
    { id: '1', email: CUSTOMER },
    { id: '2', email: SHADOW },
    { id: '3', email: null },
  ];

  it('hides shadow users by default, so a new surface cannot leak them', () => {
    expect(filterVisibleOrgUsers(users)).toEqual([
      { id: '1', email: CUSTOMER },
      { id: '3', email: null },
    ]);
  });

  it('hides shadow users from a customer viewer', () => {
    expect(
      filterVisibleOrgUsers(users, { currentUserEmail: CUSTOMER }),
    ).toEqual([
      { id: '1', email: CUSTOMER },
      { id: '3', email: null },
    ]);
  });

  it('shows shadow users to a postsig viewer', () => {
    expect(filterVisibleOrgUsers(users, { currentUserEmail: SHADOW })).toEqual(
      users,
    );
  });

  it('shows shadow users when explicitly requested', () => {
    expect(
      filterVisibleOrgUsers(users, {
        currentUserEmail: CUSTOMER,
        includePostsigUsers: true,
      }),
    ).toEqual(users);
  });
});
