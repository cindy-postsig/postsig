import { getUserMetadata } from '@/data/users';
import { canExportCsv, CsvExportModule } from './can-export';

export async function assertCsvExportAllowed(
  module: CsvExportModule,
): Promise<void> {
  const meta = await getUserMetadata();
  if (!canExportCsv(meta, module)) {
    throw new Error('CSV export is not enabled for this organization');
  }
}
