import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MockEmailMfaChallenge,
  MockEnrollEmail,
  MockEnrollMethod,
  MockEnrollTotp,
  MockForgotRequest,
  MockForgotUpdate,
  MockForgotVerify,
  MockLogin,
  MockMfaChallenge,
  MockMfaVerify,
  MockSignUp,
  PreviewShell,
} from './_components';

// Dev-only design playground for the auth screens. Returns 404 in production.
export const dynamic = 'force-dynamic';

const STATES = [
  'index',
  // Sign in
  'signin_login',
  'signin_verify_totp',
  'signin_verify_totp_failed',
  'signin_verify_email',
  'signin_verify_email_failed',
  // Sign up
  'signup_form',
  'signup_method',
  'signup_enroll_totp',
  'signup_enroll_email',
  // Forgot password
  'forgot_request',
  'forgot_verify',
  'forgot_update',
  // Challenge variants
  'mfa_challenge_card',
  'mfa_challenge_inline',
  'email_challenge_card',
  'email_challenge_inline',
] as const;

type PreviewState = (typeof STATES)[number];

export default async function AuthPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { state: rawState } = await searchParams;
  const state: PreviewState = (STATES as readonly string[]).includes(
    rawState ?? '',
  )
    ? (rawState as PreviewState)
    : 'index';

  switch (state) {
    // Sign in
    case 'signin_login':
      return (
        <PreviewShell>
          <MockLogin />
        </PreviewShell>
      );
    case 'signin_verify_totp':
      return (
        <PreviewShell>
          <MockMfaVerify mfaType="totp" />
        </PreviewShell>
      );
    case 'signin_verify_totp_failed':
      return (
        <PreviewShell>
          <MockMfaVerify mfaType="totp" showFailedAttempts />
        </PreviewShell>
      );
    case 'signin_verify_email':
      return (
        <PreviewShell>
          <MockMfaVerify mfaType="email" />
        </PreviewShell>
      );
    case 'signin_verify_email_failed':
      return (
        <PreviewShell>
          <MockMfaVerify mfaType="email" showFailedAttempts />
        </PreviewShell>
      );

    // Sign up
    case 'signup_form':
      return (
        <PreviewShell>
          <MockSignUp />
        </PreviewShell>
      );
    case 'signup_method':
      return (
        <PreviewShell>
          <MockEnrollMethod />
        </PreviewShell>
      );
    case 'signup_enroll_totp':
      return (
        <PreviewShell>
          <MockEnrollTotp />
        </PreviewShell>
      );
    case 'signup_enroll_email':
      return (
        <PreviewShell>
          <MockEnrollEmail />
        </PreviewShell>
      );

    // Forgot password
    case 'forgot_request':
      return (
        <PreviewShell>
          <MockForgotRequest />
        </PreviewShell>
      );
    case 'forgot_verify':
      return (
        <PreviewShell>
          <MockForgotVerify />
        </PreviewShell>
      );
    case 'forgot_update':
      return (
        <PreviewShell>
          <MockForgotUpdate />
        </PreviewShell>
      );

    // Challenge variants
    case 'mfa_challenge_card':
      return (
        <PreviewShell>
          <MockMfaChallenge variant="card" />
        </PreviewShell>
      );
    case 'mfa_challenge_inline':
      return (
        <PreviewShell>
          <MockMfaChallenge variant="inline" />
        </PreviewShell>
      );
    case 'email_challenge_card':
      return (
        <PreviewShell>
          <MockEmailMfaChallenge variant="card" />
        </PreviewShell>
      );
    case 'email_challenge_inline':
      return (
        <PreviewShell>
          <MockEmailMfaChallenge variant="inline" />
        </PreviewShell>
      );

    case 'index':
    default:
      return <IndexCard />;
  }
}

function IndexCard() {
  return (
    <PreviewShell>
      <Card className="mt-16 w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg/tight">Auth screen preview</CardTitle>
          <p className="text-xs text-muted-foreground">
            Dev-only. Mock data. Returns 404 in production.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Most previews render the real components. A few (Login, Password
            reset request, Password update, and the failed-attempts verify
            variants) are static copies because the originals don&apos;t have
            extractable client UI or expose internal state — update these in
            <code className="ml-1 text-foreground">
              app/auth/preview/_components.tsx
            </code>{' '}
            if their source changes.
          </p>
          <p>
            Email-based challenge components fire a real action on mount —
            dismiss the failure toast and inspect the layout.
          </p>
        </CardContent>
      </Card>
    </PreviewShell>
  );
}
