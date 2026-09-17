'use client';

import * as React from 'react';
import { QrCode, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MfaType } from '@/hooks/useMfaEnrollment';

interface MfaMethodPickerProps {
  value: MfaType;
  onChange: (value: MfaType) => void;
  userEmail?: string;
  /** Show the "Most Secure" badge on the TOTP option. */
  showRecommendedBadge?: boolean;
}

interface MethodCardProps {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
}

function MethodCard({
  selected,
  onClick,
  icon,
  title,
  description,
}: MethodCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`cursor-pointer rounded-md border p-4 text-left transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
          : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-blue-600 dark:text-blue-400">{icon}</div>
        <div className="flex-1 text-base">
          {title}
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>
      </div>
    </button>
  );
}

export function MfaMethodPicker({
  value,
  onChange,
  userEmail,
  showRecommendedBadge,
}: MfaMethodPickerProps) {
  return (
    <div className="grid gap-3">
      <MethodCard
        selected={value === 'totp'}
        onClick={() => onChange('totp')}
        icon={<QrCode className="h-5 w-5" />}
        title={
          <div className="flex items-center gap-2">
            <p className="font-medium">Authenticator App (TOTP)</p>
            {showRecommendedBadge && (
              <Badge variant="secondary" size={'xs'}>
                Most Secure
              </Badge>
            )}
          </div>
        }
        description="Use Google Authenticator, Microsoft Authenticator, Authy, or any TOTP-compatible app."
      />
      <MethodCard
        selected={value === 'email'}
        onClick={() => onChange('email')}
        icon={<Mail className="h-5 w-5" />}
        title={<p className="font-medium">Email Verification</p>}
        description={
          userEmail ? (
            <>
              Receive verification codes via email to{' '}
              <span className="font-medium">{userEmail}</span>.
            </>
          ) : (
            <>Receive verification codes via email.</>
          )
        }
      />
    </div>
  );
}
