jest.mock('@supabase/ssr', () => ({ createServerClient: jest.fn() }));
jest.mock('@/data/users', () => ({ getAccountAccess: jest.fn() }));

import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getAccountAccess } from '@/data/users';
import { updateSession } from '@/utils/supabase/middleware';
import type { AccountAccessResult } from '@/constants/types';

const mockCreateServerClient = createServerClient as jest.Mock;
const mockGetAccountAccess = getAccountAccess as jest.Mock;

const mfa = {
  mfa_enabled: true,
  mfa_type: 'email',
  mfa_last_verified_at: null,
  email_mfa_session_verified_at: '2026-08-27T00:00:00.000Z',
  email_mfa_session_id: 's-current',
};

const okAccess: AccountAccessResult = {
  status: 'ok',
  metadata: {
    userRole: 11,
    appModules: [{ code: 'cpm', name: 'CPM', basePath: '/dashboard' }],
    defaultModule: { code: 'cpm', name: 'CPM', basePath: '/dashboard' },
    isTrial: false,
    cpmTrialEnabled: false,
    investorTrialEnabled: false,
    userProfile: { signed_up: true },
    mfa,
  },
};

function setup(access: AccountAccessResult) {
  mockCreateServerClient.mockReturnValue({
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
    },
  });
  mockGetAccountAccess.mockResolvedValue(access);
}

const request = () =>
  new NextRequest(new URL('/dashboard', 'https://app.postsig.com'));

beforeEach(() => jest.clearAllMocks());

describe('updateSession', () => {
  it('passes the MFA columns through on the metadata', async () => {
    setup(okAccess);

    const result = await updateSession(request());

    expect(result.userMetadata?.mfa).toEqual(mfa);
  });

  it('carries no metadata when the access lookup errors', async () => {
    setup({ status: 'error' });

    const result = await updateSession(request());

    expect(result.userMetadata).toBeNull();
  });
});
