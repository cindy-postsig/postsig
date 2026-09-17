import '@tanstack/react-table';
import { UserMetadata } from '@/constants/types';
import type { SortingFn } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends unknown, TValue> {
    className?: string;
  }

  interface SortingFns {
    conditional: SortingFn<unknown>;
    lineageAware: SortingFn<unknown>;
  }

  interface TableMeta<TData extends unknown> {
    groupByVendor?: boolean;
    nestByLineage?: boolean;
    userMetadata?: UserMetadata;
    settingsBasePath?: string;
    replacementFlaggedContractIds?: readonly number[];
    /** Report usage: the row itself opens a panel, so cell-level navigation links are disabled. */
    enableDiscrepancySheet?: boolean;
  }
}
