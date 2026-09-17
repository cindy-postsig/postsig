import ProductExplorerTable from '@/components/exchange-agreements/ProductExplorerTable';
import {
  ALL_PRODUCT_LINES,
  getFeeScheduleDataset,
  getProductExplorerFromDataset,
  getVersionsFromDataset,
  scopeDatasetToProductLine,
} from '@/lib/exchange-agreement/feeSchedules';
import { EXCHANGE_CODE } from '@/lib/exchange-agreement/types';
import { resolveSearchParams } from '@/lib/exchange-agreement/searchParams';

export default async function ProductExplorerPage({
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

  // Scoped down before crossing the server/client boundary -- the client
  // only needs this productLine's rows, not the whole exchange's.
  const scopedDataset =
    dataset && scopeDatasetToProductLine(dataset, productLine);

  return (
    <ProductExplorerTable
      key={productLine}
      productLine={productLine}
      rows={rows}
      versionLabel={versionLabel}
      dataset={scopedDataset}
    />
  );
}
