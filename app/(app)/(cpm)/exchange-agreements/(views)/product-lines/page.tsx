import ProductsTable from '@/components/exchange-agreements/ProductsTable';
import {
  getExchangeSummaryFromDataset,
  getFeeScheduleDataset,
  getProductLinesFromDataset,
} from '@/lib/exchange-agreement/feeSchedules';
import { EXCHANGE_CODE } from '@/lib/exchange-agreement/types';
import { resolveSearchParams } from '@/lib/exchange-agreement/searchParams';

export default async function ProductsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{ exchange?: string }>;
}) {
  const searchParams = await resolveSearchParams(searchParamsPromise);
  const exchangeCode = searchParams?.exchange ?? EXCHANGE_CODE;
  // Fetched once and derived from directly, rather than via getProductLines
  // + getExchange (each would independently re-fetch the same dataset).
  const dataset = await getFeeScheduleDataset(exchangeCode);
  const productLines = dataset ? getProductLinesFromDataset(dataset) : [];
  const exchange = dataset
    ? getExchangeSummaryFromDataset(dataset, productLines)
    : undefined;

  return (
    <div>
      <h2 className="font-medium mb-6 font-serif text-3xl">
        {exchange?.name ?? exchangeCode} Product Lines
      </h2>
      <ProductsTable
        exchangeCode={exchangeCode}
        exchange={exchange ?? null}
        productLines={productLines}
      />
    </div>
  );
}
