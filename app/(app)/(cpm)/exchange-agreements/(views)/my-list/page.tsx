import MyListView from '@/components/exchange-agreements/MyListView';
import {
  ALL_PRODUCT_LINES,
  getFeeScheduleDataset,
  getProductExplorerFromDataset,
  getVersionsFromDataset,
  scopeDatasetToProductLine,
} from '@/lib/exchange-agreement/feeSchedules';
import { EXCHANGE_CODE } from '@/lib/exchange-agreement/types';
import { resolveSearchParams } from '@/lib/exchange-agreement/searchParams';

export default async function MyListPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{ productLine?: string }>;
}) {
  const searchParams = await resolveSearchParams(searchParamsPromise);
  const productLine = searchParams?.productLine ?? ALL_PRODUCT_LINES;
  const dataset = await getFeeScheduleDataset(EXCHANGE_CODE);
  const rows = dataset
    ? getProductExplorerFromDataset(dataset, productLine)
    : [];
  const versions = dataset ? getVersionsFromDataset(dataset, productLine) : [];
  const versionLabel =
    productLine === ALL_PRODUCT_LINES
      ? 'Latest versions'
      : (versions[0]?.label ?? null);
  const scopedDataset =
    dataset && scopeDatasetToProductLine(dataset, productLine);

  return (
    <div>
      <h2 className="font-medium mb-2 font-serif text-3xl">My List</h2>
      <MyListView
        key={productLine}
        productLine={productLine}
        rows={rows}
        versionLabel={versionLabel}
        dataset={scopedDataset}
      />
    </div>
  );
}
