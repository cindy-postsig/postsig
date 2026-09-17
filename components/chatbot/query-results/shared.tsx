'use client';

import {
  formatCurrency,
  DISPLAY_RESULT_LIMIT,
  createBaseContractColumns,
} from '@/lib/v2/chat/client';
import { ContractCardList } from '@/components/chatbot/ContractCard';
import {
  DataTable,
  type ColumnConfig,
} from '@/components/chatbot/GenericDataTable';
import { format, isValid } from 'date-fns';

export { formatCurrency, DISPLAY_RESULT_LIMIT, createBaseContractColumns };
export type { ColumnConfig };

export const CONTRACT_CARD_THRESHOLD = 4;
export const QUERY_RESULTS_TABLE_SCROLL_AREA = 'max-h-[300px] overflow-y-auto';

export interface ContractCardItem {
  contractId: number;
  vendorName: string;
  contractType: string;
  summary?: string;
}

export interface BaseQueryContractsRow extends Record<string, unknown> {
  contractId: number;
  vendorName: string;
  contractType: string;
}

export function createCurrencyColumn<T extends Record<string, unknown>>(
  key: keyof T & string,
  header: string,
  currency?: string,
): ColumnConfig<T> {
  return {
    key,
    header,
    render: (value) => formatCurrency(value as number, currency),
    exportFormat: (value) => String(value),
    className: 'text-right',
    headerClassName: 'text-right',
  };
}

export function formatPercent(value: number): string {
  const normalized = Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, '');
  return `${normalized}%`;
}

export function formatDate(
  input: string | Date | null | undefined,
  pattern: string = 'yyyy-MM-dd',
): string {
  if (input == null) return '-';
  const date = input instanceof Date ? input : new Date(input);
  if (!isValid(date)) return typeof input === 'string' ? input : 'Unknown';
  return format(date, pattern);
}

export function renderContractsAsCardsOrTable<T extends BaseQueryContractsRow>({
  cards,
  rows,
  columns,
}: {
  cards: ContractCardItem[];
  rows: T[];
  columns: ColumnConfig<T>[];
}) {
  if (cards.length < CONTRACT_CARD_THRESHOLD) {
    return (
      <ContractCardList contracts={cards} maxItems={DISPLAY_RESULT_LIMIT} />
    );
  }

  const displayRows = rows.slice(0, DISPLAY_RESULT_LIMIT);
  const remainingCount = rows.length - displayRows.length;

  return (
    <div className="space-y-1">
      <DataTable
        data={displayRows}
        columns={columns}
        showExport={false}
        scrollAreaClassName={QUERY_RESULTS_TABLE_SCROLL_AREA}
        striped={true}
        hoverable={false}
        className="my-2"
      />
      {remainingCount > 0 && (
        <p className="text-[10px] text-muted-foreground">
          +{remainingCount} more contract{remainingCount !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

export function RemainingCount({
  rows,
  limit,
}: {
  rows: unknown[];
  limit: number;
}) {
  const remainingCount = rows.length - limit;
  if (remainingCount <= 0) return null;
  return (
    <p className="text-[10px] text-muted-foreground">
      +{remainingCount} more contract{remainingCount !== 1 ? 's' : ''}
    </p>
  );
}

export function ResultsTable<T extends Record<string, unknown>>({
  rows,
  columns,
}: {
  rows: T[];
  columns: ColumnConfig<T>[];
}) {
  const displayRows = rows.slice(0, DISPLAY_RESULT_LIMIT);
  const remainingCount = rows.length - displayRows.length;

  return (
    <>
      <DataTable
        data={displayRows}
        columns={columns}
        showExport={false}
        scrollAreaClassName={QUERY_RESULTS_TABLE_SCROLL_AREA}
        striped={true}
        hoverable={false}
        className="my-2"
      />
      {remainingCount > 0 && (
        <p className="text-[10px] text-muted-foreground">
          +{remainingCount} more contract{remainingCount !== 1 ? 's' : ''}
        </p>
      )}
    </>
  );
}
