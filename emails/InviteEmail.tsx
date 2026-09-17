import * as React from 'react';
import { Link } from '@react-email/components';
import { UtilityLayout } from '@/emails/_components/UtilityLayout';
import { Text } from '@/emails/_components/EmailText';
import { CTAButton } from '@/emails/_components/CTAButton';
import { APP_BASE_URL } from '@/emails/_components/env';

interface EmailTemplateProps {
  name?: string;
  token?: string;
  email?: string;
  organization?: string;
  otpType?: string;
  next?: string;
  invitedBy?: string | null | undefined;
}

export default function InviteEmailTemplate({
  name,
  token,
  organization,
  otpType,
  next,
  invitedBy,
}: Readonly<EmailTemplateProps>) {
  const greeting = name ? `Hi ${name.split(' ')[0]},` : 'Hi,';
  const params = new URLSearchParams();
  if (next) params.set('next', next);
  if (otpType) params.set('type', otpType);
  const query = params.toString();
  const inviteUrl = `${APP_BASE_URL}/invites/${token}${query ? `?${query}` : ''}`;
  const plainInviteUrl = `${APP_BASE_URL}/invites/${token}`;
  const heading = invitedBy
    ? `${invitedBy} invited you to join PostSig`
    : "You're invited to join PostSig";

  return (
    <UtilityLayout heading={heading}>
      <Text>{greeting}</Text>

      <Text>
        You&apos;ve been invited to join{' '}
        <strong>{organization ? organization : 'Organization Name'}</strong> on
        PostSig.
      </Text>

      <Text>
        <CTAButton href={inviteUrl}>Join Org</CTAButton>
      </Text>

      <Text style={{ wordBreak: 'break-all' }}>
        Or copy and paste this url into your browser:
        <br />
        <Link href={plainInviteUrl}>{plainInviteUrl}</Link>
      </Text>

      <Text>This invitation is valid for 24 hours.</Text>
    </UtilityLayout>
  );
}
