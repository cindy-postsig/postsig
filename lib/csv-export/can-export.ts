import { UserMetadata } from '@/constants/types';

export type CsvExportModule = 'cpm' | 'investor';

type CsvExportMeta = Pick<
  UserMetadata,
  | 'isPostsig'
  | 'isDemoOrg'
  | 'cpmTrialEnabled'
  | 'investorTrialEnabled'
  | 'cpmCsvExportEnabled'
  | 'investorCsvExportEnabled'
>;

// Trial is the per-module trial_enabled flag; the legacy organizations.trial
// column (isTrial) is no longer set and is intentionally not consulted here.
export function canExportCsv(
  meta: CsvExportMeta | null | undefined,
  module: CsvExportModule,
): boolean {
  if (!meta) return false;
  if (meta.isPostsig || meta.isDemoOrg) return true;

  if (module === 'cpm') {
    if (meta.cpmTrialEnabled) return false;
    return meta.cpmCsvExportEnabled === true;
  }

  if (meta.investorTrialEnabled) return false;
  return meta.investorCsvExportEnabled === true;
}
