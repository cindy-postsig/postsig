import * as React from 'react';
import { Section } from '@react-email/components';
import { AppLayout } from '@/emails/_components/AppLayout';
import { CTAButton } from '@/emails/_components/CTAButton';
import { APP_BASE_URL } from '@/emails/_components/env';

type EmailTemplateProps = {
  noticePeriod?: string;
  contracts?: {
    vendor: string;
    product: string;
    additionalProductCount: number;
    contractType: string;
    cancelBy: string;
    endDate: string;
    currentBudget: string;
    projectedBudget: string;
    tcv: string;
    renewalType: string;
  }[];
};

const previewData = {
  noticePeriod: '30',
  contracts: [
    {
      vendor: 'Example Corp',
      product: 'Enterprise License',
      additionalProductCount: 2,
      contractType: 'ADD',
      cancelBy: '2024-12-31',
      endDate: '2025-01-31',
      currentBudget: '$50,000',
      projectedBudget: '$50,000',
      tcv: '$50,000',
      renewalType: 'One-Time',
    },
    {
      vendor: 'Tech Solutions',
      product: 'Cloud Services',
      additionalProductCount: 0,
      contractType: 'SO',
      cancelBy: '2024-06-30',
      endDate: '2024-07-31',
      currentBudget: '$10,000',
      projectedBudget: '$10,000',
      tcv: '$10,000',
      renewalType: 'Auto',
    },
  ],
};

export default function NotificationEmail({
  noticePeriod = previewData.noticePeriod,
  contracts = previewData.contracts,
}: EmailTemplateProps) {
  return (
    <AppLayout maxWidth={800} linkedLogo>
      <Section className="mt-6 text-left">
        <h1
          style={{
            fontFamily: 'FK Grotesk, sans-serif',
            fontSize: '28px',
            fontWeight: 500,
          }}
        >
          Contract Status Report
        </h1>
        <p
          style={{
            fontSize: '14px',
            lineHeight: 1.5,
            maxWidth: '700px',
          }}
        >
          Your latest Contracts Status Report is now available. This report
          provides an updated overview of all active contracts that are
          approaching their renewal period or expiration date.
        </p>
      </Section>

      <Section
        style={{
          marginTop: '20px',
          overflowX: 'auto',
        }}
      >
        <h3
          style={{
            fontWeight: 500,
            fontFamily: 'FK Grotesk, sans-serif',
          }}
        >
          Expiring within {noticePeriod} days
        </h3>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
          }}
        >
          <tbody>
            <tr>
              <td
                style={{ padding: '10px', paddingLeft: '0', fontSize: '12px' }}
              >
                Vendor
              </td>
              <td style={{ padding: '10px', fontSize: '12px' }}>Product</td>
              <td style={{ padding: '10px', fontSize: '12px' }}>Type</td>
              <td style={{ padding: '10px', fontSize: '12px' }}>Renewal</td>
              <td style={{ padding: '10px', fontSize: '12px' }}>Cancel By</td>
              <td style={{ padding: '10px', fontSize: '12px' }}>End Date</td>
              <td style={{ padding: '10px', fontSize: '12px' }}>
                Current Spend
              </td>
              <td style={{ padding: '10px', fontSize: '12px' }}>
                Projected Spend
              </td>
              <td
                style={{
                  padding: '10px',
                  paddingRight: '0',
                  fontSize: '12px',
                }}
              >
                TCV
              </td>
            </tr>
            {contracts.map((contract, index) => (
              <tr
                key={index}
                style={{
                  borderTop: '1px solid rgba(0,0,0,0.1)',
                }}
              >
                <td
                  style={{
                    fontWeight: 'bold',
                    padding: '10px',
                    paddingLeft: '0',
                    fontSize: '14px',
                  }}
                >
                  {contract.vendor}
                </td>
                {contract.additionalProductCount ? (
                  <td style={{ padding: '10px', fontSize: '14px' }}>
                    {contract.product} + {contract.additionalProductCount}
                  </td>
                ) : (
                  <td style={{ padding: '10px', fontSize: '14px' }}>
                    {contract.product}
                  </td>
                )}
                <td style={{ padding: '10px', fontSize: '14px' }}>
                  {contract.contractType}
                </td>
                <td style={{ padding: '10px', fontSize: '14px' }}>
                  {contract.renewalType}
                </td>
                <td style={{ padding: '10px', fontSize: '14px' }}>
                  {contract.cancelBy}
                </td>
                <td style={{ padding: '10px', fontSize: '14px' }}>
                  {contract.endDate}
                </td>
                <td style={{ padding: '10px', fontSize: '14px' }}>
                  {contract.currentBudget}
                </td>
                <td style={{ padding: '10px', fontSize: '14px' }}>
                  {contract.projectedBudget}
                </td>
                <td
                  style={{
                    padding: '10px',
                    paddingRight: '0',
                    fontSize: '14px',
                  }}
                >
                  {contract.tcv}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section className="mt-6">
        <CTAButton href={`${APP_BASE_URL}/reports`} size="sm">
          View and Download Full Report
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
        <p>
          <a
            href={`${APP_BASE_URL}/settings/alerts`}
            className="text-[#3A2FA9] no-underline"
          >
            Click here to manage your alert settings
          </a>
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
}
