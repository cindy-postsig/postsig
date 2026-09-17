import * as React from 'react';
import { Section } from '@react-email/components';
import { UtilityLayout } from '@/emails/_components/UtilityLayout';
import { CTAButton } from '@/emails/_components/CTAButton';
import { Text } from '@/emails/_components/EmailText';

interface TrustedDeviceAddedEmailProps {
  deviceName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Pre-formatted display string (caller applies the user/org date format). */
  trustedAt?: string | null;
  securityUrl: string;
}

export function TrustedDeviceAddedEmail({
  deviceName,
  ipAddress,
  userAgent,
  trustedAt,
  securityUrl,
}: TrustedDeviceAddedEmailProps) {
  const safe = (v?: string | null) =>
    v && String(v).trim().length ? v : 'Unknown';

  return (
    <UtilityLayout heading="New trusted device added">
      <Text>A new device was just trusted for your PostSig account.</Text>

      <Section
        style={{
          border: '1px solid rgba(0,0,0,.15)',
          borderRadius: '4px',
          padding: '20px',
          margin: '16px 0',
        }}
      >
        <Text style={{ margin: '0 0 6px 0', fontSize: '14px' }}>
          <strong>Device name:</strong> {safe(deviceName)}
        </Text>
        <Text style={{ margin: '0 0 6px 0', fontSize: '14px' }}>
          <strong>IP address:</strong> {safe(ipAddress)}
        </Text>
        <Text style={{ margin: '0 0 6px 0', fontSize: '14px' }}>
          <strong>User agent:</strong> {safe(userAgent)}
        </Text>
        {trustedAt && (
          <Text style={{ margin: 0, fontSize: '14px' }}>
            <strong>Trusted at:</strong> {trustedAt}
          </Text>
        )}
      </Section>

      <Text>
        <CTAButton href={securityUrl}>View trusted devices</CTAButton>
      </Text>

      <Text>
        If you didn&apos;t add this trusted device, remove it immediately from
        your account and change your password. You can remove all trusted
        devices from the security settings page.
      </Text>
    </UtilityLayout>
  );
}

TrustedDeviceAddedEmail.PreviewProps = {
  deviceName: 'Sample MacBook Pro',
  ipAddress: '203.0.113.10',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  trustedAt: '2026-01-01 | 9:41 AM UTC',
  securityUrl: 'http://localhost:3000/account/security',
} satisfies TrustedDeviceAddedEmailProps;

export default TrustedDeviceAddedEmail;
