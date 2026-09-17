'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MFAChallenge from '@/components/auth/MFAChallenge';
import EmailMFAChallenge from '@/components/auth/EmailMFAChallenge';
import DynamicMFAChallenge from '@/components/auth/DynamicMFAChallenge';
import { MfaMethodPickerCard } from '@/components/auth/MfaMethodPickerCard';
import { MfaTotpEnrollCard } from '@/components/auth/MfaTotpEnrollCard';
import { MfaEmailEnrollCard } from '@/components/auth/MfaEmailEnrollCard';
import { MfaCodeCard } from '@/components/auth/MfaCodeCard';
import {
  FailedAttemptsAlert,
  TOTP_FAILED_MESSAGE,
  EMAIL_FAILED_MESSAGE,
} from '@/components/auth/FailedAttemptsAlert';
import PasswordInput from '@/components/auth/PasswordInput';
import SignUpForm from '@/components/auth/SignUpForm';
import VerifyOTP from '@/app/password/verify/VerifyOTP';
import type { MfaType } from '@/hooks/useMfaEnrollment';

const noop = () => {};
const SAMPLE_EMAIL = 'cindy@postsig.com';
const SAMPLE_NAME = 'Cindy Ho';

// Sample TOTP QR + secret used by enrollment preview. Not a real Supabase enrollment.
const SAMPLE_QR_URL =
  'https://api.qrserver.com/v1/create-qr-code/?size=192x192&data=otpauth%3A%2F%2Ftotp%2FPostSig%3Acindy%40postsig.com%3Fsecret%3DJBSWY3DPEHPK3PXP%26issuer%3DPostSig';
const SAMPLE_SECRET = 'JBSWY3DPEHPK3PXP';

export function PreviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center px-8 py-12">
      {children}
    </div>
  );
}

// Sign-out form is provided as the CardFooter slot in the real verify page.
function SignedInAsFooter() {
  return (
    <p className="text-sm text-muted-foreground">
      Signed in as <span className="font-medium">{SAMPLE_EMAIL}</span>.{' '}
      <button type="button" className="underline hover:text-foreground">
        Sign out
      </button>
    </p>
  );
}

