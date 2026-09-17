'use client';

import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  cleanupOrphanedMFAFactors,
  enrollEmailMFA,
  enrollMFA,
  verifyEmailMFAEnrollment,
  verifyMFAEnrollment,
} from '@/app/lib/auth/mfa-actions';
import logger from '@/utils/pino';

export type MfaType = 'totp' | 'email';

export interface MfaEnrollmentData {
  qr_code: string;
  secret: string;
  uri: string;
}

interface UseMfaEnrollmentOptions {
  onVerified?: () => void;
  beforeTotpEnroll?: () => Promise<void>;
}

export function useMfaEnrollment(options: UseMfaEnrollmentOptions = {}) {
  const { toast } = useToast();
  const { onVerified, beforeTotpEnroll } = options;

  const [selectedMfaType, setSelectedMfaType] = useState<MfaType>('totp');
  const [enrolledMfaType, setEnrolledMfaType] = useState<MfaType | null>(null);
  const [enrollmentData, setEnrollmentData] =
    useState<MfaEnrollmentData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const startEnroll = useCallback(
    async (mfaType: MfaType) => {
      setLoading(true);
      try {
        const cleanup = await cleanupOrphanedMFAFactors();
        if (!cleanup.success) {
          toast({
            variant: 'destructive',
            title: 'MFA Cleanup Failed',
            description:
              cleanup.error ||
              'Could not prepare MFA enrollment. Please try again.',
          });
          return;
        }

        if (mfaType === 'totp') {
          if (beforeTotpEnroll) await beforeTotpEnroll();

          const result = await enrollMFA();

          if (result.error) {
            toast({
              variant: 'destructive',
              title: 'TOTP MFA Enrollment Failed',
              description: result.error,
            });
            return;
          }

          if (result.data?.totp) {
            setEnrollmentData(result.data.totp);
            setEnrolledMfaType('totp');
            setIsEnrolling(true);
            toast({
              title: 'TOTP MFA Enrollment Started',
              description:
                'Scan the QR code with your authenticator app and enter the verification code.',
            });
          }
          return;
        }

        const result = await enrollEmailMFA();

        if (result.error) {
          toast({
            variant: 'destructive',
            title: 'Email MFA Enrollment Failed',
            description: result.error,
          });
          return;
        }

        setEnrolledMfaType('email');
        setIsEnrolling(true);
        setEmailCodeSent(true);
        toast({
          title: 'Email MFA Setup Started',
          description:
            'A verification code has been sent to your email. Please check your inbox.',
        });
      } catch (error) {
        logger.error(
          { error, action: 'useMfaEnrollment.startEnroll' },
          'Failed to start MFA enrollment',
        );
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to start MFA enrollment. Please try again.',
        });
      } finally {
        setLoading(false);
      }
    },
    [toast, beforeTotpEnroll],
  );

  const verify = useCallback(async () => {
    if (!verificationCode.trim()) {
      toast({
        variant: 'destructive',
        title: 'Verification Required',
        description: 'Please enter the 6-digit verification code.',
      });
      return;
    }

    if (!enrolledMfaType) {
      toast({
        variant: 'destructive',
        title: 'Enrollment Required',
        description: 'Start MFA setup before verifying a code.',
      });
      return;
    }

    setLoading(true);
    try {
      const result =
        enrolledMfaType === 'email'
          ? await verifyEmailMFAEnrollment(verificationCode)
          : await verifyMFAEnrollment(verificationCode);

      if (!result.success) {
        toast({
          variant: 'destructive',
          title: 'Verification Failed',
          description:
            result.error || 'Invalid verification code. Please try again.',
        });
        return;
      }

      toast({
        title: 'MFA Enabled Successfully!',
        description:
          'Your account is now protected with multi-factor authentication.',
      });

      onVerified?.();
    } catch (error) {
      logger.error(
        { error, action: 'useMfaEnrollment.verify' },
        'Failed to verify MFA enrollment',
      );
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to verify MFA code. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [verificationCode, enrolledMfaType, toast, onVerified]);

  const cancel = useCallback(async () => {
    setLoading(true);
    try {
      await cleanupOrphanedMFAFactors();
    } catch (error) {
      logger.warn(
        { error, action: 'useMfaEnrollment.cancel' },
        'Failed to cleanup orphaned MFA factors',
      );
    }
    setEnrollmentData(null);
    setEnrolledMfaType(null);
    setIsEnrolling(false);
    setVerificationCode('');
    setEmailCodeSent(false);
    setLoading(false);
  }, []);

  return {
    selectedMfaType,
    setSelectedMfaType,
    enrolledMfaType,
    enrollmentData,
    verificationCode,
    setVerificationCode,
    isEnrolling,
    emailCodeSent,
    loading,
    startEnroll,
    verify,
    cancel,
  };
}
