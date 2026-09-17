import * as React from 'npm:react@^18.3.1';
import {
  Html,
  Head,
  Body,
  Container,
  Font,
  Img,
  Section,
  Button,
} from 'npm:@react-email/components';
import { Tailwind } from 'npm:@react-email/tailwind';

type EmailTemplateProps = {
  vendorName: string;
  products: string[];
  contractId: string;
};

const appUrl = Deno.env.get('APP_URL');
const defaultUrl = appUrl ? `https://${appUrl}` : 'http://localhost:3000';

export const ReminderEmail = ({
  vendorName,
  products,
  contractId,
}: EmailTemplateProps) => {
  const contractLink = `${defaultUrl}/contracts/${contractId}`;
  return (
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
              <p
                style={{
                  fontSize: '24px',
                  fontWeight: 500,
                  marginBottom: '20px',
                }}
              >
                Contract expiring
              </p>
              <p
                style={{
                  fontSize: '14px',
                  lineHeight: 1.5,
                  maxWidth: '700px',
                  marginBottom: '20px',
                }}
              >
                This is a reminder that you have elected not to renew the
                following contract. Please take all necessary steps to ensure
                that the agreement is cancelled per the terms of the contract.
              </p>

              {/* Contract Card */}
              <Section
                style={{
                  border: '1px solid rgba(0,0,0,.1)',
                  borderRadius: '3px',
                  padding: '10px 14px',
                  marginBottom: '20px',
                  marginTop: '35px',
                }}
              >
                <table width="100%" cellPadding="0" cellSpacing="0">
                  <tr>
                    <td
                      style={{
                        verticalAlign: 'middle',
                        paddingRight: '20px',
                      }}
                    >
                      <p
                        style={{
                          fontSize: '14px',
                          fontWeight: '500',
                          margin: '0',
                          color: '#111827',
                        }}
                      >
                        {vendorName}
                      </p>
                      <p
                        style={{
                          fontSize: '14px',
                          margin: '0',
                          color: '#6B7280',
                        }}
                      >
                        {products.join(', ')}
                      </p>
                    </td>
                    <td
                      style={{
                        verticalAlign: 'middle',
                        textAlign: 'right',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Button
                        href={contractLink}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '2px',
                          backgroundColor: '#24204c',
                          textDecoration: 'none',
                          fontSize: '13px',
                          fontWeight: '500',
                          display: 'inline-block',
                          color: '#ffffff',
                        }}
                      >
                        View Contract
                      </Button>
                    </td>
                  </tr>
                </table>
              </Section>
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
                This is an automated message, please do not reply to this email.
                For assistance, contact our support team at{' '}
                <a
                  href={'mailto:support@postsig.com'}
                  className="text-[#3A2FA9] no-underline"
                >
                  support@postsig.com
                </a>
                .
              </p>
              <p>
                To protect your personal information, please don&apos;t reply to
                this message. PostSig won&apos;t ask for confidential
                information in an email.
              </p>
              <p>
                <a
                  href={`${defaultUrl}/settings/alerts`}
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
                privileged information. If you are not the intended recipient,
                please delete the email and notify the sender immediately.
                Unauthorized use, disclosure, or copying of this email is
                strictly prohibited.
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
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};