// ----- Sign in: Login -----
// COPY of the real LoginForm UI — LoginForm itself uses useAuthStatus to
// auto-redirect authenticated users, which makes it unusable for preview.
// If LoginForm changes layout, update here too.
export function MockLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className="mt-12 flex w-full max-w-md flex-col gap-2 px-8 lg:max-w-lg">
      <Card className="border-border/80 bg-transparent px-4 shadow-sm">
        <CardHeader></CardHeader>
        <CardContent>
          <form
            className="mb-4 flex w-full flex-1 flex-col justify-center gap-4 text-foreground"
            onSubmit={(e) => e.preventDefault()}
          >
            <Image
              src="/PS_Icon.svg"
              alt="PS Icon"
              height={60}
              width={47.78}
              className="mb-8 dark:invert"
            />
            <Input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
              className="h-14 rounded border bg-inherit px-4 font-sans text-lg"
              autoComplete="email"
            />
            <Input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              className="h-14 rounded border bg-inherit px-4 font-sans text-lg tracking-widest placeholder:tracking-normal"
              autoComplete="current-password"
            />
            <Button type="submit" className="h-14 rounded px-4 py-3 text-lg">
              Sign In
            </Button>
            <div className="mt-4 text-center font-sans text-primary">
              <Link
                href="#"
                className="text-sm text-gray-700 hover:text-primary"
              >
                Forgot password?
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ----- Sign in: MFA Verify (TOTP / Email) -----
// Renders the real DynamicMFAChallenge — same component the /mfa/verify page
// uses. Verify/resend actions will fail without an auth session; dismiss the
// toast and inspect the layout.
//
// Failed-attempts variant uses MfaCodeCard + FailedAttemptsAlert directly
// (same primitives the real component uses internally) because there's no
// way to force the component's internal `attempts` state from outside.
export function MockMfaVerify({
  mfaType,
  showFailedAttempts = false,
}: {
  mfaType: 'totp' | 'email';
  showFailedAttempts?: boolean;
}) {
  if (!showFailedAttempts) {
    return (
      <div className="flex w-full flex-1 items-center justify-center">
        <div className="w-full max-w-xl">
          <DynamicMFAChallenge
            mfaType={mfaType}
            userEmail={SAMPLE_EMAIL}
            onSuccess={noop}
            variant="card"
            footer={<SignedInAsFooter />}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 items-center justify-center">
      <div className="w-full max-w-xl">
        <MockMfaVerifyFailed mfaType={mfaType} />
      </div>
    </div>
  );
}

function MockMfaVerifyFailed({ mfaType }: { mfaType: 'totp' | 'email' }) {
  const [value, setValue] = useState('');
  const description =
    mfaType === 'email'
      ? `Enter the 6-digit code we sent to ${SAMPLE_EMAIL}.`
      : 'Enter the 6-digit code from your authenticator app.';
  const failedMessage =
    mfaType === 'email' ? EMAIL_FAILED_MESSAGE : TOTP_FAILED_MESSAGE;

  return (
    <MfaCodeCard
      title="Enter verification code"
      description={description}
      value={value}
      onChange={setValue}
      onSubmit={noop}
      buttonLabel="Verify"
      onResend={mfaType === 'email' ? noop : undefined}
      beforeInput={<FailedAttemptsAlert message={failedMessage} />}
      afterInput={
        mfaType === 'email' ? (
          <p className="text-xs text-muted-foreground">
            Code expires in 10 minutes. Check your spam folder if you don&apos;t
            see it.
          </p>
        ) : undefined
      }
      footer={<SignedInAsFooter />}
    />
  );
}

// ----- Sign up -----
export function MockSignUp() {
  return (
    <div className="mt-16 flex w-full flex-col items-center">
      <SignUpForm
        user={{
          name: SAMPLE_NAME,
          email: SAMPLE_EMAIL,
        }}
      />
    </div>
  );
}

// ----- Sign up: MFA enrollment shells (mirror /app/mfa/enroll/page.tsx chrome) -----
function EnrollShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-16 flex w-full flex-col items-center gap-10">
      <div className="flex w-full max-w-xl flex-col gap-6 font-serif">
        <Image
          src="/PS_Icon.svg"
          alt="PostSig Logo"
          width={40}
          height={40}
          className="dark:invert"
        />
        <div>
          <h2>Secure your account</h2>
          <p className="max-w-md leading-snug">
            Multi-factor authentication is required to protect your account.
          </p>
        </div>
      </div>
      <div className="w-full max-w-xl">{children}</div>
      <p className="w-full max-w-xl text-sm text-muted-foreground">
        Signed in as <span className="font-medium">{SAMPLE_EMAIL}</span>.{' '}
        <button type="button" className="underline hover:text-foreground">
          Sign out
        </button>
      </p>
    </div>
  );
}

export function MockEnrollMethod() {
  const [selected, setSelected] = useState<MfaType>('totp');
  return (
    <EnrollShell>
      <MfaMethodPickerCard
        selectedMfaType={selected}
        onSelectedMfaTypeChange={setSelected}
        userEmail={SAMPLE_EMAIL}
        onStart={noop}
      />
    </EnrollShell>
  );
}

export function MockEnrollTotp() {
  const [code, setCode] = useState('');
  return (
    <EnrollShell>
      <MfaTotpEnrollCard
        qrCode={SAMPLE_QR_URL}
        secret={SAMPLE_SECRET}
        verificationCode={code}
        onVerificationCodeChange={setCode}
        onVerify={noop}
        onCancel={noop}
      />
    </EnrollShell>
  );
}

