import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { ReplacementContractRow } from '@/data/superuser/contractReplacementDetection';

jest.mock('server-only', () => ({}));

const mockSendResendEmail = jest.fn(async (..._args: unknown[]) => undefined);
const mockLogAlert = jest.fn();
const mockReplacementTemplate = jest.fn(
  (_props: Record<string, unknown>) => null,
);

jest.mock('@/app/lib/actions', () => ({
  sendResendEmail: (...args: unknown[]) => mockSendResendEmail(...args),
}));

jest.mock('@/data/superuser/orgs', () => ({
  getOrganizationById: jest.fn(async () => ({ data: { name: 'Acme' } })),
}));

jest.mock('@/lib/date-format-server', () => ({
  getOrgDateFormatPattern: jest.fn(async () => 'yyyy-MM-dd'),
}));

jest.mock('@/constants/emails', () => ({
  emailListings: { lineage: ['extractors@postsig.com'] },
}));

jest.mock('@/utils/logging/alert', () => ({
  logAlert: (...args: unknown[]) => mockLogAlert(...args),
}));

// The sender invokes the template as a plain function, so mock it to capture
// the props instead of reading them back off the rendered tree.
jest.mock('@/emails/ContractReplacementEmail', () => ({
  ContractReplacementEmail: (props: Record<string, unknown>) =>
    mockReplacementTemplate(props),
}));

import { sendContractReplacementEmail } from '@/app/lib/emails/contract-replacement';
import { contractTypes } from '@/app/lib/constants';

const ORIGINAL = process.env.EXTRACTOR_APP_URL;

const setExtractorUrl = (value: string | undefined) => {
  if (value === undefined) {
    delete process.env.EXTRACTOR_APP_URL;
  } else {
    process.env.EXTRACTOR_APP_URL = value;
  }
};

const contractRow = (
  overrides: Partial<ReplacementContractRow> = {},
): ReplacementContractRow => ({
  id: 42,
  vendor_id: 7,
  type_id: contractTypes.SO,
  status: 'active',
  term_start_date: null,
  term_end_date: [{ date: '2026-01-31' }],
  metadata: null,
  productNames: ['Terminal Pro'],
  ...overrides,
});

const OLD_CONTRACT = contractRow();
const NEW_CONTRACT = contractRow({
  id: 100,
  term_start_date: [{ date: '2026-02-01' }],
  term_end_date: null,
});

const props = {
  eventId: 5312,
  oldContract: OLD_CONTRACT,
  newContract: NEW_CONTRACT,
  dateDeltaDays: 1,
  evidence: ['terminates and replaces'],
  organizationId: 'org-1',
};

const sentProps = () => mockReplacementTemplate.mock.calls[0][0] as any;

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  setExtractorUrl(ORIGINAL);
});

describe('sendContractReplacementEmail', () => {
  it('builds an absolute extractor link from a bare host', async () => {
    setExtractorUrl('extract.postsig.com');

    await sendContractReplacementEmail(props);

    expect(sentProps().replacementUrl).toBe(
      'https://extract.postsig.com/contract-events/5312',
    );
    expect(mockLogAlert).not.toHaveBeenCalled();
    expect(mockSendResendEmail).toHaveBeenCalledTimes(1);
  });

  it('sends without a link and alerts when the var is unset', async () => {
    setExtractorUrl(undefined);

    await sendContractReplacementEmail(props);

    expect(sentProps().replacementUrl).toBeNull();
    expect(mockSendResendEmail).toHaveBeenCalledTimes(1);
    expect(mockLogAlert).toHaveBeenCalledWith(
      'lineage-extractor-url-missing',
      expect.any(Error),
      { organizationId: 'org-1', eventId: 5312 },
      expect.any(String),
    );
  });

  it('renders contract types by name and the org date format', async () => {
    setExtractorUrl('extract.postsig.com');

    await sendContractReplacementEmail(props);

    expect(sentProps().oldContract).toEqual({
      id: 42,
      type: 'SO',
      termEndDate: '2026-01-31',
    });
    expect(sentProps().newContract).toEqual({
      id: 100,
      type: 'SO',
      termStartDate: '2026-02-01',
    });
    expect(sentProps().organizationName).toBe('Acme');
    expect(sentProps().evidence).toEqual(['terminates and replaces']);
  });

  it('leaves a missing term date null rather than printing an epoch', async () => {
    setExtractorUrl('extract.postsig.com');

    await sendContractReplacementEmail({
      ...props,
      oldContract: contractRow({ term_end_date: null }),
    });

    expect(sentProps().oldContract.termEndDate).toBeNull();
  });
});
