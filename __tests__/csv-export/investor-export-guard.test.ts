import {
  exportCompanyCSV,
  exportCompanyExcel,
  exportCapTableCSV,
  exportCapTableExcel,
  exportLiqPrefCSV,
  exportPortfolioCSV,
} from '@/app/lib/actions/investor/export';
import { getUserMetadata } from '@/data/users';
import type {
  LiqPrefData,
  PortfolioCompany,
} from '@/app/(app)/(investor)/investor/types';

jest.mock('@/data/users', () => ({
  getUserMetadata: jest.fn(),
  // Exports format their date cells with the viewer's effective pattern.
  getEffectiveDateFormat: jest.fn(() => Promise.resolve('yyyy-MM-dd')),
}));

// The allow-path exports fire an audit write on success. Unmocked, that is a
// REAL network call to Supabase — usually a fast failure (caught and logged),
// but under full-suite load it can exceed the jest timeout and flake the test.
jest.mock('@/lib/audit', () => ({
  auditLogger: { logExportEvent: jest.fn() },
  getUserAuditContext: jest.fn(() => Promise.resolve({})),
}));

const mockGetUserMetadata = getUserMetadata as jest.Mock;

const blockedMeta = {
  isPostsig: false,
  isDemoOrg: false,
  investorTrialEnabled: false,
  investorCsvExportEnabled: false,
};

const allowedMeta = { ...blockedMeta, investorCsvExportEnabled: true };

const emptyLiqPref: LiqPrefData = {
  rows: [],
  myTotalLiqPref: 0,
  totalLiqPref: 0,
};

const liqPrefWithMillions: LiqPrefData = {
  myTotalLiqPref: 3_000_000,
  totalLiqPref: 5_000_000,
  rows: [
    {
      securityId: 1,
      equityClass: 'Series A',
      preference: 1,
      pricePerUnit: 1.25,
      multiplier: 1,
      participationType: null,
      participationCap: null,
      myShares: 1_000_000,
      myCost: 1_250_000,
      myLiqPref: 1_250_000,
      totalOutstandingShares: 4_000_000,
      totalLiqPref: 5_000_000,
    },
  ],
};

const company = {} as unknown as PortfolioCompany;
const capTableParams = {
  companyName: 'Acme',
  asOfDate: '2024-01-01',
  securities: [],
};

const EXPECTED_ERROR = 'CSV export is not enabled for this organization';

describe('investor export server-action guard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('blocks every company-level export when the org is not enabled', async () => {
    mockGetUserMetadata.mockResolvedValue(blockedMeta);

    await expect(exportCompanyCSV(company)).rejects.toThrow(EXPECTED_ERROR);
    await expect(exportCompanyExcel(company)).rejects.toThrow(EXPECTED_ERROR);
    await expect(exportCapTableCSV(capTableParams)).rejects.toThrow(
      EXPECTED_ERROR,
    );
    await expect(exportCapTableExcel(capTableParams)).rejects.toThrow(
      EXPECTED_ERROR,
    );
    await expect(exportLiqPrefCSV(emptyLiqPref, 'Acme')).rejects.toThrow(
      EXPECTED_ERROR,
    );
  });

  it('blocks when no user metadata is available', async () => {
    mockGetUserMetadata.mockResolvedValue(null);

    await expect(exportLiqPrefCSV(emptyLiqPref, 'Acme')).rejects.toThrow(
      EXPECTED_ERROR,
    );
  });

  it('allows the export once the org toggle is on', async () => {
    mockGetUserMetadata.mockResolvedValue(allowedMeta);

    await expect(exportLiqPrefCSV(emptyLiqPref, 'Acme')).resolves.toContain(
      'Acme - Capital Stack',
    );
  });

  it('exports My Cost as a full dollar amount, not an abbreviated value', async () => {
    mockGetUserMetadata.mockResolvedValue(allowedMeta);

    const csv = await exportLiqPrefCSV(liqPrefWithMillions, 'Acme');

    expect(csv).toContain('"$1,250,000"');
    expect(csv).not.toContain('$1.25M');
  });

  it('blocks the portfolio export when the org is not enabled', async () => {
    mockGetUserMetadata.mockResolvedValue(blockedMeta);

    await expect(exportPortfolioCSV([])).rejects.toThrow(EXPECTED_ERROR);
  });

  it('blocks the portfolio export in trial even when the toggle is on', async () => {
    mockGetUserMetadata.mockResolvedValue({
      ...allowedMeta,
      investorTrialEnabled: true,
    });

    await expect(exportPortfolioCSV([])).rejects.toThrow(EXPECTED_ERROR);
  });

  it('allows the portfolio export once the org toggle is on', async () => {
    mockGetUserMetadata.mockResolvedValue(allowedMeta);

    await expect(exportPortfolioCSV([])).resolves.toContain('Company');
  });
});
