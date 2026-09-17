import { Column, Row, Section } from '@react-email/components';
import _ from 'lodash';
import * as React from 'react';
import { UtilityLayout } from '@/emails/_components/UtilityLayout';
import { CTAButton } from '@/emails/_components/CTAButton';
import { Text } from '@/emails/_components/EmailText';

interface ContractLinkageEmailProps {
  relationshipId: number;
  parentContract: any;
  childContractId: number;
  metadata: {
    type_id: number;
    start_date?: string | null;
    vendor_id: number;
    products: any[];
  };
  organizationName: string;
  lineageUrl: string | null;
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

export function ContractLineageEmail({
  relationshipId,
  parentContract,
  childContractId,
  metadata,
  organizationName,
  lineageUrl,
}: ContractLinkageEmailProps) {
  const parentType = _.get(parentContract, 'contract_types.name', 'Unknown');

  return (
    <UtilityLayout
      heading="Contract lineage detected"
      preview={`Contract lineage detected for ${organizationName}`}
      automatedFooter
    >
      <Text>
        A contract lineage relationship has been detected in{' '}
        <strong>{organizationName}</strong>.
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
          label="Parent contract"
          value={`#${parentContract.id} — ${parentType}`}
        />
        <Field label="Child contract" value={`#${childContractId}`} />
        <Field label="Vendor ID" value={metadata.vendor_id} />
        {metadata.start_date && (
          <Field label="Start date" value={metadata.start_date} />
        )}
        <Field label="Relationship ID" value={relationshipId} isLast />
      </Section>

      {lineageUrl && (
        <Text>
          <CTAButton href={lineageUrl}>View contract lineage</CTAButton>
        </Text>
      )}
    </UtilityLayout>
  );
}

ContractLineageEmail.PreviewProps = {
  relationshipId: 4321,
  parentContract: {
    id: 1001,
    contract_types: { name: 'Master Services Agreement' },
  },
  childContractId: 1042,
  metadata: {
    type_id: 7,
    start_date: '2026-01-01',
    vendor_id: 88,
    products: [{ id: 12, name: 'Acme Pro Plan' }],
  },
  organizationName: 'Sample Organization',
  lineageUrl: 'https://extract.postsig.com/contract-lineage/4321',
} satisfies ContractLinkageEmailProps;

export default ContractLineageEmail;
