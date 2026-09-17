import * as React from 'react';
import { Section } from '@react-email/components';
import { UtilityLayout } from '@/emails/_components/UtilityLayout';
import { Text } from '@/emails/_components/EmailText';

interface EmailMFAVerificationTemplateProps {
  code: string;
  type: 'setup' | 'login';
}

export function EmailMFAVerificationTemplate({
  code,
  type,
}: EmailMFAVerificationTemplateProps) {
  const heading =
    type === 'setup'
      ? 'Complete your email MFA setup'
      : 'Your login verification code';

  const intro =
    type === 'setup'
      ? 'Use the code below to finish setting up email-based multi-factor authentication on your PostSig account.'
      : 'Use the code below to finish signing in to your PostSig account.';

  const footerNote =
    type === 'setup'
      ? 'Once verified, your account will be protected with email-based multi-factor authentication.'
      : 'Enter this code in the PostSig login screen to complete your authentication.';

  return (
    <UtilityLayout heading={heading}>
      <Text>{intro}</Text>

      <Section
        style={{
          border: '1px solid rgba(0,0,0,.15)',
          borderRadius: '4px',
          padding: '24px',
          textAlign: 'center',
          margin: '20px 0',
        }}
      >
        <Text
          style={{
            fontSize: '36px',
            fontWeight: 500,
            letterSpacing: '4px',
            color: '#000000',
            fontVariantNumeric: 'tabular-nums',
            margin: 0,
          }}
        >
          {code}
        </Text>
      </Section>

      <Text>
        This code expires in <strong>10 minutes</strong>.
      </Text>

      <Text>{footerNote}</Text>

      <Text>
        If you didn&apos;t request this code, you can safely ignore this email.
        Never share this code with anyone.
      </Text>
    </UtilityLayout>
  );
}

EmailMFAVerificationTemplate.PreviewProps = {
  code: '482917',
  type: 'login',
} satisfies EmailMFAVerificationTemplateProps;

export default EmailMFAVerificationTemplate;
