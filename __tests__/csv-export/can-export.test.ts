import { canExportCsv } from '@/lib/csv-export/can-export';

const base = {
  isPostsig: false,
  isDemoOrg: false,
  cpmTrialEnabled: false,
  investorTrialEnabled: false,
  cpmCsvExportEnabled: false,
  investorCsvExportEnabled: false,
};

describe('canExportCsv', () => {
  it('returns false when meta is missing', () => {
    expect(canExportCsv(null, 'cpm')).toBe(false);
    expect(canExportCsv(undefined, 'investor')).toBe(false);
  });

  describe('cpm', () => {
    it('is hidden by default for a non-trial client org', () => {
      expect(canExportCsv(base, 'cpm')).toBe(false);
    });

    it('is shown when the admin toggle is on for a non-trial org', () => {
      expect(canExportCsv({ ...base, cpmCsvExportEnabled: true }, 'cpm')).toBe(
        true,
      );
    });

    it('stays hidden in trial mode even when the toggle is on', () => {
      expect(
        canExportCsv(
          { ...base, cpmTrialEnabled: true, cpmCsvExportEnabled: true },
          'cpm',
        ),
      ).toBe(false);
    });

    it('is always shown for shadow users and demo orgs, even in trial', () => {
      expect(
        canExportCsv(
          { ...base, isPostsig: true, cpmTrialEnabled: true },
          'cpm',
        ),
      ).toBe(true);
      expect(
        canExportCsv(
          { ...base, isDemoOrg: true, cpmTrialEnabled: true },
          'cpm',
        ),
      ).toBe(true);
    });
  });

  describe('investor', () => {
    it('is hidden by default and shown when the toggle is on', () => {
      expect(canExportCsv(base, 'investor')).toBe(false);
      expect(
        canExportCsv({ ...base, investorCsvExportEnabled: true }, 'investor'),
      ).toBe(true);
    });

    it('stays hidden in trial mode even when the toggle is on', () => {
      expect(
        canExportCsv(
          {
            ...base,
            investorTrialEnabled: true,
            investorCsvExportEnabled: true,
          },
          'investor',
        ),
      ).toBe(false);
    });

    it('is always shown for shadow users and demo orgs, even in trial', () => {
      expect(
        canExportCsv(
          { ...base, isPostsig: true, investorTrialEnabled: true },
          'investor',
        ),
      ).toBe(true);
      expect(
        canExportCsv(
          { ...base, isDemoOrg: true, investorTrialEnabled: true },
          'investor',
        ),
      ).toBe(true);
    });
  });
});
