import * as React from 'react';
import { Section } from '@react-email/components';
import { UtilityLayout } from '@/emails/_components/UtilityLayout';
import { Text } from '@/emails/_components/EmailText';

interface EmailTemplateProps {
  otpToken: string;
  email: string;
}

export const ResetPasswordEmailTemplate: React.FC<
  Readonly<EmailTemplateProps>
> & { PreviewProps?: EmailTemplateProps } = ({ otpToken, email }) => (
  <UtilityLayout heading="Reset your password">
    <Text>Here&apos;s your one-time token to reset your password.</Text>

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
        {otpToken}
      </Text>
    </Section>

    <Text>
      If you didn&apos;t request a password reset, you can ignore this email.
    </Text>
  </UtilityLayout>
);

ResetPasswordEmailTemplate.PreviewProps = {
  otpToken: '482917',
  email: 'user@example.com',
};

export default ResetPasswordEmailTemplate;
