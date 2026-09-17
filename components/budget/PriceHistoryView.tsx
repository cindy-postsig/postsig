'use client';

import { useState } from 'react';
import { VendorPriceTable } from '@/components/budget/VendorPriceTable';
import { CostMethodSelect } from '@/components/budget/CostMethodSelect';
import type { CostMethod } from '@/components/budget/costMethod';
import type { VendorPriceSummary } from '@/lib/v2/reports/price-history/summary';
import type { ContractSummary } from '@/components/budget/ContractSummarySheet';

export interface PriceHistorySummaries {
  amortized: { vendors: VendorPriceSummary[]; periodLabels: string[] };
  actual: { vendors: VendorPriceSummary[]; periodLabels: string[] };
  committed: { vendors: VendorPriceSummary[]; periodLabels: string[] };
}

/**
 * psk-1844's calculation-method selector on the Price History view: all three
 * rollups are computed server-side (one resolver pass each) and the selector
 * just swaps which one the table shows. `defaultMethod` is the org-level
 * setting (psk-1877), resolved server-side.
 */
export function PriceHistoryView({
  summaries,
  contractSummaries,
  defaultMethod,
}: {
  summaries: PriceHistorySummaries;
  contractSummaries: ContractSummary[];
  defaultMethod: CostMethod;
}) {
  const [method, setMethod] = useState<CostMethod>(defaultMethod);
  const { vendors, periodLabels } = summaries[method];

  return (
    <div className="-mb-24">
      <div className="mb-8 mt-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="mb-2 font-serif leading-none">Price History</h1>
          <p className="text-sm text-muted-foreground">
            Vendor pricing trends over time.
          </p>
        </div>
        <CostMethodSelect method={method} onChange={setMethod} />
      </div>
      <VendorPriceTable
        vendors={vendors}
        periodLabels={periodLabels}
        contractSummaries={contractSummaries}
      />
    </div>
  );
}
