'use client';
import React, { useState, useEffect } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';
import { signInWithPassword } from '@/data/users';
import { createClient } from '@/utils/supabase/client';
import { emailDomain } from '@/app/lib/auth/sso-identity';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { generateToastError } from '@/utils/toast';
import { Alert } from './ui/alert';
import { Input } from './ui/input';
import { useAuthStatus } from '@/app/hooks/useAuthStatus';
import { useSecretInputRef } from '@/hooks/useSecretInputRef';
import { isValidInternalPath } from '@/lib/utils';
import {
  attemptsRemainingMessage,
  countdownMessage,
  nextAttemptMessage,
} from '@/app/lib/auth/rate-limit-message';

const sanitizeEmail = (email: string): string => {
  let sanitized = email.trim().toLowerCase();

  // First remove any non-standard plus signs
  sanitized = sanitized.replace(/[＋]/gu, '+');

  // Ensure the plus sign is the correct ASCII one (U+002B)
  sanitized = sanitized.replace(/\+/g, '\u002B');

  // Remove any invisible characters
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');

  return sanitized;
};

const sanitizePassword = (password: string): string => {
  // Trim whitespace and remove invisible characters
  return password.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
};

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export default function LoginForm({
  message,
  rid,
  redirect,
}: {
  message: string;
  rid: string;
  redirect: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [authError, setAuthError] = useState('');
  const [lockSeconds, setLockSeconds] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [attemptsWarning, setAttemptsWarning] = useState('');
  // 'refused' — the attempt was turned away. 'paced' — it was checked and the
  // wait applies to the next one. Same countdown, very different sentence.
  const [waitReason, setWaitReason] = useState<'refused' | 'paced'>('refused');
  const { toast } = useToast();
  const router = useRouter();
  const authStatus = useAuthStatus();
  // The password is bound through the element's value property rather than a
  // `value` prop, which React would reflect into the inspectable DOM.
  const passwordRef = useSecretInputRef(password);
  const safeRedirect = isValidInternalPath(redirect) ? redirect : '/';
  const lockedOut = lockSeconds > 0;

  // The refusal already carries the seconds left, so tick it down locally
  // rather than re-asking the server every second.
  useEffect(() => {
    if (lockSeconds <= 0) return;
    const timer = setTimeout(() => {
      // Recomputed against the deadline rather than decremented: a backgrounded
      // tab delivers this callback late, and counting down blind would hold the
      // form shut well past the point the server would take the attempt.
      setLockSeconds(Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000)));
    }, 1000);
    return () => clearTimeout(timer);
  }, [lockSeconds, lockUntil]);

  // A throttle supersedes the incorrect-password text, but not the attempts
  // warning: a refused submission never reached the password, so the count it
  // shows is still current and blanking it reads as though the wait consumed one.
  const beginWait = (seconds: number, reason: 'refused' | 'paced') => {
    const whole = Math.ceil(seconds);
    setWaitReason(reason);
    setLockUntil(Date.now() + whole * 1000);
    setLockSeconds(whole);
  };

  const startCountdown = (seconds: number) => {
    setAuthError('');
    beginWait(seconds, 'refused');
  };

  const redirectToVerify = () => {
    const url =
      safeRedirect === '/'
        ? '/mfa/verify'
        : `/mfa/verify?redirect=${encodeURIComponent(safeRedirect)}`;
    router.push(url);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeEmail(e.target.value);
    setEmail(sanitized);

    // Clear errors when user starts typing
    if (validationError) setValidationError('');
    if (authError) setAuthError('');
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizePassword(e.target.value);
    setPassword(sanitized);

    // Clear errors when user starts typing
    if (validationError) setValidationError('');
    if (authError) setAuthError('');
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const fieldType = e.currentTarget.type;

    if (fieldType === 'email') {
      const sanitized = sanitizeEmail(pastedText);
      setEmail(sanitized);
    } else if (fieldType === 'password') {
      const sanitized = sanitizePassword(pastedText);
      setPassword(sanitized);
    }
  };

  async function signIn(formData: FormData) {
    // Buttons are disabled during the countdown, but that does not stop Enter
    // in every browser.
    if (lockedOut) return;

    const emailValue = sanitizeEmail(formData.get('email') as string);
    const passwordValue = sanitizePassword(formData.get('password') as string);

    if (!isValidEmail(emailValue)) {
      setValidationError('Please enter a valid email address');
      toast(generateToastError('', 'Please enter a valid email address'));
      return;
    }

    try {
      setLoading(true);
      const result = await signInWithPassword({
        email: emailValue,
        password: passwordValue,
      });

      if (result.rateLimited) {
        setLoading(false);
        startCountdown(result.rateLimited.retryAfterSeconds);
        return;
      }

      if (result.serviceError) {
        setLoading(false);
        setAttemptsWarning('');
        setAuthError(
          'We could not complete sign-in just now. Please try again in a moment.',
        );
        return;
      }

      if (result.invalidCredentials) {
        setLoading(false);
        const { attemptsRemaining, lockedForSeconds, nextAttemptInSeconds } =
          result.invalidCredentials;

        // This failure is the one that locked the account; say so now rather
        // than on the next attempt. The remaining count is spent, so it goes.
        if (lockedForSeconds) {
          setAttemptsWarning('');
          startCountdown(lockedForSeconds);
          return;
        }

        setAuthError(
          'The email or password you entered is incorrect. Please try again.',
        );
        // Null when the limiter could not count it, so there is no figure.
        setAttemptsWarning(
          attemptsRemaining === null
            ? ''
            : (attemptsRemainingMessage(attemptsRemaining) ?? ''),
        );
        // The limiter has already reserved the next slot, so hold the button
        // for it. Without this the user spends a password on a submission the
        // server was always going to turn away.
        if (nextAttemptInSeconds) beginWait(nextAttemptInSeconds, 'paced');
        return;
      }

      if (result.requiresMFA) {
        redirectToVerify();
        return;
      }

      router.push(`${safeRedirect}`);
    } catch (error: unknown) {
      setLoading(false);
      setAuthError(
        'The email or password you entered is incorrect. Please try again.',
      );
    }
  }

  async function signInWithSSO() {
    const domain = emailDomain(email);
    if (!isValidEmail(email) || !domain) {
      setValidationError('Enter your work email to continue with SSO');
      return;
    }

    if (lockedOut) return;

    setSsoLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithSSO({
      domain,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeRedirect)}`,
      },
    });

    if (error || !data?.url) {
      setSsoLoading(false);
      setAuthError('Single sign-on is not enabled for your organization.');
      return;
    }

    window.location.href = data.url;
  }

  useEffect(() => {
    if (authStatus.isLoading) return;

    if (authStatus.needsMFA) {
      redirectToVerify();
    } else if (authStatus.isAuthenticated) {
      router.push(safeRedirect);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, safeRedirect, router]);

  return (
    <>
      <form
        className="mb-4 flex w-full flex-1 flex-col justify-center gap-4 text-foreground"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData();
          formData.append('email', email);
          formData.append('password', password);
          signIn(formData);
        }}
      >
        <Image
          src={'/PS_Icon.svg'}
          alt="PS Icon"
          height={60}
          width={47.78}
          className="mb-8 dark:invert"
        />
        {message && <Alert variant={'destructive'}>{message}</Alert>}
        {validationError && (
          <Alert variant={'destructive'}>{validationError}</Alert>
        )}
        {authError && (
          <Alert variant={'destructive'} role="alert">
            {authError}
          </Alert>
        )}
        <div className="flex flex-col">
          <Input
            type="email"
            id="email"
            value={email}
            placeholder="email"
            onChange={handleEmailChange}
            onPaste={handlePaste}
            className="h-14 rounded border bg-inherit px-4 font-sans text-lg"
            autoComplete="email"
          />
        </div>
        <div className="flex flex-col gap-4">
          <Input
            type="password"
            id="password"
            placeholder="password"
            ref={passwordRef}
            onChange={handlePasswordChange}
            onPaste={handlePaste}
            className="h-14 rounded border bg-inherit px-4 font-sans text-lg tracking-widest placeholder:tracking-normal"
            autoComplete="current-password"
          />
        </div>
        {(lockedOut || attemptsWarning) && (
          <p
            className="-mt-2 text-sm text-destructive"
            role="status"
            aria-live="polite"
          >
            {attemptsWarning && (
              <span className="block">{attemptsWarning}</span>
            )}
            {lockedOut && (
              <span className="block">
                {waitReason === 'paced'
                  ? nextAttemptMessage(lockSeconds)
                  : countdownMessage(lockSeconds)}
              </span>
            )}
          </p>
        )}
        <SubmitButton
          formAction={signIn}
          className="h-14 rounded px-4 py-3 text-lg"
          pendingText="Signing In..."
          disabled={lockedOut}
        >
          {loading ? 'Signing In...' : 'Sign In'}
        </SubmitButton>
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-14 rounded px-4 py-3 text-lg"
          onClick={signInWithSSO}
          disabled={ssoLoading || lockedOut}
        >
          {ssoLoading ? 'Redirecting...' : 'Sign in with SSO'}
        </Button>
        <div className="mt-4 text-center font-sans text-primary">
          <Link
            href="/password/reset"
            className="text-sm text-gray-700 hover:text-primary"
          >
            Forgot password?
          </Link>
        </div>
      </form>
    </>
  );
}
