'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getMFAStatus } from '@/app/lib/auth/mfa-actions';
import { signOut } from '@/app/lib/auth/actions';
import { createClient } from '@/utils/supabase/client';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import DynamicMFAChallenge from '@/components/auth/DynamicMFAChallenge';
import { isValidInternalPath } from '@/lib/utils';

type MfaType = 'totp' | 'email';

export default function MFAVerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectParam = searchParams.get('redirect');
  const safeRedirect = isValidInternalPath(redirectParam ?? '')
    ? redirectParam!
    : '/';

  const [checkingStatus, setCheckingStatus] = useState(true);
  const [mfaType, setMfaType] = useState<MfaType>('totp');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        const supabase = createClient();
        const [userResult, status] = await Promise.all([
          supabase.auth.getUser(),
          getMFAStatus(),
        ]);

        const user = userResult.data.user;
        if (!user) {
          router.push('/login');
          return;
        }

        if (!status.enabled) {
          router.push(safeRedirect);
          return;
        }

        setUserEmail(user.email || '');
        setMfaType(status.mfaType === 'email' ? 'email' : 'totp');
        setCheckingStatus(false);
      } catch (error) {
        logger.error(
          { error: sanitizeForLogging(error), action: 'mfaVerify.init' },
          'Failed to initialize MFA verify page',
        );
        // Fail closed — don't render the verify form against an unconfirmed
        // session.
        router.push('/login');
      }
    };

    init();
  }, [router, safeRedirect]);

  const handleSuccess = useCallback(() => {
    window.location.href = safeRedirect;
  }, [safeRedirect]);

  if (checkingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900" />
          <p className="mt-4 text-sm text-muted-foreground">
            Checking MFA status...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-8 py-12">
      <div className="w-full max-w-xl">
        <DynamicMFAChallenge
          mfaType={mfaType}
          userEmail={userEmail}
          onSuccess={handleSuccess}
          variant="card"
          footer={
            <form action={signOut} className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium">{userEmail}</span>.{' '}
              <button type="submit" className="underline hover:text-foreground">
                Sign out
              </button>
            </form>
          }
        />
      </div>
    </div>
  );
}
