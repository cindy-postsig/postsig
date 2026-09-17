'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SubmitButton } from '@/components/SubmitButton';
import { Alert } from '@/components/ui/alert';
import { updatePassword } from '@/data/users';
import PasswordInput from '@/components/auth/PasswordInput';
import { getMFAStatus } from '@/app/lib/auth/mfa-actions';
import DynamicMFAChallenge from '@/components/auth/DynamicMFAChallenge';
import { useMFAGate } from '@/hooks/useMFAGate';
import { Loader2 } from 'lucide-react';

interface PasswordUpdateProps {
  searchParams: {
    email: string;
    message: string;
    error: string | null;
    error_description: string | null;
  };
}

const PasswordUpdate: React.FC<PasswordUpdateProps> = ({ searchParams }) => {
  const [password, setPassword] = useState('');
  const message = searchParams.message;
  const [error, setError] = useState(searchParams.error);
  const [errorDescription, setErrorDescription] = useState(
    searchParams.error_description,
  );
  const [isDisabled, setIsDisabled] = useState(false);
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  const [mfaStatus, setMfaStatus] = useState<{
    enabled: boolean;
    mfaType?: string;
    verified: boolean;
  }>({ enabled: false, verified: false });
  const [isCheckingMFA, setIsCheckingMFA] = useState(true);
  const router = useRouter();

  const handleMFASuccess = () => {
    setMfaStatus((prev) => ({ ...prev, verified: true }));
    mfaGate.closeMFAChallenge();
  };

  const mfaGate = useMFAGate({
    onSuccess: handleMFASuccess,
    onCancel: () => {
      setError('MFA verification is required to update your password');
    },
  });

  useEffect(() => {
    async function checkMFA() {
      try {
        const status = await getMFAStatus();
        setMfaStatus({
          enabled: status.enabled,
          mfaType: status.mfaType,
          verified: false,
        });
        // Email MFA users already proved email access via the /password/verify
        // step; asking again with another emailed code is the same factor twice.
        // Only TOTP adds a genuinely independent factor here.
        if (status.enabled && status.mfaType === 'totp') {
          mfaGate.openMFAChallenge();
        }
      } catch (err) {
        setMfaStatus({ enabled: false, verified: false });
      } finally {
        setIsCheckingMFA(false);
      }
    }
    checkMFA();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsDisabled(true);
    try {
      const formData = new FormData();
      formData.append('password', password);
      const result = await updatePassword(formData);
      if (result.error) {
        setErrorDescription(null);
        setError(result.error);
        setIsDisabled(false);
        if (result.redirect) {
          router.push(result.redirect);
        }
      } else {
        // Full reload so middleware sees the invalidated session.
        window.location.href = result.redirect!;
      }
    } catch (error) {
      setIsDisabled(false);
      setError('An unexpected error occurred. Please try again.');
    }
  };

  if (isCheckingMFA) {
    return (
      <div className="mb-4 flex w-full flex-1 flex-col items-center justify-center gap-4 text-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm text-muted-foreground">
          Checking security settings...
        </p>
      </div>
    );
  }

  if (mfaGate.showMFAChallenge) {
    const challengeMfaType: 'totp' | 'email' =
      mfaStatus.mfaType === 'email' ? 'email' : 'totp';
    const challengeDescription =
      challengeMfaType === 'email'
        ? `Enter the 6-digit code we sent to ${searchParams.email || 'your email'}.`
        : 'Enter the 6-digit code from your authenticator app.';

    return (
      <div className="mb-3 flex w-full flex-1 flex-col gap-4">
        <div className="space-y-1">
          <h4 className="font-medium">Verify your identity</h4>
          <p className="text-sm text-muted-foreground">
            {challengeDescription}
          </p>
        </div>
        <DynamicMFAChallenge
          mfaType={challengeMfaType}
          userEmail={searchParams.email}
          onSuccess={mfaGate.handleMFASuccess}
          onCancel={mfaGate.handleMFACancel}
          variant="inline"
          skipTrustDeviceOption={true}
        />
      </div>
    );
  }

  return (
    <form
      className="mb-4 flex w-full flex-1 flex-col justify-center gap-4 text-foreground"
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-2">
        <label className="font-medium">Enter your new password</label>
        <PasswordInput
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onValidationChange={setIsPasswordValid}
          required
          className="py-7 text-xl"
          showValidation
          placeholder="new password"
          disabled={isDisabled}
          autoFocus
        />
      </div>
      <SubmitButton
        className="h-14 rounded px-4 py-3 text-lg"
        pendingText="Updating..."
        disabled={isDisabled || !isPasswordValid}
      >
        Update Password
      </SubmitButton>
      {message && <Alert variant={'default'}>{message}</Alert>}
      {error && (
        <Alert variant={'destructive'}>
          {errorDescription ? errorDescription : error}
        </Alert>
      )}
    </form>
  );
};

export default PasswordUpdate;
