'use client';

import { Button } from '@/components/ui/button';
import { MfaCodeCard } from '@/components/auth/MfaCodeCard';
import { TrustDeviceCheckbox } from '@/components/auth/TrustDeviceCheckbox';

interface MfaEmailEnrollCardProps {
  userEmail: string;
  verificationCode: string;
  onVerificationCodeChange: (value: string) => void;
  onVerify: () => void;
  onCancel: () => void;
  loading?: boolean;
  /** Offered on the code card when set; absent where trusting makes no sense. */
  trustDevice?: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  };
}

export function MfaEmailEnrollCard({
  userEmail,
  verificationCode,
  onVerificationCodeChange,
  onVerify,
  onCancel,
  loading = false,
  trustDevice,
}: MfaEmailEnrollCardProps) {
  return (
    <MfaCodeCard
      title="Set up email verification"
      description={`Enter the 6-digit code we sent to ${userEmail || 'your email'}.`}
      value={verificationCode}
      onChange={onVerificationCodeChange}
      onSubmit={onVerify}
      loading={loading}
      buttonLabel="Verify & Continue"
      afterInput={
        <>
          <p className="text-xs text-muted-foreground">
            Code expires in 10 minutes. Check your spam folder if you don&apos;t
            see it.
          </p>
          {trustDevice && (
            <TrustDeviceCheckbox {...trustDevice} disabled={loading} />
          )}
        </>
      }
      extraActions={
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      }
    />
  );
}
