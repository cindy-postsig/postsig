'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { resetPasswordForEmail } from '@/data/users';
import { verifyOTP } from '@/data/users';

interface VerifyOTPProps {
  searchParams: {
    email: string;
    message: string;
    error: string | null;
    error_description: string | null;
  };
  email: string;
}

const VerifyOTP: React.FC<VerifyOTPProps> = ({ searchParams, email }) => {
  const [message, setMessage] = useState(searchParams.message);
  const [error, setError] = useState(searchParams.error);
  const [errorDescription, setErrorDescription] = useState(
    searchParams.error_description,
  );
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const [isResending, setIsResending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendTimer > 0 && !canResend) {
      timer = setTimeout(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    } else if (resendTimer === 0) {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [resendTimer, canResend]);

  const handleResendCode = async () => {
    if (isResending) return;
    setIsResending(true);

    try {
      const formData = new FormData();
      formData.append('email', email);
      await resetPasswordForEmail(formData);

      setMessage('A new code has been sent to your email.');
      setOtp('');
      setError('');
      setCanResend(false);
      setResendTimer(10);
    } catch (err) {
      setError('An error occurred while resending the code.');
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyOtp = async (otpValue: string) => {
    if (isVerifying) return;
    setIsVerifying(true);

    try {
      const result = await verifyOTP(email, otpValue);

      if (result.error) {
        setError(result.error);
        setMessage('');
        setOtp('');
        return;
      }

      return router.push(`/password/update`);
    } catch (err) {
      setError('An error occurred. Please try again.');
      setOtp('');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <form className="mb-4 flex w-full flex-1 flex-col justify-center gap-4 text-foreground">
      <div>
        <h3>Verify code</h3>
        <p className="mb-4 font-serif">
          Enter the 6-digit code sent to your email.
        </p>
      </div>
      <div className="mb-6">
        <InputOTP
          maxLength={6}
          value={otp}
          onChange={(value) => setOtp(value)}
          onComplete={(value) => {
            handleVerifyOtp(value);
          }}
          disabled={isVerifying}
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot
                key={i}
                index={i}
                className="font-medium h-10 w-12 font-serif text-lg sm:h-14 sm:w-[61px] sm:text-xl"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <div className="flex flex-col gap-4">
        <Button
          type="button"
          variant="outline"
          disabled={isResending || !email}
          onClick={handleResendCode}
          className="mt-2"
        >
          {isResending ? 'Sending...' : 'Resend Code'}
        </Button>
      </div>

      {message && <Alert variant={'default'}>{message}</Alert>}
      {error && (
        <Alert variant={'destructive'}>
          {errorDescription ? errorDescription : error}
        </Alert>
      )}
    </form>
  );
};

export default VerifyOTP;
