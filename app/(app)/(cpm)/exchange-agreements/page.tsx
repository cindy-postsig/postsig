import ExchangeAgreementsSidebar from '@/components/exchange-agreements/ExchangeAgreementsSidebar';
import ExchangesTable from '@/components/exchange-agreements/ExchangesTable';
import { getExchanges } from '@/lib/exchange-agreement/feeSchedules';

export default async function ExchangeAgreementsPage() {
  const exchanges = await getExchanges();

  return (
    <div className="min-h-[calc(100vh-3.5rem)]">
      <div className="flex">
        <ExchangeAgreementsSidebar exchanges={exchanges} dataset={null} />
        <div className="min-w-0 flex-1 px-6 py-6">
          <h2 className="font-medium mb-6 font-serif text-3xl">
            Browse Exchanges
          </h2>
          <ExchangesTable exchanges={exchanges} />
        </div>
      </div>
    </div>
  );
}
