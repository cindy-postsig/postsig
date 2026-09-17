'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { verifyMFAChallenge } from '@/app/lib/auth/mfa-actions';
import {
  TrustDeviceCheckbox,
  trustDeviceAfterVerify,
} from '@/components/auth/TrustDeviceCheckbox';
import { MfaCodeInput } from '@/components/auth/MfaCodeInput';
import { MfaCodeCard } from '@/components/auth/MfaCodeCard';
import {
  FailedAttemptsAlert,
  TOTP_FAILED_MESSAGE,
} from '@/components/auth/FailedAttemptsAlert';

interface MFAChallengeProps {
  onSuccess: () => void;
  onCancel?: () => void;
  variant?: 'card' | 'inline';
  skipTrustDeviceOption?: boolean;
  /** Rendered inside the card variant's CardFooter (e.g. "Signed in as…"). */
  footer?: React.ReactNode;
}

export default function MFAChallenge({
  onSuccess,
  variant = 'card',
  skipTrustDeviceOption = false,
  footer,
}: MFAChallengeProps) {
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [trustThisDevice, setTrustThisDevice] = useState(true);
  const { toast } = useToast();

  const handleVerify = useCallback(async () => {
    if (code.length !== 6) {
      toast({
        variant: 'destructive',
        title: 'Code Required',
        description:
          'Please enter the 6-digit code from your authenticator app.',
      });
      return;
    }

    setLoading(true);
    try {
      const result = await verifyMFAChallenge(code);

      if (!result.success) {
        setAttempts((prev) => prev + 1);
        toast({
          variant: 'destructive',
          title: 'Verification Failed',
          description: result.error || 'Invalid code. Please try again.',
        });
        setCode('');
        setLoading(false);
        return;
      }

      toast({
        title: 'Verification Successful',
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
      setCode('');
      setLoading(false);
    }
  }, [code, toast, skipTrustDeviceOption, trustThisDevice, onSuccess]);

  const trustCheckbox = !skipTrustDeviceOption && (
    <TrustDeviceCheckbox
      checked={trustThisDevice}
      onCheckedChange={setTrustThisDevice}
      disabled={loading}
    />
  );

  if (variant === 'inline') {
    return (
      <div className="space-y-4">
        {attempts >= 3 && (
          <Alert variant="destructive">
            <AlertDescription>{TOTP_FAILED_MESSAGE}</AlertDescription>
          </Alert>
        )}
        <MfaCodeInput
          value={code}
          onChange={setCode}
          onSubmit={handleVerify}
          loading={loading}
          buttonLabel="Verify"
          autoFocus
        />
        {trustCheckbox}
      </div>
    );
  }

  return (
    <MfaCodeCard
      title="Enter verification code"
      description="Enter the 6-digit code from your authenticator app."
      value={code}
      onChange={setCode}
      onSubmit={handleVerify}
      loading={loading}
      buttonLabel="Verify"
      autoFocus
      beforeInput={
        attempts >= 3 ? (
          <FailedAttemptsAlert message={TOTP_FAILED_MESSAGE} />
        ) : undefined
      }
      afterInput={trustCheckbox || undefined}
      footer={footer}
    />
  );
}
