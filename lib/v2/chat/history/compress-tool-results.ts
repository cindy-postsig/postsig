import type {
  SpendToolOutput,
  ContractSearchResult,
  PaymentTermsToolOutput,
  GroupsToolOutput,
  TagsToolOutput,
  ToolError,
} from '@/lib/v2/chat/types';
import { isToolError } from '@/lib/v2/chat/types';
import { QUERY_TOOL_NAME_SET } from '@/lib/v2/chat/tools/query-tool-names';

const MAX_SUMMARY_LENGTH = 200;

function truncate(text: string): string {
  if (text.length <= MAX_SUMMARY_LENGTH) return text;
  return text.substring(0, MAX_SUMMARY_LENGTH - 4) + '...]';
}

function plural(count: number, singular: string): string {
  return String(count) + ' ' + singular + (count === 1 ? '' : 's');
}

function estimateSize(output: unknown): number {
  try {
    return JSON.stringify(output).length;
  } catch {
    return 0;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function summarizeSpend(output: SpendToolOutput): string {
  if (isToolError(output))
    return truncate('[Tool: calculate_spend -> error: ' + output.error + ']');
  if (output.summary)
    return truncate('[Tool: calculate_spend -> ' + output.summary + ']');
  if (output.type === 'vendor_total') {
    return truncate(
      '[Tool: calculate_spend -> ' +
        output.vendorName +
        ' TCV=$' +
        String(output.totals.totalContractValueUSD) +
        ', ' +
        plural(output.contractCount, 'contract') +
        ']',
    );
  }
  if (output.type === 'single_contract') {
    return truncate(
      '[Tool: calculate_spend -> contract #' +
        String(output.contract.contractId) +
        ', ' +
        String(output.contract.vendorName) +
        ', TCV=$' +
        String(output.contract.totalContractValueUSD) +
        ']',
    );
  }
  return truncate('[Tool: calculate_spend -> result]');
}

function summarizeDataQuery(
  toolName: string,
  obj: Record<string, unknown>,
): string {
  const contracts = Array.isArray(obj.contracts) ? obj.contracts.length : 0;
  const excerpts = Array.isArray(obj.excerpts) ? obj.excerpts.length : 0;
  return truncate(
    '[Tool: ' +
      toolName +
      ' -> ' +
      plural(contracts, 'contract') +
      ', ' +
      plural(excerpts, 'excerpt') +
      ']',
  );
}

function summarizePriceIncrease(
  toolName: string,
  obj: Record<string, unknown>,
): string {
  const count = typeof obj.count === 'number' ? obj.count : 0;
  const total =
    typeof obj.totalIncreaseUSD === 'number' ? obj.totalIncreaseUSD : 0;
  return truncate(
    '[Tool: ' +
      toolName +
      ' -> ' +
      plural(count, 'contract') +
      ', total increase $' +
      String(total) +
      ']',
  );
}

const COUNTED_QUERY_TYPES = new Set([
  'billing_frequency',
  'usage_restrictions',
  'discounts',
  'dora_compliance',
  'nda_risk',
  'asset_class',
]);

function summarizeCountedQuery(
  toolName: string,
  obj: Record<string, unknown>,
): string {
  const count =
    typeof obj.count === 'number'
      ? obj.count
      : Array.isArray(obj.contracts)
        ? obj.contracts.length
        : 0;
  return truncate(
    '[Tool: ' + toolName + ' -> ' + plural(count, 'result') + ']',
  );
}

function summarizeQueryContractsByType(
  toolName: string,
  type: string,
  obj: Record<string, unknown>,
): string | null {
  if (type === 'data_query') return summarizeDataQuery(toolName, obj);
  if (type === 'price_increase') return summarizePriceIncrease(toolName, obj);
  if (COUNTED_QUERY_TYPES.has(type))
    return summarizeCountedQuery(toolName, obj);
  return null;
}

function summarizeSearchArray(
  toolName: string,
  results: ContractSearchResult[],
): string {
  if (results.length === 0)
    return '[Tool: ' + toolName + ' -> 0 contracts found]';
  const ids = results.slice(0, 5).map((r) => r.id);
  const vendors = [
    ...new Set(results.map((r) => r.vendorName).filter(Boolean)),
  ];
  const vendorStr =
    vendors.length > 0 ? " for '" + String(vendors[0]) + "'" : '';
  const tail = results.length > 5 ? '...' : '';
  return truncate(
    '[Tool: ' +
      toolName +
      ' -> ' +
      plural(results.length, 'contract') +
      ' found' +
      vendorStr +
      ', IDs: ' +
      ids.join(',') +
      tail +
      ']',
  );
}

function isSearchResultArray(arr: unknown[]): arr is ContractSearchResult[] {
  if (arr.length === 0) return false;
  const first = arr[0] as Record<string, unknown>;
  return 'vendorName' in first && 'currentSpend' in first;
}

function summarizeQueryContractsObject(
  toolName: string,
  obj: Record<string, unknown>,
): string {
  const type = typeof obj.type === 'string' ? obj.type : null;
  if (type === 'list_contracts') {
    const count = Array.isArray(obj.contracts) ? obj.contracts.length : 0;
    return truncate(
      '[Tool: ' + toolName + ' -> ' + plural(count, 'contract') + ' returned]',
    );
  }
  if (type) {
    const summarized = summarizeQueryContractsByType(toolName, type, obj);
    if (summarized) return summarized;
  }
  if (typeof obj.count === 'number' && Array.isArray(obj.contracts)) {
    return truncate(
      '[Tool: ' + toolName + ' -> ' + plural(obj.count, 'result') + ']',
    );
  }
  return truncate(
    '[Tool: ' +
      toolName +
      ' -> result (' +
      String(estimateSize(obj)) +
      ' chars)]',
  );
}

function summarizeQueryContracts(toolName: string, output: unknown): string {
  if (output === null || output === undefined)
    return '[Tool: ' + toolName + ' -> no result]';
  if (Array.isArray(output)) {
    if (isSearchResultArray(output))
      return summarizeSearchArray(toolName, output);
    return truncate(
      '[Tool: ' + toolName + ' -> ' + plural(output.length, 'result') + ']',
    );
  }
  const obj = asRecord(output);
  if (!obj)
    return truncate(
      '[Tool: ' +
        toolName +
        ' -> result (' +
        String(estimateSize(output)) +
        ' chars)]',
    );
  return summarizeQueryContractsObject(toolName, obj);
}

function summarizePaymentTerms(output: PaymentTermsToolOutput): string {
  if (isToolError(output))
    return truncate(
      '[Tool: summarize_payment_terms -> error: ' + output.error + ']',
    );
  if (output.summary)
    return truncate(
      '[Tool: summarize_payment_terms -> ' + output.summary + ']',
    );
  return truncate(
    '[Tool: summarize_payment_terms -> ' +
      output.vendorName +
      ', ' +
      plural(output.contractCount, 'contract') +
      ', ' +
      plural(output.lineageGroups, 'group') +
      ']',
  );
}

function summarizeGroups(output: GroupsToolOutput): string {
  if (isToolError(output))
    return truncate('[Tool: get_groups -> error: ' + output.error + ']');
  if (output.type === 'group_contracts') {
    return truncate(
      "[Tool: get_groups -> group '" +
        output.groupName +
        "', " +
        plural(output.contractCount, 'contract') +
        ', ' +
        plural(output.memberCount, 'member') +
        ']',
    );
  }
  if (output.type === 'org_groups')
    return truncate(
      '[Tool: get_groups -> org_groups, ' +
        plural(output.groups.length, 'group') +
        ']',
    );
  if (output.type === 'vendor_groups')
    return truncate(
      "[Tool: get_groups -> vendor '" +
        output.vendorName +
        "', " +
        plural(output.groups.length, 'group') +
        ']',
    );
  return truncate(
    '[Tool: get_groups -> result (' + String(estimateSize(output)) + ' chars)]',
  );
}

function summarizeTags(output: TagsToolOutput): string {
  if (isToolError(output))
    return truncate('[Tool: query_tags -> error: ' + output.error + ']');
  if (output.type === 'contract_tags')
    return truncate(
      '[Tool: query_tags -> contract_tags, ' +
        plural(output.contracts.length, 'contract') +
        ']',
    );
  if (output.type === 'org_tags') {
    return truncate(
      '[Tool: query_tags -> org_tags, ' +
        plural(output.tags.length, 'tag') +
        ', ' +
        plural(output.totalContracts, 'contract') +
        ']',
    );
  }
  if (output.type === 'contracts_by_tag')
    return truncate(
      "[Tool: query_tags -> contracts_by_tag '" +
        output.tagName +
        "', " +
        plural(output.contracts.length, 'contract') +
        ']',
    );
  if (output.type === 'untagged_contracts')
    return truncate(
      '[Tool: query_tags -> untagged_contracts, ' +
        plural(output.count, 'contract') +
        ']',
    );
  return truncate(
    '[Tool: query_tags -> result (' + String(estimateSize(output)) + ' chars)]',
  );
}

function summarizeUnknown(toolName: string, output: unknown): string {
  return truncate(
    '[Tool: ' +
      toolName +
      ' -> result (' +
      String(estimateSize(output)) +
      ' chars)]',
  );
}

export function summarizeToolResult(toolName: string, output: unknown): string {
  if (output === null || output === undefined)
    return '[Tool: ' + toolName + ' -> no output]';
  if (typeof output === 'string') return output;
  if (isToolError(output as Record<string, unknown>))
    return truncate(
      '[Tool: ' + toolName + ' -> error: ' + (output as ToolError).error + ']',
    );
  if (toolName === 'calculate_spend')
    return summarizeSpend(output as SpendToolOutput);
  if (QUERY_TOOL_NAME_SET.has(toolName))
    return summarizeQueryContracts(toolName, output);
  if (toolName === 'summarize_payment_terms')
    return summarizePaymentTerms(output as PaymentTermsToolOutput);
  if (toolName === 'get_groups')
    return summarizeGroups(output as GroupsToolOutput);
  if (toolName === 'query_tags') return summarizeTags(output as TagsToolOutput);
  if (toolName === 'get_current_date') return String(output);
  return summarizeUnknown(toolName, output);
}

export function extractToolResultValue(output: unknown): unknown {
  const obj = asRecord(output);
  if (!obj) return output;
  const type = obj.type;
  if ((type === 'json' || type === 'text') && 'value' in obj) return obj.value;
  return output;
}
