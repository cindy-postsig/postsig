import { ContractReplacementEmail } from '@/emails/ContractReplacementEmail';
import { resolveExtractorBaseUrl } from '@/emails/_components/env';
import { getOrganizationById } from '@/data/superuser/orgs';
import { sendResendEmail } from '@/app/lib/actions';
import { emailListings } from '@/constants/emails';
import { formatDate } from '@/lib/date-format';
import { getOrgDateFormatPattern } from '@/lib/date-format-server';
import { reverseContractTypeMap } from '@/app/lib/constants';
import {
  getNewContractDate,
  getTermEndDate,
} from '@/lib/contracts/replacementCandidates';
import { ReplacementContractRow } from '@/data/superuser/contractReplacementDetection';
import { logAlert } from '@/utils/logging/alert';

const emailList = emailListings.lineage;

interface SendContractReplacementEmailProps {
  eventId: number;
  oldContract: ReplacementContractRow;
  newContract: ReplacementContractRow;
  dateDeltaDays: number;
  evidence: string[];
  organizationId: string;
}

const contractType = (contract: ReplacementContractRow): string =>
  reverseContractTypeMap[contract.type_id ?? -1] ?? 'Unknown';

const replacementUrlFor = (
  eventId: number,
  organizationId: string,
): string | null => {
  const extractorBaseUrl = resolveExtractorBaseUrl();
  if (!extractorBaseUrl) {
    logAlert(
      'lineage-extractor-url-missing',
      new Error('EXTRACTOR_APP_URL is not set'),
      { organizationId, eventId },
      'Contract replacement email sent without an extractor link',
    );
    return null;
  }
  return `${extractorBaseUrl}/contract-events/${eventId}`;
};

export async function sendContractReplacementEmail({
  eventId,
  oldContract,
  newContract,
  dateDeltaDays,
  evidence,
  organizationId,
}: SendContractReplacementEmailProps) {
  const organization = await getOrganizationById(organizationId);
  const dateFormat = await getOrgDateFormatPattern(organizationId);
  const format = (date: Date | null) =>
    date ? formatDate(date.toISOString(), dateFormat) : null;

  const template = ContractReplacementEmail({
    eventId,
    oldContract: {
      id: oldContract.id,
      type: contractType(oldContract),
      termEndDate: format(getTermEndDate(oldContract.term_end_date)),
    },
    newContract: {
      id: newContract.id,
      type: contractType(newContract),
      termStartDate: format(getNewContractDate(newContract.term_start_date)),
    },
    dateDeltaDays,
    evidence,
    organizationName: (organization.data as any)?.name ?? 'Unknown',
    replacementUrl: replacementUrlFor(eventId, organizationId),
  });

  await sendResendEmail({
    subject: 'Contract Replacement Detected',
    template,
    emailList,
  });
}
