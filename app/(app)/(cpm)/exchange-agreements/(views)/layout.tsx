import ExchangeAgreementsSidebar from '@/components/exchange-agreements/ExchangeAgreementsSidebar';
import ExchangeAgreementsTabs from '@/components/exchange-agreements/ExchangeAgreementsTabs';
import {
  getExchanges,
  getFeeScheduleDataset,
} from '@/lib/exchange-agreement/feeSchedules';
import { EXCHANGE_CODE } from '@/lib/exchange-agreement/types';

// A layout can't read searchParams, so this always fetches EXCHANGE_CODE's
// dataset regardless of which exchange is selected -- the sidebar guards
// against showing it under the wrong exchange. Passed into getExchanges as
// `preloaded` rather than letting it fetch the same dataset again itself.
export default async function ExchangeAgreementsViewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dataset = await getFeeScheduleDataset(EXCHANGE_CODE);
  const exchanges = await getExchanges({ code: EXCHANGE_CODE, dataset });

  // min-h-[calc(100vh-3.5rem)] + sticky top-14 (not h-full + overflow-y-auto)
  // matches contracts/(views)/layout.tsx's pattern: nothing in this app's
  // layout chain gives h-full a real height to resolve against, so h-full
  // silently no-ops and the document scrolls as a whole -- which stranded
  // the sidebar and tabs bar since neither had its own sticky positioning.
  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <div className="flex">
        <ExchangeAgreementsSidebar exchanges={exchanges} dataset={dataset} />
        <div className="min-w-0 flex-1">
          <div className="sticky top-14 z-20 bg-background">
            <ExchangeAgreementsTabs />
          </div>
          <div className="px-6 py-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
