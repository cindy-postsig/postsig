'use client';
import { createClient } from '@/utils/supabase/client';
import { useState, useEffect } from 'react';
import { type User } from '@supabase/supabase-js';
import { track } from '@vercel/analytics';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import PasswordInput from '../auth/PasswordInput';
import { passwordSchema } from '@/app/lib/validations';
import { getMFAStatus } from '@/app/lib/auth/mfa-actions';
import { useMFAGate } from '@/hooks/useMFAGate';
import DynamicMFAChallenge from '../auth/DynamicMFAChallenge';
import logger from '@/utils/pino';
import { CheckCircledIcon } from '@radix-ui/react-icons';

export default function PasswordForm({ user }: { user: User | null }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isNewPasswordValid, setIsNewPasswordValid] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [hasMFA, setHasMFA] = useState<boolean | null>(null);
  const [mfaType, setMfaType] = useState<'totp' | 'email'>('totp');
  const [mfaVerified, setMfaVerified] = useState(false);

  async function performPasswordUpdate() {
    try {
      setLoading(true);

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      toast({
        description: 'Password updated successfully',
        variant: 'default',
      });

      // Close MFA dialog if it was open
      mfaGate.closeMFAChallenge();
      setMfaVerified(false);

      // Clear the form and hide it after successful update
      setCurrentPassword('');
      setNewPassword('');
      setIsNewPasswordValid(false);
      setIsChangingPassword(false);
    } catch (error: any) {
      toast(generateToastError(error.message, 'Error updating password!'));
    } finally {
      setLoading(false);
    }
  }

  const mfaGate = useMFAGate({
    onSuccess: () => {
      setMfaVerified(true);
      mfaGate.closeMFAChallenge();
    },
    onCancel: () => {
      setLoading(false);
      setIsChangingPassword(false);
      setMfaVerified(false);
    },
  });

  useEffect(() => {
    async function checkMFAStatus() {
      try {
        const mfaStatus = await getMFAStatus();
        setHasMFA(mfaStatus.enabled);
        if (mfaStatus.enabled && mfaStatus.mfaType) {
          setMfaType(mfaStatus.mfaType as 'totp' | 'email');
        }
      } catch (error) {
        logger.error({ error }, 'Failed to check MFA status');
        setHasMFA(false);
      }
    }

    if (user) {
      checkMFAStatus();
    }
  }, [user]);

  async function handlePasswordUpdate() {
    // Validate new password with Zod
    const validationResult = passwordSchema.safeParse(newPassword);

    if (!validationResult.success) {
      toast({
        title: 'Invalid Password',
        description:
          validationResult.error.issues[0]?.message ||
          'Please check password requirements',
        variant: 'destructive',
      });
      return;
    }

    track('Update Password');

    if (hasMFA) {
      // For MFA users: Skip current password verification, go directly to MFA challenge
      // This is more secure as MFA verification is stronger than password verification
      if (!mfaVerified) {
        mfaGate.openMFAChallenge();
        return;
      } else {
        await performPasswordUpdate();
      }
    } else {
      // For non-MFA users: Verify current password first
      try {
        setLoading(true);

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user?.email ?? '',
          password: currentPassword,
        });

        if (signInError) {
          throw new Error('Invalid current password');
        }

        await performPasswordUpdate();
      } catch (error: any) {
        toast(
          generateToastError(
            error.message,
            'Error verifying current password!',
          ),
        );
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          {hasMFA && (
            <CardDescription>
              You&apos;ll verify with{' '}
              {mfaType === 'email' ? 'an email code' : 'your authenticator app'}{' '}
              instead of your current password.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!isChangingPassword ? (
            <div className="space-y-4">
              <Button
                onClick={() => {
                  if (hasMFA) {
                    mfaGate.openMFAChallenge();
                    setIsChangingPassword(true);
                  } else {
                    setIsChangingPassword(true);
                  }
                }}
              >
                Change Password
              </Button>
            </div>
          ) : (
            <form
              className="w-full max-w-md pt-2"
              onSubmit={(e) => e.preventDefault()}
            >
              <div className="flex flex-col gap-6">
                {hasMFA === false && (
                  <Label htmlFor="currentPassword">
                    <span>
                      <strong className="inline">Current</strong> Password
                    </span>
                    <PasswordInput
                      id="currentPassword"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </Label>
                )}

                <Label htmlFor="newPassword">
                  <span>New Password</span>
                  <PasswordInput
                    id="newPassword"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onValidationChange={setIsNewPasswordValid}
                    required
                    showValidation={true}
                  />
                </Label>
              </div>
              <div className="mt-6 flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsChangingPassword(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setIsNewPasswordValid(false);
                  }}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  onClick={handlePasswordUpdate}
                  disabled={
                    loading ||
                    !newPassword ||
                    !isNewPasswordValid ||
                    hasMFA === null || // Still loading MFA status
                    (!hasMFA && !currentPassword) // Non-MFA users need current password
                  }
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* MFA Challenge Dialog */}
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
              To change your password, please verify your identity
              {mfaType === 'email'
                ? ' with the verification code sent to your email.'
                : ' with your authenticator app.'}
            </DialogDescription>
          </DialogHeader>
          <DynamicMFAChallenge
            mfaType={mfaType}
            onSuccess={mfaGate.handleMFASuccess}
            onCancel={mfaGate.handleMFACancel}
            variant="inline"
            skipTrustDeviceOption={true}
            hideLoginButton={true}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
