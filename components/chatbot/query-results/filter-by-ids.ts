import type {
  QueryContractsResult,
  AnnualIncreaseResult,
  RecentUploadsResult,
  RecentUploadContract,
  ExpiringContract,
  RenewalContract,
} from '@/lib/v2/chat/client';
import { isToolError } from '@/lib/v2/chat/client';

function isRecentUploadsResult(
  data: QueryContractsResult | AnnualIncreaseResult,
): data is RecentUploadsResult {
  if (isToolError(data) || typeof data === 'string' || Array.isArray(data)) {
    return false;
  }
  if (
    !('count' in data) ||
    !('contracts' in data) ||
    !Array.isArray(data.contracts)
  ) {
    return false;
  }
  return data.contracts.every(
    (contract): contract is RecentUploadContract =>
      typeof contract === 'object' &&
      contract !== null &&
      'id' in contract &&
      'createdAt' in contract,
  );
}

function filterTypedResult(
  data: Exclude<QueryContractsResult | AnnualIncreaseResult, string>,
  ids: Set<number>,
): QueryContractsResult | AnnualIncreaseResult | null {
  if ('type' in data && data.type === 'data_query') {
    const contracts = data.contracts.filter((c) => ids.has(c.id));
    if (contracts.length === 0) return null;
    return {
      ...data,
      contracts,
      excerpts: data.excerpts.filter((e) => ids.has(e.contractId)),
    };
  }
  if ('type' in data && data.type === 'price_increase') {
    const contracts = data.contracts.filter((c) => ids.has(c.id));
    if (contracts.length === 0) return null;
    return {
      ...data,
      count: contracts.length,
      totalIncreaseUSD: contracts.reduce((s, c) => s + c.increaseUSD, 0),
      contracts,
    };
  }
  if ('type' in data && data.type === 'annual_increase') {
    const contracts = data.contracts.filter((c) => ids.has(c.id));
    if (contracts.length === 0) return null;
    return { ...data, contracts };
  }
  return null;
}

function filterCountBasedResult(
  data: Exclude<QueryContractsResult | AnnualIncreaseResult, string>,
  ids: Set<number>,
): QueryContractsResult | AnnualIncreaseResult | null {
  if ('totalRenewalExposure' in data) {
    const contracts = data.contracts.filter((c) =>
      ids.has(c.id),
    ) as RenewalContract[];
    if (contracts.length === 0) return null;
    return {
      ...data,
      count: contracts.length,
      totalRenewalExposure: contracts.reduce((s, c) => s + c.tcv, 0),
      contracts,
    };
  }
  if ('totalTCV' in data) {
    const contracts = data.contracts.filter((c) =>
      ids.has(c.id),
    ) as ExpiringContract[];
    if (contracts.length === 0) return null;
    return {
      ...data,
      count: contracts.length,
      totalTCV: contracts.reduce((s, c) => s + c.tcv, 0),
      contracts,
    };
  }
  return null;
}

export function filterQueryContractsResultByIds(
  data: QueryContractsResult | AnnualIncreaseResult,
  contractIds: number[],
): QueryContractsResult | AnnualIncreaseResult | null {
  if (
    isToolError(data) ||
    typeof data === 'string' ||
    contractIds.length === 0
  ) {
    return null;
  }

  const ids = new Set(contractIds);

  if (Array.isArray(data)) {
    const filtered = data.filter((item) => ids.has(item.id));
    return filtered.length > 0 ? (filtered as QueryContractsResult) : null;
  }

  const typed = filterTypedResult(data, ids);
  if (typed) return typed;

  const countBased = filterCountBasedResult(data, ids);
  if (countBased) return countBased;

  if (!('contracts' in data) || !Array.isArray(data.contracts)) return null;
  if (!isRecentUploadsResult(data)) return null;

  const contracts = data.contracts.filter((c) => ids.has(c.id));
  if (contracts.length === 0) return null;
  return { ...data, count: contracts.length, contracts };
}
