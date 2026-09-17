import { CommonError, MiddlewareAccessDenied } from '@/constants/types';
import { extractionRoles } from '@/constants/data';
import { cookies } from 'next/headers';

export const statusCodes = {
  notAuthorized: 401,
  noContent: 204,
  internalError: 500,
};

export const errors = {
  notAuthorized: (): CommonError => ({
    errorMessage: 'Not Authorized',
    statusCode: statusCodes.notAuthorized,
  }),
};

function getToByUserRole(userRole: number) {
  switch (true) {
    case extractionRoles.includes(userRole):
      return '/ext/contracts';
    default:
      return '/dashboard';
  }
}

export const accessDenied = async (
  userRole: number,
): Promise<MiddlewareAccessDenied[]> => {
  const cookieStore = await cookies();
  const hasResetSession = !!cookieStore.get('reset_session');
  return [
    {
      from: '/',
      exceptions: [
        '/login',
        '/signup',
        '/signup/trial',
        '/signup/terms',
        '/api/auth/signup',
        '/api/auth/confirm',
      ],
      to: '/login',
      authenticated: false,
    },
    {
      from: '/client',
      to: '/login',
      authenticated: false,
    },
    {
      from: '/api',
      to: '/login',
      authenticated: false,
    },
    {
      from: '/login',
      to: getToByUserRole(userRole),
      // Don't redirect if there's a reset session
      authenticated: true && !hasResetSession,
    },
    {
      from: '/password/reset',
      to: '/dashboard',
      // Don't redirect during reset session
      authenticated: true && !hasResetSession,
    },
  ];
};
