import VersionComparisonView from '@/components/exchange-agreements/VersionComparisonView';
import {
  ALL_PRODUCT_LINES,
  getFeeScheduleDataset,
  getVersionsFromDataset,
  scopeDatasetToProductLine,
} from '@/lib/exchange-agreement/feeSchedules';
import { EXCHANGE_CODE } from '@/lib/exchange-agreement/types';
import { resolveSearchParams } from '@/lib/exchange-agreement/searchParams';

export default async function VersionComparisonPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{ productLine?: string }>;
}) {
  const searchParams = await resolveSearchParams(searchParamsPromise);
  const productLine = searchParams?.productLine ?? ALL_PRODUCT_LINES;
  const dataset = await getFeeScheduleDataset(EXCHANGE_CODE);
  const currency = dataset?.exchange.currency ?? '€';
  const versions = dataset ? getVersionsFromDataset(dataset, productLine) : [];
  const scopedDataset =
    dataset && scopeDatasetToProductLine(dataset, productLine);

  return (
    <VersionComparisonView
      key={productLine}
      productLine={productLine}
      versions={versions}
      currency={currency}
      dataset={scopedDataset}
    />
  );
}
