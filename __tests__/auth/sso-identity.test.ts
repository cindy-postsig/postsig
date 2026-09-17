import type { User } from '@supabase/supabase-js';
import {
  isSsoUser,
  emailDomain,
  ssoDisplayName,
} from '@/app/lib/auth/sso-identity';

const withIdentities = (providers: string[]) =>
  ({
    identities: providers.map((provider) => ({ provider })),
  }) as unknown as Pick<User, 'identities'>;

describe('isSsoUser', () => {
  it('detects an sso: identity provider', () => {
    expect(isSsoUser(withIdentities(['sso:8a4f0e12-aaaa']))).toBe(true);
  });

  it('detects sso among mixed identities', () => {
    expect(isSsoUser(withIdentities(['email', 'sso:abc']))).toBe(true);
  });

  it('rejects non-sso providers', () => {
    expect(isSsoUser(withIdentities(['email']))).toBe(false);
    expect(isSsoUser(withIdentities(['google']))).toBe(false);
  });

  it('rejects empty or missing identities', () => {
    expect(isSsoUser(withIdentities([]))).toBe(false);
    expect(isSsoUser({} as Pick<User, 'identities'>)).toBe(false);
    expect(isSsoUser(null)).toBe(false);
    expect(isSsoUser(undefined)).toBe(false);
  });
});

describe('emailDomain', () => {
  it('extracts and lowercases the domain', () => {
    expect(emailDomain('User@Company.COM')).toBe('company.com');
    expect(emailDomain('a@sub.domain.co')).toBe('sub.domain.co');
  });

  it('uses the last @ for addresses with quoted @ signs', () => {
    expect(emailDomain('a@b@corp.io')).toBe('corp.io');
  });

  it('returns null for invalid or missing input', () => {
    expect(emailDomain('nodomain')).toBeNull();
    expect(emailDomain('@corp.io')).toBeNull();
    expect(emailDomain('user@')).toBeNull();
    expect(emailDomain('')).toBeNull();
    expect(emailDomain(null)).toBeNull();
    expect(emailDomain(undefined)).toBeNull();
  });
});

describe('ssoDisplayName', () => {
  const userWith = (
    user_metadata: Record<string, unknown>,
    email: string | undefined = 'kimberly.wolfe@ctinnovations.com',
  ) =>
    ({ email, user_metadata }) as unknown as Pick<
      User,
      'email' | 'user_metadata'
    >;

  it('prefers a full-name claim over given and family names', () => {
    expect(
      ssoDisplayName(userWith({ name: 'Kimberly Wolfe', given_name: 'Kim' })),
    ).toBe('Kimberly Wolfe');
  });

  it('reads mapped claims nested under custom_claims', () => {
    expect(
      ssoDisplayName(
        userWith({ custom_claims: { display_name: 'Kimberly Wolfe' } }),
      ),
    ).toBe('Kimberly Wolfe');
  });

  it('matches claim keys regardless of casing or separators', () => {
    expect(
      ssoDisplayName(
        userWith({ custom_claims: { displayName: 'Kimberly Wolfe' } }),
      ),
    ).toBe('Kimberly Wolfe');
    expect(
      ssoDisplayName(
        userWith({
          custom_claims: { givenName: 'Kimberly', Surname: 'Wolfe' },
        }),
      ),
    ).toBe('Kimberly Wolfe');
  });

  it('joins given and family names when no full name is mapped', () => {
    expect(
      ssoDisplayName(
        userWith({ given_name: 'Kimberly', family_name: 'Wolfe' }),
      ),
    ).toBe('Kimberly Wolfe');
  });

  it('uses whichever of given or family name is present', () => {
    expect(
      ssoDisplayName(userWith({ custom_claims: { first_name: 'Kimberly' } })),
    ).toBe('Kimberly');
    expect(
      ssoDisplayName(userWith({ custom_claims: { last_name: 'Wolfe' } })),
    ).toBe('Wolfe');
  });

  it("skips Entra's UPN-valued name claim in favour of the next source", () => {
    expect(
      ssoDisplayName(
        userWith({
          name: 'kwolfe@ctinnovations.com',
          given_name: 'Kimberly',
          family_name: 'Wolfe',
        }),
      ),
    ).toBe('Kimberly Wolfe');
  });

  it('ignores blank and non-string claims', () => {
    expect(
      ssoDisplayName(
        userWith(
          { name: '  ', full_name: '', given_name: 42, custom_claims: null },
          'kim@ctinnovations.com',
        ),
      ),
    ).toBe('Kim');
  });

  it('falls back to a title-cased email local part', () => {
    expect(ssoDisplayName(userWith({}, 'cindy.ho@postsig.com'))).toBe(
      'Cindy Ho',
    );
    expect(ssoDisplayName(userWith({}, 'cindy@postsig.com'))).toBe('Cindy');
    expect(ssoDisplayName(userWith({}, 'Mary_Ann-SMITH@corp.io'))).toBe(
      'Mary Ann Smith',
    );
  });

  it('drops a plus-address tag from the email fallback', () => {
    expect(ssoDisplayName(userWith({}, 'laura+arch@postsig.com'))).toBe(
      'Laura',
    );
  });

  it('returns null with neither name claims nor a usable email', () => {
    expect(
      ssoDisplayName({ user_metadata: {} } as Pick<
        User,
        'email' | 'user_metadata'
      >),
    ).toBeNull();
    expect(ssoDisplayName(userWith({}, '@corp.io'))).toBeNull();
    expect(ssoDisplayName(userWith({}, '...@corp.io'))).toBeNull();
  });
});
