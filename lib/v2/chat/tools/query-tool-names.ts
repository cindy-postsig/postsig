export const QUERY_TOOL_NAMES = [
  'query_clause',
  'query_billing_frequency',
  'query_usage_restrictions',
  'query_expiring_contracts',
  'query_renewals',
  'query_discounts',
  'query_dora_compliance',
  'query_nda_risk',
  'query_asset_class',
  'query_recent_uploads',
  'query_price_increase',
  'query_unexecuted',
  'query_vendor_statistics',
  'query_seat_utilization',
  'query_annual_increase',
  'search_contracts',
  'list_contracts',
] as const;

export type QueryToolName = (typeof QUERY_TOOL_NAMES)[number];

export const QUERY_TOOL_NAME_SET = new Set<string>(QUERY_TOOL_NAMES);

export function isQueryToolType(type: string): boolean {
  return QUERY_TOOL_NAME_SET.has(type.replace('tool-', ''));
}
