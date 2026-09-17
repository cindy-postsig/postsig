import * as React from 'react';
import { Link } from '@react-email/components';
import { UtilityLayout } from '@/emails/_components/UtilityLayout';
import { Text } from '@/emails/_components/EmailText';
import { CTAButton } from '@/emails/_components/CTAButton';

interface ReportingReminderEmailProps {
  senderName?: string | null;
  senderOrg?: string | null;
  periodLabel: string;
  requestType: 'kpi' | 'reporting_pack';
  includesDocuments?: boolean;
  actionUrl: string;
}

// Unlike ReportingRequestEmail, the action URL is a plain portco link — never a
// magic login link. Reminders may sit in an inbox for days and can be re-sent,
// so they must not carry a token that signs the recipient in.
export default function ReportingReminderEmail({
  senderName,
  senderOrg,
  periodLabel,
  requestType,
  includesDocuments = false,
  actionUrl,
}: Readonly<ReportingReminderEmailProps>) {
  const noun =
    requestType === 'kpi'
      ? includesDocuments
        ? 'KPIs and documents'
        : 'KPIs'
      : 'reporting pack';
  const cta =
    requestType === 'kpi'
      ? includesDocuments
        ? 'Submit KPIs and documents'
        : 'Submit KPIs'
      : 'Submit reporting pack';
  const from = senderName
    ? senderOrg
      ? `${senderName} (${senderOrg})`
      : senderName
    : (senderOrg ?? 'Your investor');
  const heading = `Reminder: ${from} is waiting on your ${noun} for ${periodLabel}`;

  return (
    <UtilityLayout heading={heading}>
      <Text>
        This is a friendly reminder that the {noun} requested for {periodLabel}{' '}
        {requestType === 'kpi' ? 'have' : 'has'} not been submitted yet.
      </Text>

      <Text>
        <CTAButton href={actionUrl}>{cta}</CTAButton>
      </Text>

      <Text style={{ wordBreak: 'break-all' }}>
        Or copy and paste this url into your browser:
        <br />
        <Link href={actionUrl}>{actionUrl}</Link>
      </Text>

      <Text>Sign in with your email address to access the request.</Text>
    </UtilityLayout>
  );
}

ReportingReminderEmail.PreviewProps = {
  senderName: 'Jane Smith',
  senderOrg: 'ABC Ventures',
  periodLabel: 'Q2 2026',
  requestType: 'kpi',
  includesDocuments: false,
  actionUrl: 'https://portco.postsig.com/r/abc123',
} satisfies ReportingReminderEmailProps;
