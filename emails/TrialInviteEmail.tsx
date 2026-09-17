import * as React from 'react';
import { UtilityLayout } from '@/emails/_components/UtilityLayout';
import { Text } from '@/emails/_components/EmailText';
import { CTAButton } from '@/emails/_components/CTAButton';
import { APP_BASE_URL } from '@/emails/_components/env';

interface EmailTemplateProps {
  token: string;
  otpType?: string;
}

export const TrialInviteEmailTemplate: React.FC<
  Readonly<EmailTemplateProps>
> = ({ token, otpType = 'invite' }) => (
  <UtilityLayout heading="PostSig Trial">
    <Text>
      Congrats! You are now welcome to create your PostSig Trial Account. This
      will allow you to upload a limited number of documents and preview
      PostSig&apos;s application.
    </Text>

    <Text>
      <CTAButton
        href={`${APP_BASE_URL}/api/auth/confirm?token_hash=${token}&type=${otpType}&next=/signup/trial`}
      >
        Sign Up
      </CTAButton>
    </Text>

    <Text>
      If you run into any issues or have other questions, feel free to email us
      at support@postsig.com.
    </Text>

    <Text>—PostSig Team</Text>
  </UtilityLayout>
);

export default TrialInviteEmailTemplate;
