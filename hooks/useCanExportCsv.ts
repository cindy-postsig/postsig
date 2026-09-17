'use client';

import { useContext } from 'react';
import { UserContext } from '@/app/userProvider';
import { canExportCsv, CsvExportModule } from '@/lib/csv-export/can-export';

export function useCanExportCsv(module: CsvExportModule): boolean {
  const userContext = useContext(UserContext);
  return canExportCsv(userContext?.userMetadata, module);
}
