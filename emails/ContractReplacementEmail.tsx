import { Column, Row, Section } from '@react-email/components';
import * as React from 'react';
import { UtilityLayout } from '@/emails/_components/UtilityLayout';
import { CTAButton } from '@/emails/_components/CTAButton';
import { Text } from '@/emails/_components/EmailText';

interface ContractReplacementEmailProps {
  eventId: number;
  oldContract: {
    id: number;
    type: string;
    termEndDate: string | null;
  };
  newContract: {
    id: number;
    type: string;
    termStartDate: string | null;
  };
  dateDeltaDays: number;
  evidence: string[];
  organizationName: string;
  replacementUrl: string | null;
}

const Field = ({
  label,
  value,
  isLast,
}: {
  label: string;
  value: React.ReactNode;
  isLast?: boolean;
}) => (
  <Row style={{ marginBottom: isLast ? 0 : '10px' }}>
    <Column
      style={{
        width: '140px',
        verticalAlign: 'top',
        paddingRight: '12px',
      }}
    >
      <Text style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>
        {label}
      </Text>
    </Column>
    <Column style={{ verticalAlign: 'top' }}>
      <Text
        style={{
          margin: 0,
          fontSize: '14px',
          color: '#111',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </Text>
    </Column>
  </Row>
);

export function ContractReplacementEmail({
  eventId,
  oldContract,
  newContract,
  dateDeltaDays,
  evidence,
  organizationName,
  replacementUrl,
}: ContractReplacementEmailProps) {
  return (
    <UtilityLayout
      heading="Contract replacement detected"
      preview={`Contract replacement detected for ${organizationName}`}
      automatedFooter
    >
      <Text>
        A contract replacement has been detected in{' '}
        <strong>{organizationName}</strong> and is pending review.
      </Text>

      <Section
        style={{
          border: '1px solid rgba(0,0,0,.15)',
          borderRadius: '4px',
          padding: '20px',
          margin: '16px 0',
        }}
      >
        <Field label="Organization" value={organizationName} />
        <Field
          label="Old contract"
          value={`#${oldContract.id} — ${oldContract.type}`}
        />
        {oldContract.termEndDate && (
          <Field label="Old term end" value={oldContract.termEndDate} />
        )}
        <Field
          label="New contract"
          value={`#${newContract.id} — ${newContract.type}`}
        />
        {newContract.termStartDate && (
          <Field label="New term start" value={newContract.termStartDate} />
        )}
        <Field label="Date gap" value={`${dateDeltaDays} days`} />
        <Field label="Event ID" value={eventId} isLast />
      </Section>

      {evidence.length > 0 && (
        <Section style={{ margin: '16px 0' }}>
          <Text style={{ fontSize: '14px', fontWeight: 500 }}>Evidence</Text>
          {evidence.map((quote, index) => (
            <Text
              key={index}
              style={{
                margin: '0 0 8px 0',
                fontSize: '14px',
                color: '#111',
                wordBreak: 'break-word',
              }}
            >
              &ldquo;{quote}&rdquo;
            </Text>
          ))}
        </Section>
      )}

      {replacementUrl && (
        <Text>
          <CTAButton href={replacementUrl}>View contract replacement</CTAButton>
        </Text>
      )}
    </UtilityLayout>
  );
}

ContractReplacementEmail.PreviewProps = {
  eventId: 5312,
  oldContract: {
    id: 1001,
    type: 'Order Form',
    termEndDate: '2025-12-31',
  },
  newContract: {
    id: 1042,
    type: 'Order Form',
    termStartDate: '2026-01-01',
  },
  dateDeltaDays: 1,
  evidence: [
    'This Pricing Schedule terminates and replaces the following agreement(s) executed between the parties: Pricing Schedule 01053273.0',
  ],
  organizationName: 'Sample Organization',
  replacementUrl: 'https://extract.postsig.com/contract-events/5312',
} satisfies ContractReplacementEmailProps;

export default ContractReplacementEmail;
