'use client';

import { type Table } from '@tanstack/react-table';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface TablePaginationProps<TData> {
  table: Table<TData>;
  /** Hide the strip when there's only one page. */
  hideWhenSinglePage?: boolean;
  showSizeSelector?: boolean;
  pageSizeOptions?: number[];
  /** Override page changes to drive URL-bound state. Defaults to `table.setPageIndex()`. */
  onPageChange?: (pageIndex: number) => void;
  className?: string;
}

// The bar's rendered footprint: mt-3 (12px) + h-8 buttons (32px). Containers
// that reserve space for a hidden bar (see ContractsTableClient) use this so
// the two can't drift apart.
export const PAGINATION_FOOTPRINT_CLASS = 'mb-11';

const MAX_PAGE_SLOTS = 7;

export function buildPageItems(
  currentPage: number,
  pageCount: number,
): (number | 'ellipsis')[] {
  if (pageCount <= MAX_PAGE_SLOTS) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const start = Math.max(2, Math.min(currentPage - 1, pageCount - 4));
  const end = Math.min(pageCount - 1, Math.max(currentPage + 1, 5));

  return [
    1,
    ...(start > 2 ? (['ellipsis'] as const) : []),
    ...Array.from({ length: end - start + 1 }, (_, i) => start + i),
    ...(end < pageCount - 1 ? (['ellipsis'] as const) : []),
    pageCount,
  ];
}

export function TablePagination<TData>({
  table,
  hideWhenSinglePage = false,
  showSizeSelector = false,
  pageSizeOptions = [25, 50, 100],
  onPageChange,
  className,
}: TablePaginationProps<TData>) {
  const pageCount = table.getPageCount();
  if (pageCount === 0 || (hideWhenSinglePage && pageCount <= 1)) return null;

  const { pageIndex, pageSize } = table.getState().pagination;
  const currentPage = pageIndex + 1;
  const goToPage =
    onPageChange ?? ((index: number) => table.setPageIndex(index));

  return (
    <div
      className={cn(
        'mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4',
        className,
      )}
    >
      <Pagination className="col-start-2">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => goToPage(pageIndex - 1)}
              disabled={!table.getCanPreviousPage()}
            />
          </PaginationItem>

          {buildPageItems(currentPage, pageCount).map((item, index) =>
            item === 'ellipsis' ? (
              <PaginationItem key={`ellipsis-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <PaginationLink
                  isActive={item === currentPage}
                  onClick={() => goToPage(item - 1)}
                  aria-label={`Go to page ${item}`}
                >
                  {item}
                </PaginationLink>
              </PaginationItem>
            ),
          )}

          <PaginationItem>
            <PaginationNext
              onClick={() => goToPage(pageIndex + 1)}
              disabled={!table.getCanNextPage()}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>

      {showSizeSelector && (
        <div className="col-start-3 flex items-center gap-2 justify-self-end">
          <span className="text-xs text-muted-foreground">Rows</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger className="h-8 w-[72px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
