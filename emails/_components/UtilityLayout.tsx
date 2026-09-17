import * as React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Preview,
} from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';
import { EmailFonts } from '@/emails/_components/EmailFonts';
import { EmailLogo } from '@/emails/_components/EmailLogo';
import { EmailFooter } from '@/emails/_components/EmailFooter';
import { Text } from '@/emails/_components/EmailText';

interface UtilityLayoutProps {
  heading: React.ReactNode;
  preview?: string;
  automatedFooter?: boolean;
  children: React.ReactNode;
}

export function UtilityLayout({
  heading,
  preview,
  automatedFooter,
  children,
}: UtilityLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <EmailFonts />
      </Head>
      {preview && <Preview>{preview}</Preview>}
      <Tailwind>
        <Body
          className="px-1 py-4"
          style={{ fontFeatureSettings: '"liga" 0, "clig" 0' }}
        >
          <Container
            style={{
              margin: '0 auto',
              width: '100%',
              maxWidth: '600px',
              border: '1px solid rgba(0,0,0,.15)',
              padding: '30px',
              paddingBottom: '8px',
              borderRadius: '4px',
            }}
          >
            <Section className="mb-8">
              <EmailLogo />
            </Section>
            <Section>
              <Text
                style={{
                  fontSize: '24px',
                  lineHeight: '32px',
                  fontWeight: 500,
                }}
              >
                {heading}
              </Text>
              {children}
              <EmailFooter automated={automatedFooter} />
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
