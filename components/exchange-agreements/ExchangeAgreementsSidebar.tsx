'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import ExchangeSelector from './ExchangeSelector';
import ProductLineSelector from './ProductLineSelector';
import {
  ProductFilterAccordion,
  ResetFiltersButton,
  filterOptionsFrom,
} from './ProductFilterBar';
import {
  ALL_PRODUCT_LINES,
  getLatestLineItemsFromDataset,
  getProductLineNamesFromDataset,
  type FeeScheduleDataset,
} from '@/lib/exchange-agreement/feeScheduleQueries';
import { EXCHANGE_CODE } from '@/lib/exchange-agreement/types';
import type { ExchangeSummary } from '@/lib/exchange-agreement/types';

// Maps a pathname to the sidebar variant it wants -- the one place a new
// route must make an explicit choice, rather than falling into a default.
type Variant = 'browse' | 'products' | 'lineFilters';

function variantForPathname(pathname: string): Variant {
  if (pathname === '/exchange-agreements') return 'browse';
  if (pathname === '/exchange-agreements/product-lines') return 'products';
  return 'lineFilters'; // product-explorer, version-comparison, my-list
}

interface Props {
  exchanges: ExchangeSummary[];
  // Fetched server-side for EXCHANGE_CODE only; guarded below against
  // whatever exchange is actually selected so switching exchanges falls
  // back to empty rather than showing euronext's data under the wrong tab.
  dataset: FeeScheduleDataset | null;
}

export default function ExchangeAgreementsSidebar({
  exchanges,
  dataset,
}: Props) {
  const router = useRouter();
  const variant = variantForPathname(usePathname());

  // shallow: false -- exchange/productLine drive server-rendered data, so
  // the URL update must trigger a refetch, not just patch history state.
  const [exchange, setExchange] = useQueryState('exchange', {
    defaultValue: EXCHANGE_CODE,
    history: 'push',
    shallow: false,
  });
  const [productLine, setProductLine] = useQueryState('productLine', {
    defaultValue: ALL_PRODUCT_LINES,
    history: 'push',
    shallow: false,
  });
  const [query, setQuery] = useQueryState('q', {
    defaultValue: '',
    history: 'push',
  });

  const relevantDataset =
    dataset && dataset.exchange.code === exchange ? dataset : null;

  const productLines = useMemo(
    () =>
      relevantDataset ? getProductLineNamesFromDataset(relevantDataset) : [],
    [relevantDataset],
  );

  const filterOptions = useMemo(
    () =>
      variant === 'products'
        ? null
        : filterOptionsFrom(
            relevantDataset
              ? getLatestLineItemsFromDataset(relevantDataset, productLine)
              : [],
          ),
    [variant, relevantDataset, productLine],
  );

  // Switching exchanges strands whatever specific product line was picked
  // in the old one, so fall back to "All" rather than a name that no longer
  // resolves to anything.
  const handleExchangeChange = (code: string) => {
    setExchange(code);
    setProductLine(ALL_PRODUCT_LINES);
  };

  // No overflow-y-auto/h-full here -- there's no ancestor that gives h-full
  // a real height to resolve against, so the page scrolls as a whole
  // document (matching ContractsSidebar's pattern). min-h-[calc(100vh-3.5rem)]
  // extends the border/background the full page height even when the
  // sidebar's own content is short; sticky top-14 (below the fixed 3.5rem
  // app header) keeps the content pinned while everything else scrolls.
  // (The lineFilters variant below opts out of this: its product line +
  // filter lists can grow far taller than the viewport, so it scrolls
  // independently instead.)
  if (variant === 'browse') {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] w-56 shrink-0 border-r border-border bg-background 3xl:w-64">
        <div className="sticky top-14">
          <ExchangeSelector
            exchanges={exchanges}
            value={null}
            onChange={(code) =>
              router.push(`/exchange-agreements/product-lines?exchange=${code}`)
            }
          />
        </div>
      </div>
    );
  }

  if (variant === 'products') {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] w-56 shrink-0 border-r border-border bg-background 3xl:w-64">
        <div className="sticky top-14">
          <ExchangeSelector
            exchanges={exchanges}
            value={exchange}
            onChange={handleExchangeChange}
          />
          <div className="space-y-2 px-4 py-4">
            <p className="font-label text-xs uppercase tracking-wide text-foreground/85">
              Product Line
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search product lines"
                value={query}
                onChange={(e) => setQuery(e.target.value || null)}
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Unlike the other variants, this sidebar's own content (product line +
  // asset class/use type/level lists) can far exceed the viewport height, so
  // it gets a real height (h- instead of min-h-) and overflow-y-auto to
  // scroll independently, rather than growing the whole document -- opening
  // a long filter list no longer takes the main content view along with it.
  return (
    <div className="sticky top-14 h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r border-border bg-background 3xl:w-64">
      <ExchangeSelector
        exchanges={exchanges}
        value={exchange}
        onChange={handleExchangeChange}
      />

      <ProductLineSelector
        productLines={productLines}
        value={productLine}
        onChange={setProductLine}
      />

      {filterOptions && (
        <ProductFilterAccordion
          assetClasses={filterOptions.assetClasses}
          useTypes={filterOptions.useTypes}
          levels={filterOptions.levels}
        />
      )}

      <div className="p-4">
        <ResetFiltersButton />
      </div>
    </div>
  );
}
