'use client';

import { useCallback, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Smartphone, Mail } from 'lucide-react';
import { CheckCircledIcon } from '@radix-ui/react-icons';
import { cleanupAllMFAFactors } from '@/app/lib/auth/mfa-actions';
import { createClient } from '@/utils/supabase/client';
import { Separator } from '../ui/separator';
import { useMFAGate } from '@/hooks/useMFAGate';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import DynamicMFAChallenge from '../auth/DynamicMFAChallenge';
import { MfaQrCodeView } from '../auth/MfaQrCodeView';
import { MfaCodeInput } from '../auth/MfaCodeInput';
import { useMfaEnrollment, type MfaType } from '@/hooks/useMfaEnrollment';

interface MFASetupProps {
  user: User;
  mfaStatus: {
    enabled: boolean;
    hasBackupCodes: boolean;
    factorCount: number;
    mfaType?: string;
    emailMfaEnabled?: boolean;
  };
}

export default function MFASetup({ user, mfaStatus }: MFASetupProps) {
  const [pendingSwitchTo, setPendingSwitchTo] = useState<MfaType | null>(null);
  const [confirmSwitchTo, setConfirmSwitchTo] = useState<MfaType | null>(null);

  const beforeTotpEnroll = useCallback(async () => {
    await cleanupAllMFAFactors();
  }, []);

  const onVerified = useCallback(async () => {
    // Sign out explicitly — TOTP→email switch invalidates the session via factor
    // unenroll, but email→TOTP doesn't, so without this the user just bounces
    // back to dashboard from /login.
    const supabase = createClient();
    await supabase.auth.signOut();
    const message = encodeURIComponent(
      'MFA method updated. Please sign in with your new method.',
    );
    window.location.href = `/login?message=${message}`;
  }, []);

  const {
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
  } = useMfaEnrollment({ beforeTotpEnroll, onVerified });

  const handleSwitchMethod = useCallback(() => {
    const newMethod: MfaType = mfaStatus.mfaType === 'email' ? 'totp' : 'email';
    setConfirmSwitchTo(newMethod);
  }, [mfaStatus.mfaType]);

  const confirmSwitch = useCallback(() => {
    if (!confirmSwitchTo) return;
    setPendingSwitchTo(confirmSwitchTo);
    setConfirmSwitchTo(null);
    mfaGate.openMFAChallenge();
  }, [confirmSwitchTo]);

  const performSwitchAfterVerification = useCallback(async () => {
    if (!pendingSwitchTo) return;
    try {
      await startEnroll(pendingSwitchTo);
    } finally {
      mfaGate.closeMFAChallenge();
    }
  }, [pendingSwitchTo, startEnroll]);

  const mfaGate = useMFAGate({
    onSuccess: performSwitchAfterVerification,
    onCancel: () => {
      setPendingSwitchTo(null);
    },
  });

  const currentMfaType: 'totp' | 'email' =
    mfaStatus.mfaType === 'email' ? 'email' : 'totp';

  const isTotpEnrolled = mfaStatus.factorCount > 0;
  const isEmailEnrolled = mfaStatus.emailMfaEnabled === true;

  const cardTitle = isEnrolling
    ? enrolledMfaType === 'email'
      ? 'Set up email verification'
      : 'Set up authenticator app'
    : 'Multi-Factor Authentication';

  const cardDescription = isEnrolling
    ? enrolledMfaType === 'email'
      ? `Enter the 6-digit code we sent to ${user.email || 'your email'}.`
      : 'Scan the QR code with your authenticator app, then enter the 6-digit code it generates.'
    : 'Enable MFA to protect your account with an additional security layer.';

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <p>{cardTitle}</p>
            {!isEnrolling && mfaStatus.enabled && (
              <Badge variant="default">Enabled</Badge>
            )}
          </CardTitle>
          <CardDescription className="text-balance">
            {cardDescription}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isEnrolling && enrollmentData && (
            <div className="space-y-6">
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant={'outline'}>Step 1</Badge>
                  <h4 className="font-medium">Scan QR Code</h4>
                </div>
                <MfaQrCodeView
                  qrCode={enrollmentData.qr_code}
                  secret={enrollmentData.secret}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={'outline'}>Step 2</Badge>
                    <h4 className="font-medium">Enter Verification Code</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Enter the 6-digit code from your authenticator app to
                    complete setup.
                  </p>
                  <div className="pt-4">
                    <MfaCodeInput
                      value={verificationCode}
                      onChange={setVerificationCode}
                      onSubmit={verify}
                      loading={loading}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={cancel} disabled={loading}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {isEnrolling && emailCodeSent && !enrollmentData && (
            <div className="space-y-4">
              <MfaCodeInput
                value={verificationCode}
                onChange={setVerificationCode}
                onSubmit={verify}
                loading={loading}
              />
              <p className="text-xs text-muted-foreground">
                Code expires in 10 minutes. Check your spam folder if you
                don&apos;t see it.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={cancel} disabled={loading}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {mfaStatus.enabled && !isEnrolling && (
            <div className="divide-y rounded-md border">
              <div className="flex items-center gap-3 p-4">
                <Smartphone className="h-5 w-5 shrink-0 text-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">
                    Authenticator App (TOTP)
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{isTotpEnrolled ? 'Enrolled' : 'Not enrolled'}</span>
                    {isTotpEnrolled && (
                      <CheckCircledIcon
                        className="h-3.5 w-3.5 text-green"
                        aria-label="Enrolled"
                      />
                    )}
                  </div>
                </div>
                {mfaStatus.mfaType !== 'totp' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSwitchMethod}
                    disabled={loading}
                  >
                    {loading ? 'Switching...' : 'Switch'}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3 p-4">
                <Mail className="h-5 w-5 shrink-0 text-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">Email Verification</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{isEmailEnrolled ? 'Enrolled' : 'Not enrolled'}</span>
                    {isEmailEnrolled && (
                      <CheckCircledIcon
                        className="h-3.5 w-3.5 text-green"
                        aria-label="Enrolled"
                      />
                    )}
                  </div>
                </div>
                {mfaStatus.mfaType !== 'email' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSwitchMethod}
                    disabled={loading}
                  >
                    {loading ? 'Switching...' : 'Switch'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={mfaGate.showMFAChallenge}
        onOpenChange={(open) => {
          if (!open) {
            mfaGate.handleMFACancel();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Identity</DialogTitle>
            <DialogDescription>
              To switch your MFA method, please verify your identity
              {currentMfaType === 'email'
                ? ' with the verification code sent to your email.'
                : ' with your authenticator app.'}
            </DialogDescription>
          </DialogHeader>
          <DynamicMFAChallenge
            mfaType={currentMfaType}
            userEmail={user.email ?? undefined}
            onSuccess={mfaGate.handleMFASuccess}
            onCancel={mfaGate.handleMFACancel}
            variant="inline"
            skipTrustDeviceOption={true}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmSwitchTo !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmSwitchTo(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Switch to{' '}
              {confirmSwitchTo === 'totp' ? 'Authenticator App' : 'Email'} MFA?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your current MFA method will be disabled. You&apos;ll verify your
              identity first, then set up the new method.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitch}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
