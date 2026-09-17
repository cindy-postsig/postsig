'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { MfaCodeCard } from '@/components/auth/MfaCodeCard';
import { TrustDeviceCheckbox } from '@/components/auth/TrustDeviceCheckbox';
import { MfaQrCodeView } from '@/components/auth/MfaQrCodeView';

interface MfaTotpEnrollCardProps {
  qrCode: string;
  secret: string;
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

export function MfaTotpEnrollCard({
  qrCode,
  secret,
  verificationCode,
  onVerificationCodeChange,
  onVerify,
  onCancel,
  loading = false,
  trustDevice,
}: MfaTotpEnrollCardProps) {
  return (
    <MfaCodeCard
      title="Set up authenticator app"
      description="Scan the QR code with your authenticator app, then enter the 6-digit code it generates."
      value={verificationCode}
      onChange={onVerificationCodeChange}
      onSubmit={onVerify}
      loading={loading}
      buttonLabel="Verify & Continue"
      contentClassName="space-y-6"
      beforeInput={
        <>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">1</Badge>
              <h4 className="font-medium text-base">Scan QR Code</h4>
            </div>
            <MfaQrCodeView qrCode={qrCode} secret={secret} />
          </div>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">2</Badge>
              <h4 className="font-medium text-base">Enter Verification Code</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>
        </>
      }
      afterInput={
        trustDevice && (
          <TrustDeviceCheckbox {...trustDevice} disabled={loading} />
        )
      }
      extraActions={
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      }
    />
  );
}
