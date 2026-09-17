const mockSendResendEmail = jest.fn(async (..._args: unknown[]) => undefined);
const mockLogAlert = jest.fn();
const mockContractLineageEmail = jest.fn(
  (_props: { lineageUrl: string | null }) => null,
);

jest.mock('@/app/lib/actions', () => ({
  sendResendEmail: (...args: unknown[]) => mockSendResendEmail(...args),
}));

jest.mock('@/data/superuser/orgs', () => ({
  getOrganizationById: jest.fn(async () => ({ data: { name: 'Acme' } })),
}));

jest.mock('@/lib/date-format-server', () => ({
  getOrgDateFormatPattern: jest.fn(async () => 'dd/MM/yyyy'),
}));

jest.mock('@/constants/emails', () => ({
  emailListings: { lineage: ['extractors@postsig.com'] },
}));

jest.mock('@/utils/logging/alert', () => ({
  logAlert: (...args: unknown[]) => mockLogAlert(...args),
}));

// The sender invokes the template as a plain function, so mock it to capture
// the props instead of trying to read them back off the rendered tree.
jest.mock('@/emails/ContractLineageEmail', () => ({
  ContractLineageEmail: (props: { lineageUrl: string | null }) =>
    mockContractLineageEmail(props),
}));

import { resolveExtractorBaseUrl } from '@/emails/_components/env';
import { sendContractLineageEmail } from '@/app/lib/emails/contract-lineage';

const ORIGINAL = process.env.EXTRACTOR_APP_URL;

const setExtractorUrl = (value: string | undefined) => {
  if (value === undefined) {
    delete process.env.EXTRACTOR_APP_URL;
  } else {
    process.env.EXTRACTOR_APP_URL = value;
  }
};

afterEach(() => {
  setExtractorUrl(ORIGINAL);
  jest.clearAllMocks();
});

describe('resolveExtractorBaseUrl', () => {
  it('prepends https to a bare host', () => {
    setExtractorUrl('extract.postsig.com');
    expect(resolveExtractorBaseUrl()).toBe('https://extract.postsig.com');
  });

  it('preserves an explicit scheme rather than double-prefixing', () => {
    setExtractorUrl('http://localhost:4000');
    expect(resolveExtractorBaseUrl()).toBe('http://localhost:4000');
  });

  it('strips trailing slashes', () => {
    setExtractorUrl('https://extract.postsig.com//');
    expect(resolveExtractorBaseUrl()).toBe('https://extract.postsig.com');
  });

  it('trims surrounding whitespace', () => {
    setExtractorUrl('  extract.postsig.com  ');
    expect(resolveExtractorBaseUrl()).toBe('https://extract.postsig.com');
  });

  it.each([undefined, '', '   '])('returns null for %p', (value) => {
    setExtractorUrl(value);
    expect(resolveExtractorBaseUrl()).toBeNull();
  });
});

describe('sendContractLineageEmail', () => {
  const props = {
    relationshipId: 7718,
    parentContract: { id: 1001, contract_types: { name: 'MSA' } },
    childContractId: 1042,
    metadata: { type_id: 7, start_date: null, vendor_id: 88, products: [] },
    organizationId: 'org-1',
  };

  const sentLineageUrl = () =>
    mockContractLineageEmail.mock.calls[0][0].lineageUrl;

  it('builds an absolute extractor link from a bare host', async () => {
    setExtractorUrl('extract.postsig.com');

    await sendContractLineageEmail(props);

    expect(sentLineageUrl()).toBe(
      'https://extract.postsig.com/contract-lineage/7718',
    );
    expect(mockLogAlert).not.toHaveBeenCalled();
  });

  it('sends without a link and alerts when the var is unset', async () => {
    setExtractorUrl(undefined);

    await sendContractLineageEmail(props);

    expect(sentLineageUrl()).toBeNull();
    expect(mockSendResendEmail).toHaveBeenCalledTimes(1);
    expect(mockLogAlert).toHaveBeenCalledWith(
      'lineage-extractor-url-missing',
      expect.any(Error),
      { organizationId: 'org-1', relationshipId: 7718 },
      expect.any(String),
    );
  });
});
