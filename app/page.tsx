import { redirect } from 'next/navigation';
import { getUserMetadata, getUser } from '@/data/users';
import { extractionRoles } from '@/constants/data';
import { internalTesters } from './lib/constants';
import { cookies } from 'next/headers';
import { updateTrustedDevice } from '@/app/lib/auth/trusted-device-actions';
import { hasActiveContracts } from '@/lib/v2/contracts/service';
import logger from '@/utils/pino';
import { TRUSTED_DEVICE_COOKIE_NAME } from '@/constants/security';

const defaultUrl = process.env.APP_URL
  ? `https://${process.env.APP_URL}`
  : 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: 'PostSig',
  description: 'Intelligent contract management.',
};

export default async function Login({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ message: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const [user, userMetadata] = await Promise.all([
    getUser(),
    getUserMetadata(),
  ]);

  if (!user) {
    redirect('/login');
  }
  const cookieStore = await cookies();
  const rawDeviceToken = cookieStore.get(TRUSTED_DEVICE_COOKIE_NAME)?.value;
  if (rawDeviceToken) {
    await updateTrustedDevice(
      user.id,
      rawDeviceToken,
      { last_used_at: new Date().toISOString() },
      userMetadata?.organizationId,
    );
  }

  let defaultPath = userMetadata?.defaultModule?.basePath || '/dashboard';
  // This page serves '/', so redirecting to '/' would loop (PSK-1862).
  if (defaultPath === '/') {
    defaultPath = '/dashboard';
  }

  if (
    userMetadata?.investorTrialEnabled &&
    defaultPath.startsWith('/investor')
  ) {
    defaultPath = '/investor/documents';
  }

  if (defaultPath === '/dashboard') {
    try {
      if (!(await hasActiveContracts())) {
        defaultPath = '/upload';
      }
    } catch (error) {
      logger.error({ error }, 'Failed to check contracts for login redirect');
    }
  }

  return redirect(defaultPath);
}
