'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useToast } from '@/components/ui/use-toast';
import { getMFAStatus } from '@/app/lib/auth/mfa-actions';
import { signOut } from '@/app/lib/auth/actions';
import { createClient } from '@/utils/supabase/client';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { MfaMethodPickerCard } from '@/components/auth/MfaMethodPickerCard';
import { MfaTotpEnrollCard } from '@/components/auth/MfaTotpEnrollCard';
import { MfaEmailEnrollCard } from '@/components/auth/MfaEmailEnrollCard';
import { useMfaEnrollment } from '@/hooks/useMfaEnrollment';
import { trustDeviceAfterVerify } from '@/components/auth/TrustDeviceCheckbox';

export default function MFAEnrollPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [signedUp, setSignedUp] = useState(false);
  const [trustThisDevice, setTrustThisDevice] = useState(true);

  const nextDestination = signedUp ? '/' : '/signup/terms';

  const enrollment = useMfaEnrollment({
    onVerified: async () => {
      if (trustThisDevice) await trustDeviceAfterVerify(toast);
      router.push(nextDestination);
    },
  });

  useEffect(() => {
    const checkMFAStatus = async () => {
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

        setUserEmail(user.email || '');
        setSignedUp(status.signedUp);

        if (status.enabled) {
          router.push(status.signedUp ? '/' : '/signup/terms');
          return;
        }
      } catch (error) {
        logger.error(
          { error: sanitizeForLogging(error), action: 'checkMFAStatus' },
          'Failed to check MFA status',
        );
      } finally {
        setCheckingStatus(false);
      }
    };

    checkMFAStatus();
  }, [router]);

  if (checkingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
          <p className="mt-4 text-sm text-muted-foreground">
            Checking MFA status...
          </p>
        </div>
      </div>
    );
  }

  const {
    selectedMfaType,
    setSelectedMfaType,
    enrollmentData,
    verificationCode,
    setVerificationCode,
    isEnrolling,
    emailCodeSent,
    loading,
    startEnroll,
    verify,
    cancel,
  } = enrollment;

  return (
    <div className="mt-16 flex flex-col items-center gap-10 px-8 py-12">
      <div className="flex w-full max-w-xl flex-col gap-6 font-serif">
        <Image
          src="/PS_Icon.svg"
          alt="PostSig Logo"
          width={40}
          height={40}
          className="dark:invert"
        />
        <div>
          <h2>Secure your account</h2>
          <p className="max-w-md leading-snug">
            Multi-factor authentication is required to protect your account.
          </p>
        </div>
      </div>

      <div className="w-full max-w-xl">
        {!isEnrolling && (
          <MfaMethodPickerCard
            selectedMfaType={selectedMfaType}
            onSelectedMfaTypeChange={setSelectedMfaType}
            userEmail={userEmail}
            loading={loading}
            onStart={() => startEnroll(selectedMfaType)}
          />
        )}

        {isEnrolling && enrollmentData && (
          <MfaTotpEnrollCard
            qrCode={enrollmentData.qr_code}
            secret={enrollmentData.secret}
            verificationCode={verificationCode}
            onVerificationCodeChange={setVerificationCode}
            onVerify={verify}
            onCancel={cancel}
            loading={loading}
            trustDevice={{
              checked: trustThisDevice,
              onCheckedChange: setTrustThisDevice,
            }}
          />
        )}

        {isEnrolling && emailCodeSent && !enrollmentData && (
          <MfaEmailEnrollCard
            userEmail={userEmail}
            verificationCode={verificationCode}
            onVerificationCodeChange={setVerificationCode}
            onVerify={verify}
            onCancel={cancel}
            loading={loading}
            trustDevice={{
              checked: trustThisDevice,
              onCheckedChange: setTrustThisDevice,
            }}
          />
        )}
      </div>

      <form
        action={signOut}
        className="w-full max-w-xl text-sm text-muted-foreground"
      >
        Signed in as <span className="font-medium">{userEmail}</span>.{' '}
        <button type="submit" className="underline hover:text-foreground">
          Sign out
        </button>
      </form>
    </div>
  );
}
