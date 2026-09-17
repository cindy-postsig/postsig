'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  state: string;
  label: string;
  step?: number;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    heading: '',
    items: [{ state: 'index', label: 'Overview' }],
  },
  {
    heading: 'Sign in',
    items: [
      { step: 1, state: 'signin_login', label: 'Login' },
      { step: 2, state: 'signin_verify_totp', label: 'Verify — TOTP' },
      {
        step: 2,
        state: 'signin_verify_totp_failed',
        label: 'Verify — TOTP (failed)',
      },
      { step: 2, state: 'signin_verify_email', label: 'Verify — Email' },
      {
        step: 2,
        state: 'signin_verify_email_failed',
        label: 'Verify — Email (failed)',
      },
    ],
  },
  {
    heading: 'Sign up',
    items: [
      { step: 1, state: 'signup_form', label: 'Sign up' },
      { step: 2, state: 'signup_method', label: 'Pick MFA method' },
      { step: 3, state: 'signup_enroll_totp', label: 'Set up authenticator' },
      { step: 3, state: 'signup_enroll_email', label: 'Set up email' },
    ],
  },
  {
    heading: 'Forgot password',
    items: [
      { step: 1, state: 'forgot_request', label: 'Request reset' },
      { step: 2, state: 'forgot_verify', label: 'Verify code' },
      { step: 3, state: 'forgot_update', label: 'New password' },
    ],
  },
  {
    heading: 'Challenge variants',
    items: [
      { state: 'mfa_challenge_card', label: 'MFAChallenge — card' },
      { state: 'mfa_challenge_inline', label: 'MFAChallenge — inline' },
      { state: 'email_challenge_card', label: 'EmailMFAChallenge — card' },
      {
        state: 'email_challenge_inline',
        label: 'EmailMFAChallenge — inline',
      },
    ],
  },
];

export function PreviewSidebar() {
  const searchParams = useSearchParams();
  const current = searchParams.get('state') ?? 'index';

  return (
    <aside className="w-60 shrink-0 border-r bg-muted/30 p-4">
      <h3 className="font-medium mb-4 text-sm">Auth Preview</h3>
      <nav className="space-y-4">
        {GROUPS.map((group, idx) => (
          <div key={idx} className="space-y-1">
            {group.heading && (
              <p className="font-medium px-3 text-xs uppercase tracking-wide text-muted-foreground">
                {group.heading}
              </p>
            )}
            {group.items.map((item) => {
              const href =
                item.state === 'index'
                  ? '/auth/preview'
                  : `/auth/preview?state=${item.state}`;
              const active = current === item.state;
              return (
                <Link
                  key={item.state}
                  href={href}
                  className={cn(
                    'flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors hover:bg-muted',
                    active &&
                      'font-medium bg-muted text-foreground hover:bg-muted',
                  )}
                >
                  {item.step !== undefined && (
                    <span className="w-3 text-right text-xs text-muted-foreground">
                      {item.step}.
                    </span>
                  )}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
