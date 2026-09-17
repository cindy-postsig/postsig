import { ContractLineageEmail } from '@/emails/ContractLineageEmail';
import { resolveExtractorBaseUrl } from '@/emails/_components/env';
import { getOrganizationById } from '@/data/superuser/orgs';
import { sendResendEmail } from '@/app/lib/actions';
import { emailListings } from '@/constants/emails';
import { formatDate } from '@/lib/date-format';
import { getOrgDateFormatPattern } from '@/lib/date-format-server';
import { logAlert } from '@/utils/logging/alert';

const emailList = emailListings.lineage;
interface SendContractLineageEmailProps {
  relationshipId: number;
  parentContract: any;
  childContractId: number;
  metadata: {
    type_id: number;
    start_date?: string | null;
    vendor_id: number;
    products: any[];
  };
  organizationId: string;
}

export async function sendContractLineageEmail({
  relationshipId,
  parentContract,
  childContractId,
  metadata,
  organizationId,
}: SendContractLineageEmailProps) {
  const organization = await getOrganizationById(organizationId);

  const dateFormat = await getOrgDateFormatPattern(organizationId);

  const extractorBaseUrl = resolveExtractorBaseUrl();
  if (!extractorBaseUrl) {
    logAlert(
      'lineage-extractor-url-missing',
      new Error('EXTRACTOR_APP_URL is not set'),
      { organizationId, relationshipId },
      'Contract lineage email sent without an extractor link',
    );
  }

  await sendResendEmail({
    subject: 'Contract Lineage Detected',
    template: ContractLineageEmail({
      relationshipId,
      parentContract,
      childContractId,
      metadata: {
        ...metadata,
        start_date: metadata.start_date
          ? formatDate(metadata.start_date, dateFormat)
          : metadata.start_date,
      },
      organizationName: (organization.data as any)?.name ?? 'Unknown',
      lineageUrl: extractorBaseUrl
        ? `${extractorBaseUrl}/contract-lineage/${relationshipId}`
        : null,
    }),
    emailList,
  });
}
