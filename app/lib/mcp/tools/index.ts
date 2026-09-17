import { cpmMcpTools } from './cpm';
import { investorMcpTools } from './investor';
import type { McpToolDef } from './types';

export { cpmMcpTools, investorMcpTools };

// Per-endpoint registration must use the module-specific arrays above so a
// token cannot reach tools outside its module. allMcpTools is for
// cross-module concerns only (telemetry, name-to-module lookups).
export const allMcpTools: McpToolDef[] = [...cpmMcpTools, ...investorMcpTools];

export const READ_TOOL_NAMES = new Set([
  'list_contracts',
  'get_contract',
  'query_contracts',
  'search_contract_clauses',
  'list_vendors',
  'get_vendor',
  'get_report_data',
  'get_upcoming_renewals',
  'get_renewal_summary',
  'get_spend',
  'get_spend_breakdown',
  'get_price_history',
  'list_tags',
  'get_contract_lineage',
  'get_groups',
  'list_portfolio_companies',
  'get_portfolio_company',
  'get_company_cap_table',
  'get_company_transactions',
  'get_company_legal_terms',
  'get_company_board',
  'get_company_securities',
  'get_company_financing_rounds',
  'list_funds',
]);

export const WRITE_TOOL_NAMES = new Set([
  'update_contract',
  'add_users_to_contract',
]);

export type { McpToolDef } from './types';
