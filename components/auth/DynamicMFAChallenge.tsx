'use client';

import MFAChallenge from './MFAChallenge';
import EmailMFAChallenge from './EmailMFAChallenge';

interface DynamicMFAChallengeProps {
  mfaType?: 'totp' | 'email';
  userEmail?: string;
  onSuccess: () => void;
  onCancel?: () => void;
  variant?: 'card' | 'inline';
  skipTrustDeviceOption?: boolean;
  hideLoginButton?: boolean;
  footer?: React.ReactNode;
}

export default function DynamicMFAChallenge({
  mfaType = 'totp',
  userEmail,
  onSuccess,
  onCancel,
  variant = 'card',
  skipTrustDeviceOption,
  hideLoginButton = false,
  footer,
}: DynamicMFAChallengeProps) {
  if (mfaType === 'email') {
    return (
      <EmailMFAChallenge
        userEmail={userEmail}
        onSuccess={onSuccess}
        onBack={onCancel}
        variant={variant}
        skipTrustDeviceOption={skipTrustDeviceOption}
        hideLoginButton={hideLoginButton}
        footer={footer}
      />
    );
  }

  return (
    <MFAChallenge
      onSuccess={onSuccess}
      onCancel={onCancel}
      variant={variant}
      skipTrustDeviceOption={skipTrustDeviceOption}
      footer={footer}
    />
  );
}
