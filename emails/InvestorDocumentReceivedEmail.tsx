import { Section } from '@react-email/components';
import * as React from 'react';
import { AppLayout } from '@/emails/_components/AppLayout';
import { CTAButton } from '@/emails/_components/CTAButton';

interface InvestorDocumentReceivedEmailProps {
  appUrl: string;
  userName: string;
  fileNames: string[];
}

export const InvestorDocumentReceivedEmail = ({
  appUrl,
  userName,
  fileNames,
}: InvestorDocumentReceivedEmailProps) => {
  return (
    <AppLayout
      maxWidth={600}
      linkedLogo
      preview="Your documents are currently being processed."
    >
      <Section className="mt-6 text-left">
        <h1
          style={{
            fontFamily: 'FK Grotesk, sans-serif',
            fontSize: '28px',
            fontWeight: 500,
            margin: 0,
          }}
        >
          Your documents are processing
        </h1>
        <p style={{ fontSize: '14px', lineHeight: 1.5, marginTop: '16px' }}>
          Dear {userName},
        </p>
        <p style={{ fontSize: '14px', lineHeight: 1.5 }}>
          Your documents are currently being processed. You can view the status
          of your documents below.
        </p>
      </Section>

      {fileNames.length > 0 && (
        <Section style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
            Files uploaded:
          </p>
          <ul style={{ margin: '8px 0 16px 0', paddingLeft: '20px' }}>
            {fileNames.map((name, index) => (
              <li
                key={`${name}-${index}`}
                style={{ fontSize: '14px', lineHeight: 1.5 }}
              >
                {name}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section className="mt-6">
        <CTAButton href={`${appUrl}/investor/documents`} size="sm">
          View Documents
        </CTAButton>
      </Section>

      <Section
        style={{
          marginTop: '60px',
          fontSize: '11px',
          color: '#6B7280',
          textAlign: 'left',
          lineHeight: 1.5,
          borderTop: '1px solid rgba(0,0,0,.1)',
          paddingTop: '20px',
        }}
      >
        <p>
          This is an automated message, please do not reply to this email. For
          assistance, contact our support team at{' '}
          <a
            href={'mailto:support@postsig.com'}
            className="text-[#3A2FA9] no-underline"
          >
            support@postsig.com
          </a>
          .
        </p>
        <p>
          To protect your personal information, please don&apos;t reply to this
          message. PostSig won&apos;t ask for confidential information in an
          email.
        </p>
      </Section>
      <Section
        style={{
          marginTop: '10px',
          fontSize: '11px',
          color: '#6B7280',
          textAlign: 'left',
          lineHeight: 1.5,
        }}
      >
        <p>
          <b>Confidentiality Notice</b>
          <br />
          This email and any attachments are confidential and may contain
          privileged information. If you are not the intended recipient, please
          delete the email and notify the sender immediately. Unauthorized use,
          disclosure, or copying of this email is strictly prohibited.
        </p>
      </Section>
      <Section
        style={{
          marginTop: '10px',
          fontSize: '11px',
          color: '#6B7280',
          textAlign: 'left',
          lineHeight: 1.5,
        }}
      >
        <p>
          PostSig, Inc.{' '}
          <a
            href={'https://postsig.com'}
            className="text-[#3A2FA9] no-underline"
          >
            postsig.com
          </a>
        </p>
      </Section>
    </AppLayout>
  );
};

InvestorDocumentReceivedEmail.PreviewProps = {
  appUrl: 'https://app.postsig.com',
  userName: 'Jane Doe',
  fileNames: [
    'Q4_LP_Statement_2025.pdf',
    'Capital_Account_Summary.xlsx',
    'Sequoia_Aumni_Export.zip',
  ],
} satisfies InvestorDocumentReceivedEmailProps;

export default InvestorDocumentReceivedEmail;
