'use client';

import { useMemo, useState } from 'react';
import {
  getProductExplorerFromDataset,
  getVersionsFromDataset,
  type FeeScheduleDataset,
  type ProductExplorerRow,
} from '@/lib/exchange-agreement/feeScheduleQueries';
import type { FeeScheduleVersion } from '@/lib/exchange-agreement/types';

// Shared by every view that lets the user pin a specific historical fee
// schedule version instead of always showing "latest" (Product Explorer,
// My List): tracks the selection and re-derives the row set for it.
export function useFeeScheduleVersionSelector(
  dataset: FeeScheduleDataset | null,
  productLine: string,
  latestRows: ProductExplorerRow[],
) {
  // null means "Latest" -- the default, caller-provided `latestRows`.
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );

  const versions = useMemo(
    () => (dataset ? getVersionsFromDataset(dataset, productLine) : []),
    [dataset, productLine],
  );

  const selectedVersion: FeeScheduleVersion | null = selectedVersionId
    ? (versions.find((version) => version.id === selectedVersionId) ?? null)
    : null;

  const rows = useMemo(
    () =>
      selectedVersionId && dataset
        ? getProductExplorerFromDataset(dataset, productLine, selectedVersionId)
        : latestRows,
    [dataset, productLine, selectedVersionId, latestRows],
  );

  return {
    versions,
    selectedVersionId,
    setSelectedVersionId,
    selectedVersion,
    rows,
  };
}
