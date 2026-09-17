/**
 * Chat Module Client Entry Point
 *
 * Client-safe exports for use in 'use client' components.
 * This module excludes server-only tools that use next/headers.
 *
 * Import from here in client components:
 * import { formatCurrency, isToolError } from '@/lib/v2/chat/client';
 */

// =============================================================================
// TRANSFORMS (client-safe utilities)
// =============================================================================

export {
  formatCurrency,
  roundToTwoDecimals,
  buildSingleContractSpendSummary,
  buildVendorSpendSummary,
  extractExcerptData,
  buildContractLink,
  truncateText,
  formatContractType,
  extractTCV,
  extractAnnualValue,
  extractProjectedValue,
  linkifyContractReferences,
} from './transforms';

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Base types
  BaseContractItem,
  PermissionLevel,
  // Search types
  ContractSearchResult,
  // Spend types
  MonthlyDataPoint,
  MonthlySpendReport,
  AmortizedDataPoint,
  AmortizedReport,
  ContractSpendDetail,
  SingleContractSpend,
  VendorTotalSpend,
  SpendResult,
  SpendError,
  SpendToolOutput,
  // Query types
  QueryType,
  ExcerptData,
  DataContract,
  DataQueryResult,
  BillingFrequencyContract,
  UsageRestrictionsContract,
  ExpiringContract,
  ExpiringContractsResult,
  RenewalContract,
  RenewalsResult,
  DiscountContract,
  DoraComplianceContract,
  NdaRiskContract,
  AssetClassContract,
  RecentUploadContract,
  RecentUploadsResult,
  PriceIncreaseContract,
  PriceIncreaseResult,
  AnnualIncreaseContract,
  AnnualIncreaseResult,
  QueryContractsResult,
  // Payment terms types
  PaymentTermsEntry,
  PaymentTermsLineageGroup,
  FlatPaymentTermsContract,
  PaymentTermsSummaryResult,
  PaymentTermsToolOutput,
  // Groups types
  GroupContractInfo,
  GroupResult,
  OrgGroupsResult,
  VendorGroupsResult,
  GroupsToolOutput,
  // Tags types
  TagInfo,
  ContractWithTags,
  TagsByContractResult,
  OrgTagsResult,
  ContractsByTagResult,
  UntaggedContractsResult,
  TagsToolOutput,
  // Synthesis types
  VendorSynthesisInput,
  SynthesisSection,
  VendorSynthesisResult,
  SynthesisToolOutput,
  ContractReference,
  // Input types
  CalculateSpendInput,
  QueryContractsInput,
  SummarizePaymentTermsInput,
  // Context types
  ChatContext,
} from './types';

export { isToolError, type ToolError } from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

export {
  SEARCH_RESULT_LIMIT,
  QUERY_RESULT_LIMIT,
  DISPLAY_RESULT_LIMIT,
  SUMMARY_TRUNCATE_LENGTH,
  DEFAULT_CURRENCY,
} from './constants';

// =============================================================================
// COLUMNS (for use with GenericDataTable)
// =============================================================================

export {
  createContractIdColumn,
  createVendorColumn,
  createContractTypeColumn,
  createPermissionColumn,
  createCurrencyColumn,
  createBaseContractColumns,
  createContractPermissionColumns,
} from './columns';

export type {
  ContractIdRow,
  VendorRow,
  ContractTypeRow,
  PermissionRow,
  CurrencyRow,
} from './columns';