export function MockEnrollEmail() {
  const [code, setCode] = useState('');
  return (
    <EnrollShell>
      <MfaEmailEnrollCard
        userEmail={SAMPLE_EMAIL}
        verificationCode={code}
        onVerificationCodeChange={setCode}
        onVerify={noop}
        onCancel={noop}
      />
    </EnrollShell>
  );
}

// ----- Forgot password shared shell (mirrors /app/password/layout.tsx) -----
function PasswordRouteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-12 flex w-full max-w-md flex-col gap-2 px-8 sm:max-w-lg">
      <Card className="border-border/80 bg-transparent px-4 shadow-sm">
        <CardHeader></CardHeader>
        <CardContent>
          <Link href="#" className="float-left">
            <Image
              src="/PS_Icon.svg"
              alt="PS Icon"
              height={60}
              width={47.78}
              className="mb-8 dark:invert"
            />
          </Link>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

// ----- Forgot password: Request -----
// COPY of /app/password/reset/page.tsx form. The real page is a server
// component using `formAction` + server actions, no extractable client UI.
export function MockForgotRequest() {
  return (
    <PasswordRouteShell>
      <form
        className="mb-4 flex w-full flex-1 flex-col justify-center gap-4 text-foreground"
        onSubmit={(e) => e.preventDefault()}
      >
        <Input
          className="h-14 rounded border bg-inherit px-4 font-sans text-lg"
          name="email"
          placeholder="email"
        />
        <Button className="h-14 rounded px-4 py-3 text-lg">
          Request password reset
        </Button>
        <div className="mt-4 font-sans text-primary">
          <Link href="#" className="text-sm text-gray-700 hover:text-primary">
            &larr; Back to login
          </Link>
        </div>
      </form>
    </PasswordRouteShell>
  );
}

// ----- Forgot password: New password -----
// COPY of /app/password/update/PasswordUpdate.tsx form UI. The real page
// does a getMFAStatus check + MFA gate that we can't render in preview.
export function MockForgotUpdate() {
  const [password, setPassword] = useState('');
  const [isPasswordValid, setIsPasswordValid] = useState(false);
  return (
    <PasswordRouteShell>
      <form
        className="mb-4 flex w-full flex-1 flex-col justify-center gap-4 text-foreground"
        onSubmit={(e) => e.preventDefault()}
      >
        <h3>Update your password</h3>
        <PasswordInput
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onValidationChange={setIsPasswordValid}
          placeholder="New password"
          showValidation
        />
        <Button
          type="button"
          className="h-14 rounded px-4 py-3 text-lg"
          disabled={!isPasswordValid}
        >
          Update password
        </Button>
      </form>
    </PasswordRouteShell>
  );
}

// ----- Forgot password: Verify (OTP) -----
export function MockForgotVerify() {
  return (
    <PasswordRouteShell>
      <VerifyOTP
        email={SAMPLE_EMAIL}
        searchParams={{
          email: SAMPLE_EMAIL,
          message: '',
          error: null,
          error_description: null,
        }}
      />
    </PasswordRouteShell>
  );
}

// ----- Sign-in challenge variants -----
// Real MFAChallenge — safe to mount, no side effects until submit.
export function MockMfaChallenge({ variant }: { variant: 'card' | 'inline' }) {
  return (
    <div className="mt-12 w-full max-w-xl">
      <MFAChallenge onSuccess={noop} onCancel={noop} variant={variant} />
    </div>
  );
}

// EmailMFAChallenge fires a real `challengeEmailMFA` action on mount.
// In preview that will toast a failure — dismiss and inspect the layout.
export function MockEmailMfaChallenge({
  variant,
}: {
  variant: 'card' | 'inline';
}) {
  return (
    <div className="mt-12 w-full max-w-xl">
      <EmailMFAChallenge
        userEmail={SAMPLE_EMAIL}
        onSuccess={noop}
        variant={variant}
      />
    </div>
  );
}
