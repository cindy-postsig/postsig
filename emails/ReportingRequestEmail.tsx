import * as React from 'react';
import { Link, Section } from '@react-email/components';
import { UtilityLayout } from '@/emails/_components/UtilityLayout';
import { Text } from '@/emails/_components/EmailText';
import { CTAButton } from '@/emails/_components/CTAButton';

interface ReportingRequestEmailProps {
  senderName?: string | null;
  senderOrg?: string | null;
  periodLabel: string;
  requestType: 'kpi' | 'reporting_pack';
  includesDocuments?: boolean;
  message?: string | null;
  actionUrl: string;
}

export default function ReportingRequestEmail({
  senderName,
  senderOrg,
  periodLabel,
  requestType,
  includesDocuments = false,
  message,
  actionUrl,
}: Readonly<ReportingRequestEmailProps>) {
  const noun =
    requestType === 'kpi'
      ? includesDocuments
        ? 'KPIs and documents'
        : 'KPIs'
      : 'a reporting pack';
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
  const heading = `${from} requested ${noun} for ${periodLabel}`;

  const attribution = senderName ?? senderOrg ?? 'Your investor';
  const initialParts = attribution.trim().split(/\s+/).filter(Boolean);
  const initials =
    initialParts.length >= 2
      ? (
          initialParts[0][0] + initialParts[initialParts.length - 1][0]
        ).toUpperCase()
      : attribution.trim().slice(0, 2).toUpperCase();

  return (
    <UtilityLayout heading={heading}>
      {message ? (
        <Section
          style={{
            border: '1px solid #e4e4e7',
            borderRadius: '4px',
            padding: '16px',
            margin: '24px 0',
          }}
        >
          <table
            role="presentation"
            cellPadding={0}
            cellSpacing={0}
            style={{ margin: '0 0 10px' }}
          >
            <tbody>
              <tr>
                <td style={{ paddingRight: '10px', verticalAlign: 'middle' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '12px',
                      backgroundColor: '#f0f0f1',
                      color: '#18181b',
                      fontSize: '11px',
                      fontWeight: 500,
                      lineHeight: '24px',
                      textAlign: 'center',
                    }}
                  >
                    {initials}
                  </div>
                </td>
                <td style={{ verticalAlign: 'middle' }}>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#18181b',
                    }}
                  >
                    {attribution}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <Text
            style={{
              margin: 0,
              padding: '0 0 0 34px',
              whiteSpace: 'pre-line',
            }}
          >
            {message}
          </Text>
        </Section>
      ) : null}

      <Text>
        <CTAButton href={actionUrl}>{cta}</CTAButton>
      </Text>

      <Text style={{ wordBreak: 'break-all' }}>
        Or copy and paste this url into your browser:
        <br />
        <Link href={actionUrl}>{actionUrl}</Link>
      </Text>

      <Text>This secure link signs you in and is valid for 24 hours.</Text>
    </UtilityLayout>
  );
}

ReportingRequestEmail.PreviewProps = {
  senderName: 'Jane Smith',
  senderOrg: 'ABC Ventures',
  periodLabel: 'Q2 2026',
  requestType: 'kpi',
  includesDocuments: false,
  message:
    'Please include the updated headcount and runway figures this quarter.',
  actionUrl:
    'https://portco.postsig.com/auth/confirm?token_hash=preview&type=magiclink&next=%2Fr%2Fabc123',
} satisfies ReportingRequestEmailProps;
