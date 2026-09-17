'use client';

import type { ContractSearchResult, ToolError } from '@/lib/v2/chat/client';
import { formatCurrency, isToolError } from '@/lib/v2/chat/client';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { ContractCardList } from '@/components/chatbot/ContractCard';
import { useDateFormat } from '@/hooks/useDateFormat';
import { formatDate } from '@/lib/date-format';

interface SearchResultsSummaryProps {
  data: ContractSearchResult[] | ToolError;
}

export function SearchResultsSummary({ data }: SearchResultsSummaryProps) {
  const { dateFormat } = useDateFormat();
  const { baseCurrency } = useBaseCurrency();
  if (isToolError(data)) {
    if (data.error === '_NO_RESULTS_') {
      return null;
    }
    return (
      <p className="text-xs text-red-600 dark:text-red-400">{data.error}</p>
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  // Transform to ContractCard format
  const contracts = data.map((result) => ({
    contractId: result.id,
    vendorName: result.vendorName ?? 'Unknown Vendor',
    contractType: result.contractType ?? 'Contract',
    summary: buildSummary(result, dateFormat, baseCurrency),
  }));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Found {data.length} contract{data.length !== 1 ? 's' : ''}
      </p>
      <ContractCardList contracts={contracts} />
    </div>
  );
}

function buildSummary(
  result: ContractSearchResult,
  dateFormat: string,
  currency: string,
): string | undefined {
  const parts: string[] = [];

  if (result.productName) {
    parts.push(result.productName);
  }

  if (result.currentSpend && result.currentSpend > 0) {
    parts.push(`Spend: ${formatCurrency(result.currentSpend, currency)}`);
  }

  if (result.termStartDate && result.termEndDate) {
    parts.push(
      `Term: ${formatDate(result.termStartDate, dateFormat)} - ${formatDate(
        result.termEndDate,
        dateFormat,
      )}`,
    );
  }

  if (result.summary) {
    parts.push(result.summary);
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function SearchResultsSummaryLoading() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-3 w-32 rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-16 w-full rounded bg-muted" />
        <div className="h-16 w-full rounded bg-muted" />
      </div>
    </div>
  );
}
