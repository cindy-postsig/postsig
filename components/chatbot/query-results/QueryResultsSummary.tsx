'use client';

import type {
  QueryContractsResult,
  DataQueryResult,
  RecentUploadsResult,
  ExpiringContractsResult,
  RenewalsResult,
  PriceIncreaseResult,
  AnnualIncreaseResult,
  BillingFrequencyContract,
  UsageRestrictionsContract,
  DiscountContract,
  DoraComplianceContract,
  NdaRiskContract,
  AssetClassContract,
  ContractSearchResult,
} from '@/lib/v2/chat/client';
import { isToolError } from '@/lib/v2/chat/client';
import { SearchResultsSummary } from '@/components/chatbot/SearchResultsSummary';
import {
  DataQuerySummary,
  RecentUploadsSummary,
  ExpiringContractsSummary,
  AutoRenewalSummary,
  PriceIncreaseSummary,
  AnnualIncreaseSummary,
  BillingFrequencySummary,
  UsageRestrictionsSummary,
  DiscountsSummary,
  DoraComplianceSummary,
  NdaRiskSummary,
  AssetClassSummary,
} from './summaries';

interface QueryResultsSummaryProps {
  data: QueryContractsResult | AnnualIncreaseResult;
}

function isContractSearchResultArray(
  data: unknown[],
): data is ContractSearchResult[] {
  if (data.length === 0) return false;
  const first = data[0] as Record<string, unknown>;
  return 'currentSpend' in first || 'termStartDate' in first;
}

function renderToolError(data: {
  error: string;
  noResults?: boolean;
  suggestion?: string;
}) {
  if (data.error === '_NO_RESULTS_') return null;
  if (data.noResults) {
    return (
      <p className="text-xs text-muted-foreground">
        {data.suggestion ?? 'No matching contracts found.'}
      </p>
    );
  }
  return <p className="text-xs text-red-600 dark:text-red-400">{data.error}</p>;
}

function renderTypedResult(
  data: QueryContractsResult | AnnualIncreaseResult,
): React.ReactNode | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return null;
  if (!('type' in data)) return null;

  if (data.type === 'list_contracts') return null;
  if (data.type === 'data_query')
    return <DataQuerySummary data={data as DataQueryResult} />;
  if (data.type === 'price_increase')
    return <PriceIncreaseSummary data={data as PriceIncreaseResult} />;
  if (data.type === 'annual_increase')
    return <AnnualIncreaseSummary data={data as AnnualIncreaseResult} />;
  return null;
}

function renderCountBasedResult(
  data: QueryContractsResult | AnnualIncreaseResult,
): React.ReactNode | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return null;
  if (!('count' in data)) return null;

  if (
    'contracts' in data &&
    Array.isArray(data.contracts) &&
    data.contracts.length > 0 &&
    'createdAt' in data.contracts[0]
  ) {
    return <RecentUploadsSummary data={data as RecentUploadsResult} />;
  }
  if ('totalRenewalExposure' in data)
    return <AutoRenewalSummary data={data as RenewalsResult} />;
  if ('totalTCV' in data)
    return <ExpiringContractsSummary data={data as ExpiringContractsResult} />;
  return null;
}

export function QueryResultsSummary({ data }: QueryResultsSummaryProps) {
  if (isToolError(data)) return renderToolError(data);
  if (typeof data === 'string') return null;

  if (Array.isArray(data)) {
    if (isContractSearchResultArray(data))
      return <SearchResultsSummary data={data} />;
    return <ArrayResultSummary data={data} />;
  }

  return renderTypedResult(data) ?? renderCountBasedResult(data);
}

function ArrayResultSummary({
  data,
}: {
  data:
    | BillingFrequencyContract[]
    | UsageRestrictionsContract[]
    | DiscountContract[]
    | DoraComplianceContract[]
    | NdaRiskContract[]
    | AssetClassContract[];
}) {
  if (data.length === 0)
    return <p className="text-xs text-muted-foreground"></p>;

  const first = data[0];

  if ('billingFrequency' in first && 'paymentTerms' in first)
    return (
      <BillingFrequencySummary data={data as BillingFrequencyContract[]} />
    );
  if ('scopeOfUse' in first || 'geoRestrictions' in first)
    return (
      <UsageRestrictionsSummary data={data as UsageRestrictionsContract[]} />
    );
  if ('discount' in first && !('doraScore' in first))
    return <DiscountsSummary data={data as DiscountContract[]} />;
  if ('doraScore' in first && 'missingCategories' in first)
    return <DoraComplianceSummary data={data as DoraComplianceContract[]} />;
  if ('riskLevel' in first && 'risks' in first)
    return <NdaRiskSummary data={data as NdaRiskContract[]} />;
  if ('assetClasses' in first)
    return <AssetClassSummary data={data as AssetClassContract[]} />;

  return null;
}

export function QueryResultsSummaryLoading() {
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
