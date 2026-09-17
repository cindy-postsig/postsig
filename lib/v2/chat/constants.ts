/**
 * Chat Constants
 *
 * Shared constants for chat tools and components.
 */

// =============================================================================
// RESULT LIMITS
// =============================================================================

/**
 * Maximum number of results to return from query_contracts search queryType
 * Backend tool limit - how many results tools fetch from database
 */
export const SEARCH_RESULT_LIMIT = 200;

/**
 * Maximum number of results to return from query_contracts tool
 * Backend tool limit - how many results tools fetch from database
 */
export const QUERY_RESULT_LIMIT = 200;

/**
 * Maximum number of contracts to display before showing "+X more"
 * Frontend display limit - how many items shown before "+X more" indicator
 */
export const DISPLAY_RESULT_LIMIT = 200;

/**
 * Maximum length for contract summary truncation
 */
export const SUMMARY_TRUNCATE_LENGTH = 100;

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Default currency for financial values
 */
export const DEFAULT_CURRENCY = 'USD';

// =============================================================================
// SPEND TOOL
// =============================================================================

/**
 * Contract fields required by the spend calculation tool.
 * Shared between spend tool and query-contracts guidance.
 */
export const SPEND_CONTRACT_FIELDS = [
  'ai_extraction_status',
  'annual_increase',
  'currency',
  'multi_year',
  'renewal_period',
  'subscription_term',
  'will_not_renew',
  'annual_increase_months',
  'billing_frequency',
] as const;
