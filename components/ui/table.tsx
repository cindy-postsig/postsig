import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Scroll box for a table with a sticky header.
 *
 * A sticky header needs a scrolling ancestor to stay put against, so the table
 * has to scroll in place rather than grow with the page. The cap leaves room
 * for the fixed app header plus a page's own heading and filter bar; views
 * with more or less chrome above the table override the height.
 */
const TABLE_SCROLL_CLASS = 'max-h-[calc(100vh-20rem)] overflow-auto';

/**
 * What `stickyHeader` adds to the `<table>`.
 *
 * `position: sticky` only holds a header row in place when the table uses
 * separated borders: under `border-collapse` the borders belong to the table
 * rather than the cells, so they scroll out from under the pinned row and the
 * header loses its rule. Separated borders in turn stop a `<tr>`'s own border
 * painting, so the body's row rules move onto the cells to keep it looking the
 * same. Child combinators throughout, so a nested table keeps its own layout.
 */
const STICKY_HEADER_CLASS = [
  'border-separate border-spacing-0',
  '[&>thead]:sticky [&>thead]:top-0 [&>thead]:z-20',
  '[&>thead]:bg-background [&>thead>tr>th]:border-b',
  '[&>tbody>tr>*]:border-b [&>tbody>tr:last-child>*]:border-b-0',
].join(' ');

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & {
    /** Pin the header row while the body scrolls. */
    stickyHeader?: boolean;
    /**
     * Extra classes for the scroll box `stickyHeader` puts around the table —
     * the caller's border and radius, or a different height cap. `null` when
     * the table already sits in a scrollport of its own (a dialog body, a
     * `ScrollArea`), which the header should stay put against instead.
     */
    scrollClassName?: string | null;
  }
>(({ className, stickyHeader, scrollClassName, ...props }, ref) => (
  <div
    className={cn(
      'relative w-full',
      stickyHeader && scrollClassName !== null && TABLE_SCROLL_CLASS,
      stickyHeader && scrollClassName,
    )}
  >
    <table
      ref={ref}
      className={cn(
        'w-full caption-bottom border-collapse text-[0.825rem] 3xl:text-[0.85rem]',
        stickyHeader && STICKY_HEADER_CLASS,
        className,
      )}
      {...props}
    />
  </div>
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      'top-0 z-10 bg-transparent font-sans text-[.8em] [&_tr]:border-b',
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'font-medium border-t bg-muted/50 [&>tr]:last:border-b-0',
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      'border-b font-sans-neue transition duration-300 ease-in-out data-[state=selected]:bg-primary/7 hover:bg-hover data-[state=selected]:hover:bg-primary/7',
      className,
    )}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'font-normal bg-background px-3 py-[6px] text-left align-middle font-sans leading-tight text-muted-foreground group-[.is-card]:bg-transparent [&:has([role=checkbox])]:pr-0',
      'first:rounded-tl last:rounded-tr',
      className,
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn('p-3 align-middle [&:has([role=checkbox])]:pr-0', className)}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('mt-4 text-sm text-muted-foreground', className)}
    {...props}
  />
));
TableCaption.displayName = 'TableCaption';

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
