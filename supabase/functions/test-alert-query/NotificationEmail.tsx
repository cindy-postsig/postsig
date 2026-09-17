import * as React from 'npm:react@^18.3.1';
import {
  Html,
  Head,
  Body,
  Container,
  Font,
  Img,
  Section,
} from 'npm:@react-email/components';
import { Tailwind } from 'npm:@react-email/tailwind';

type EmailTemplateProps = {
  noticePeriod: string;
  contracts: {
    vendor: string;
    product: string;
    additionalProductCount: number;
    contractType: string;
    cancelBy: string;
    endDate: string;
    currentBudget: string;
    projectedBudget: string;
    tcv: string;
  }[];
};

const appUrl = Deno.env.get('APP_URL');
const defaultUrl = appUrl ? `https://${appUrl}` : 'http://localhost:3000';

export const NotificationEmail = ({
  noticePeriod,
  contracts,
}: EmailTemplateProps) => (
  <Html lang="en">
    <Head>
      <Font
        fontFamily="FK Grotesk"
        fallbackFontFamily="sans-serif"
        webFont={{
          url: `${defaultUrl}/fonts/FKGrotesk-Medium.woff2`,
          format: 'woff2',
        }}
        fontWeight={400}
        fontStyle="normal"
      />
    </Head>
    <Tailwind>
      <Body className="bg-[#f5f5f6] px-4 py-6">
        <Container className="mx-auto max-w-[800px]">
          {/* Logo */}
          <a href="https://postsig.com">
            <Img
              src={`${defaultUrl}/PostSig.png`}
              alt="PostSig"
              width="122"
              height="30"
            />
          </a>

          {/* Header */}
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

          {/* Contracts Table */}
          <Section
            style={{
              marginTop: '20px',
              overflowX: 'auto',
            }}
          >
            <h3
              style={{ fontWeight: 500, fontFamily: 'FK Grotesk, sans-serif' }}
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
                    style={{
                      padding: '10px',
                      paddingLeft: '0',
                      fontSize: '12px',
                    }}
                  >
                    Vendor
                  </td>
                  <td
                    style={{
                      padding: '10px',
                      fontSize: '12px',
                    }}
                  >
                    Product
                  </td>
                  <td
                    style={{
                      padding: '10px',
                      fontSize: '12px',
                    }}
                  >
                    Cancel By
                  </td>
                  <td
                    style={{
                      padding: '10px',
                      fontSize: '12px',
                    }}
                  >
                    End Date
                  </td>
                  <td
                    style={{
                      padding: '10px',
                      fontSize: '12px',
                    }}
                  >
                    Current Spend
                  </td>
                  <td
                    style={{
                      padding: '10px',
                      fontSize: '12px',
                    }}
                  >
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
            <a
              href={`${defaultUrl}/reports`}
              className="font-bold	mt-6 inline-block rounded-sm bg-[#160F5B] px-7 py-2 font-label text-sm text-white no-underline"
            >
              View and Download Full Report
            </a>
          </Section>

          {/* Footer */}
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
              This is an automated message; please do not reply to this email.
              For assistance, contact our support team at support@postsig.com.
            </p>
            <p>
              To protect your personal information,please don&apos;t reply to
              this message. PostSig won&apos;t ask for confidential information
              in an email.
            </p>
            <p>
              To <b>modify</b> or <b>cancel your alerts</b>, sign on and go to
              Settings and then Alerts.
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
              privileged information. If you are not the intended recipient,
              please delete the email and notify the sender immediately.
              Unauthorized use, disclosure, or copying of this email is strictly
              prohibited.
            </p>
          </Section>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);
