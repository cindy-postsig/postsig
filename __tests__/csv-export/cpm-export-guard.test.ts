import { exportBudgetChartData } from '@/app/lib/actions/export-budget';
import { exportMonthlyReportExcel } from '@/app/lib/actions/export-monthly-report';
import { getUserMetadata } from '@/data/users';

jest.mock('@/data/users', () => ({ getUserMetadata: jest.fn() }));

const mockGetUserMetadata = getUserMetadata as jest.Mock;

type MonthlyReportArg = Parameters<typeof exportMonthlyReportExcel>[0];

const blockedMeta = {
  isPostsig: false,
  isDemoOrg: false,
  cpmTrialEnabled: false,
  cpmCsvExportEnabled: false,
};

const EXPECTED_ERROR = 'CSV export is not enabled for this organization';
const emptyReport = {} as unknown as MonthlyReportArg;

describe('cpm export server-action guard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('blocks the budget chart export when csv export is disabled', async () => {
    mockGetUserMetadata.mockResolvedValue(blockedMeta);

    await expect(exportBudgetChartData()).rejects.toThrow(EXPECTED_ERROR);
  });

  it('blocks the monthly report export when csv export is disabled', async () => {
    mockGetUserMetadata.mockResolvedValue(blockedMeta);

    await expect(exportMonthlyReportExcel(emptyReport)).rejects.toThrow(
      EXPECTED_ERROR,
    );
  });

  it('blocks both when no user metadata is available', async () => {
    mockGetUserMetadata.mockResolvedValue(null);

    await expect(exportBudgetChartData()).rejects.toThrow(EXPECTED_ERROR);
    await expect(exportMonthlyReportExcel(emptyReport)).rejects.toThrow(
      EXPECTED_ERROR,
    );
  });
});
