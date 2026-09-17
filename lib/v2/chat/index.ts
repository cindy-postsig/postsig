/**
 * Chat Module Entry Point
 *
 * Public exports for the V2 chat service layer.
 * Import from here to use chat functionality throughout the application.
 */

// =============================================================================
// SERVICE
// =============================================================================

export {
  getChatTools,
  buildSystemPrompt,
  validateChatContext,
} from './service';

// =============================================================================
// TRANSFORMS
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
} from './transforms';

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Base types
  BaseContractItem,
  PermissionLevel,
  ToolError,
  // Search types
  ContractSearchResult,
  // Spend types
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
  // Input types
  CalculateSpendInput,
  QueryContractsInput,
  SummarizePaymentTermsInput,
  // Context types
  ChatContext,
} from './types';

export { isToolError, isExecutionError } from './types';

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
// COLUMNS
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

// =============================================================================
// TOOL FACTORIES (for advanced use cases)
// =============================================================================

export {
  createGetCurrentDateTool,
  createCalculateSpendTool,
  createClauseTool,
  createBillingFrequencyTool,
  createUsageRestrictionsTool,
  createExpiringContractsTool,
  createRenewalTool,
  createDiscountsTool,
  createDoraTool,
  createNdaRiskTool,
  createAssetClassTool,
  createRecentUploadsTool,
  createPriceIncreaseTool,
  createUnexecutedTool,
  createVendorStatisticsTool,
  createSeatUtilizationTool,
  createSearchContractsTool,
  createListContractsTool,
  createSummarizePaymentTermsTool,
  createGetGroupsTool,
  createQueryTagsTool,
  createSynthesisVendorIntelligenceTool,
  createChatToolCache,
  ChatToolCache,
} from './tools';
