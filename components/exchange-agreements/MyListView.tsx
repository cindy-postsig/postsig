'use client';

import { useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHeaderRow, type SortableColumn } from './SortableTableHead';
import FeeScheduleVersionSwitcher from './FeeScheduleVersionSwitcher';
import ProductDetailSheet from './ProductDetailSheet';
import {
  matchesProductFilters,
  useProductFilterParams,
} from './ProductFilterBar';
import { formatFeeAmount } from '@/lib/exchange-agreement/format';
import {
  getProductHistoryFromDataset,
  getProductIdsByVersion,
  type FeeScheduleDataset,
  type ProductExplorerRow,
} from '@/lib/exchange-agreement/feeScheduleQueries';
import type { FeeScheduleVersion } from '@/lib/exchange-agreement/types';
import { useExchangeAgreementMyList } from '@/hooks/useExchangeAgreementMyList';
import { useFeeScheduleVersionSelector } from '@/hooks/useFeeScheduleVersionSelector';
import { useSortableRows } from '@/hooks/useSortableRows';

interface Props {
  productLine: string;
  rows: ProductExplorerRow[];
  versionLabel: string | null;
  dataset: FeeScheduleDataset | null;
}

interface SavedRow {
  productLine: string;
  row: ProductExplorerRow;
}

type SortKey =
  | 'title'
  | 'productLine'
  | 'assetClass'
  | 'useType'
  | 'level'
  | 'currentFee';

const COLUMNS: SortableColumn<SortKey>[] = [
  { key: 'title', label: 'Product' },
  { key: 'productLine', label: 'Product Line' },
  { key: 'assetClass', label: 'Asset Class' },
  { key: 'useType', label: 'Use Type' },
  { key: 'level', label: 'Level' },
  { key: 'currentFee', label: 'Current Price', align: 'right' },
];

export default function MyListView({
  productLine,
  rows,
  versionLabel,
  dataset,
}: Props) {
  const { productIds, toggle } = useExchangeAgreementMyList();
  const [selected, setSelected] = useState<{
    productLine: string;
    productId: string;
  } | null>(null);
  const [filters] = useProductFilterParams();

  const {
    versions,
    selectedVersionId,
    setSelectedVersionId,
    selectedVersion,
    rows: sourceRows,
  } = useFeeScheduleVersionSelector(dataset, productLine, rows);

  const savedRows = useMemo(
    () =>
      sourceRows
        .filter((row) => productIds.includes(row.productId))
        .filter((row) => matchesProductFilters(row, filters))
        .map((row) => ({ productLine: row.productLine, row })),
    [sourceRows, productIds, filters],
  );

  // How many of the user's saved products show up in each version -- lets
  // the dropdown say up front which versions are worth switching to instead
  // of the user discovering an empty result one click at a time. Membership
  // sets (not full row data) so this stays O(versions) instead of paying for
  // trend/diff data the count doesn't use.
  const productIdsByVersion = useMemo(
    () => (dataset ? getProductIdsByVersion(dataset, productLine) : null),
    [dataset, productLine],
  );

  const latestSavedCount = useMemo(
    () => rows.filter((row) => productIds.includes(row.productId)).length,
    [rows, productIds],
  );

  const savedCount = (version: FeeScheduleVersion | null): number => {
    if (!version) return latestSavedCount;
    const idsInVersion = productIdsByVersion?.get(version.id);
    if (!idsInVersion) return 0;
    return productIds.filter((id) => idsInVersion.has(id)).length;
  };

  const { sorted, sort, toggleSort } = useSortableRows<SavedRow, SortKey>(
    savedRows,
    {
      title: (saved) => saved.row.title,
      productLine: (saved) => saved.productLine,
      assetClass: (saved) => saved.row.assetClass,
      useType: (saved) => saved.row.useType,
      level: (saved) => saved.row.level,
      currentFee: (saved) => saved.row.currentFee,
    },
    { key: 'title', direction: 'asc' },
  );

  const history = useMemo(
    () =>
      selected && dataset
        ? getProductHistoryFromDataset(
            dataset,
            selected.productLine,
            selected.productId,
          )
        : null,
    [dataset, selected],
  );

  return (
    <>
      <ProductDetailSheet
        history={history}
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
      />

      {/* Stays visible even when the selected version has none of the
          user's saved products -- otherwise switching to an empty version
          hides the only control that lets them switch back. */}
      {productIds.length > 0 && (
        <FeeScheduleVersionSwitcher
          label={selectedVersion?.label ?? versionLabel}
          versions={versions}
          selectedVersionId={selectedVersionId}
          onSelect={setSelectedVersionId}
          renderTrailing={(version) => {
            const count = savedCount(version);
            return count > 0 ? (
              <span className="text-xs text-muted-foreground">{count}</span>
            ) : null;
          }}
        />
      )}

      {savedRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-16 text-center">
          <Star className="mb-3 h-6 w-6 text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">
            {productIds.length === 0 ? (
              <>
                No saved products yet. Open a product in the Product Explorer
                and choose{' '}
                <span className="font-semibold text-foreground">
                  Add to List
                </span>{' '}
                to save it here.
              </>
            ) : (
              'None of your saved products are in this version. Try a different one from the dropdown above.'
            )}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            {savedRows.length} saved product{savedRows.length === 1 ? '' : 's'}
          </p>

          <Table stickyHeader scrollClassName="rounded-md border">
            <TableHeader>
              <SortableHeaderRow
                columns={COLUMNS}
                sort={sort}
                onSort={toggleSort}
              >
                <TableHead className="w-[100px] text-right">Action</TableHead>
              </SortableHeaderRow>
            </TableHeader>
            <TableBody>
              {sorted.map(({ productLine: rowProductLine, row }) => (
                <TableRow
                  key={`${rowProductLine}__${row.productId}`}
                  className="cursor-pointer"
                  onClick={() =>
                    setSelected({
                      productLine: rowProductLine,
                      productId: row.productId,
                    })
                  }
                >
                  <TableCell className="max-w-[360px]">{row.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {rowProductLine}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.assetClass ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.useType}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.level ?? '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {formatFeeAmount(row.currentFee, row.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      className="font-medium inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(row.productId);
                      }}
                    >
                      <Star className="h-3.5 w-3.5 fill-current" />
                      Remove
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </>
  );
}
