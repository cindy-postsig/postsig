import { SortingFn, TableMeta, ColumnMeta } from '@tanstack/react-table';

declare module '@tanstack/table-core' {
  interface SortingFns {
    conditional?: SortingFn<any>;
  }
  interface TableOptions<TData> {
    sortingFns?: Record<string, SortingFn<TData>>;
  }
  interface ColumnMeta<TData, TValue> {
    className?: string;
  }
}

declare module '@tanstack/react-table' {
  interface TableMeta<TData extends RowData, TValue> {
    groupByVendor?: boolean;
  }
}
