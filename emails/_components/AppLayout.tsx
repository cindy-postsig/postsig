import * as React from 'react';
import { Html, Head, Body, Container, Preview } from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';
import { EmailFonts } from '@/emails/_components/EmailFonts';
import { EmailLogo } from '@/emails/_components/EmailLogo';

interface AppLayoutProps {
  preview?: string;
  maxWidth?: number;
  linkedLogo?: boolean;
  children: React.ReactNode;
}

export function AppLayout({
  preview,
  maxWidth = 600,
  linkedLogo = false,
  children,
}: AppLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <EmailFonts />
      </Head>
      {preview && <Preview>{preview}</Preview>}
      <Tailwind>
        <Body className="bg-[#f5f5f6] px-1 py-4">
          <Container className="mx-auto" style={{ maxWidth: `${maxWidth}px` }}>
            <EmailLogo linked={linkedLogo} />
            {children}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
