'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  challengeEmailMFA,
  verifyEmailMFAChallenge,
  checkExistingEmailMFAChallenge,
} from '@/app/lib/auth/mfa-actions';
import {
  TrustDeviceCheckbox,
  trustDeviceAfterVerify,
} from '@/components/auth/TrustDeviceCheckbox';
import { MfaCodeInput } from '@/components/auth/MfaCodeInput';
import { MfaCodeCard } from '@/components/auth/MfaCodeCard';
import {
  FailedAttemptsAlert,
  EMAIL_FAILED_MESSAGE,
} from '@/components/auth/FailedAttemptsAlert';

interface EmailMFAChallengeProps {
  userEmail?: string;
  onSuccess: () => void;
  onBack?: () => void;
  variant?: 'card' | 'inline';
  skipTrustDeviceOption?: boolean;
  hideLoginButton?: boolean;
  /** Rendered inside the card variant's CardFooter (e.g. "Signed in as…"). */
  footer?: React.ReactNode;
}

export default function EmailMFAChallenge({
  userEmail,
  onSuccess,
  variant = 'card',
  skipTrustDeviceOption = false,
  footer,
}: EmailMFAChallengeProps) {
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [trustThisDevice, setTrustThisDevice] = useState(true);
  const initialSendRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const checkExistingChallenge = useCallback(async () => {
    try {
      const result = await checkExistingEmailMFAChallenge();
      if (result.error) return false;
      if (result.hasValidChallenge) {
        setCodeSent(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const handleSendCode = useCallback(async () => {
    setSendingCode(true);
    try {
      const result = await challengeEmailMFA();
      if (result.error) {
        toast({
          variant: 'destructive',
          title: 'Failed to Send Code',
          description: result.error,
        });
        setSendingCode(false);
        return;
      }
      setCodeSent(true);
      toast({
        title: 'Verification Code Sent',
        description: 'Check your email for the 6-digit verification code.',
      });
      setSendingCode(false);
    } catch (error) {
      setSendingCode(false);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send verification code. Please try again.',
      });
    }
  }, [toast]);

  const handleVerifyCode = useCallback(async () => {
    if (verificationCode.length !== 6) {
      toast({
        variant: 'destructive',
        title: 'Code Required',
        description: 'Please enter the 6-digit verification code.',
      });
      return;
    }

    setLoading(true);
    try {
      const result = await verifyEmailMFAChallenge(verificationCode);

      if (!result.success) {
        setAttempts((prev) => prev + 1);
        toast({
          variant: 'destructive',
          title: 'Verification Failed',
          description:
            result.error || 'Invalid verification code. Please try again.',
        });

        if (attempts >= 4) {
          toast({
            variant: 'destructive',
            title: 'Too Many Attempts',
            description: 'Please request a new verification code.',
          });
          setCodeSent(false);
          setVerificationCode('');
          setAttempts(0);
        }
        setLoading(false);
        return;
      }

      toast({
        title: 'Verification Successful!',
        description: 'You have been successfully authenticated.',
      });

      if (!skipTrustDeviceOption && trustThisDevice) {
        await trustDeviceAfterVerify(toast);
      }
      onSuccess();
      setLoading(false);
    } catch (error) {
      setAttempts((prev) => prev + 1);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to verify code. Please try again.',
      });
      setLoading(false);
    }
  }, [
    verificationCode,
    attempts,
    toast,
    onSuccess,
    skipTrustDeviceOption,
    trustThisDevice,
  ]);

  const handleResendCode = useCallback(async () => {
    setVerificationCode('');
    setAttempts(0);
    await handleSendCode();
  }, [handleSendCode]);

  React.useEffect(() => {
    const initializeChallenge = async () => {
      if (!initialSendRef.current && !codeSent) {
        initialSendRef.current = true;
        const hasExistingChallenge = await checkExistingChallenge();
        if (!hasExistingChallenge) {
          await handleSendCode();
        }
      }
    };
    initializeChallenge();
  }, [codeSent, handleSendCode, checkExistingChallenge]);

  React.useEffect(() => {
    // Sending disables (and thus blurs) the OTP input; restore focus once it's
    // re-enabled so the user can type or paste without first clicking it.
    if (codeSent && !sendingCode) {
      inputRef.current?.focus();
    }
  }, [codeSent, sendingCode]);

  const trustCheckbox = !skipTrustDeviceOption && (
    <TrustDeviceCheckbox
      checked={trustThisDevice}
      onCheckedChange={setTrustThisDevice}
      disabled={loading || sendingCode}
    />
  );

  if (variant === 'inline') {
    return (
      <div className="space-y-4">
        {attempts >= 3 && (
          <FailedAttemptsAlert message={EMAIL_FAILED_MESSAGE} />
        )}
        <MfaCodeInput
          value={verificationCode}
          onChange={setVerificationCode}
          onSubmit={handleVerifyCode}
          loading={loading}
          disabled={sendingCode}
          buttonLabel="Verify"
          autoFocus
          inputRef={inputRef}
        />
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Code expires in 10 minutes. Check your spam folder if you don&apos;t
            see it.
          </p>
          <button
            type="button"
            onClick={handleResendCode}
            disabled={loading || sendingCode}
            className="text-sm text-gray-700 underline hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sendingCode ? 'Sending...' : 'Resend code'}
          </button>
        </div>
        {trustCheckbox}
      </div>
    );
  }

  return (
    <MfaCodeCard
      title="Enter verification code"
      description={`Enter the 6-digit code we sent to ${userEmail || 'your email'}.`}
      value={verificationCode}
      onChange={setVerificationCode}
      onSubmit={handleVerifyCode}
      loading={loading}
      disabled={sendingCode}
      buttonLabel="Verify"
      autoFocus
      inputRef={inputRef}
      onResend={handleResendCode}
      resending={sendingCode}
      beforeInput={
        attempts >= 3 ? (
          <FailedAttemptsAlert message={EMAIL_FAILED_MESSAGE} />
        ) : undefined
      }
      afterInput={
        <>
          <p className="text-xs text-muted-foreground">
            Code expires in 10 minutes. Check your spam folder if you don&apos;t
            see it.
          </p>
          {trustCheckbox}
        </>
      }
      footer={footer}
    />
  );
}
