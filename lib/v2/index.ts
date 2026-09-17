/**
 * V2 API Entry Point
 *
 * This is the main entry point for all V2 data services.
 * Import from here to ensure you're using the correct, canonical functions.
 *
 * Architecture:
 * - Services fetch and enrich data (lib/v2/{feature}/service.ts)
 * - Transforms shape data for UI (lib/v2/{feature}/transforms.ts)
 * - Core modules provide reusable enrichments (lib/v2/core/)
 *
 * @see docs/V2_API_ARCHITECTURE.md for full documentation
 */

// =============================================================================
// CONTRACTS
// =============================================================================

export {
  getContractsList,
  getContract,
  getBudgetContracts,
  getOldestContractFiscalYear,
  getPendingContracts,
  getArchivedContracts,
  getActiveAndArchivedContracts,
  updateContract,
  type EnrichedContract,
  type ContractsResult,
} from './contracts/service';

export {
  buildContractTableRow,
  buildContractTableRows,
  groupContractsByVendor,
} from './contracts/transforms';

// Contract Activities
export {
  getContractActivities,
  type ContractActivity,
  type ActivitiesResult,
} from './contracts/activities';

// Contract Documents & Versions
export {
  getContractDocuments,
  getLatestVersion,
  type ContractDocument,
  type DocumentsResult,
  type ContractVersion,
  type LatestVersionResult,
} from './contracts/documents';

// Contract Citations
export {
  getContractCitations,
  type CitationsResult,
} from './contracts/citations';
// Note: Citation type is re-exported from @/constants/types via citations.ts

// Amendment Chain
export {
  getAmendmentChain,
  type AmendmentContract,
  type AmendmentChainResult,
  type ContractHierarchy,
} from './contracts/amendments';

// Contract ACL
export {
  getContractACL,
  type ContractACLResult,
  type FolderACL,
  type ACL,
  type User as ACLUser,
  type Group as ACLGroup,
  type PermissionLevel,
} from './contracts/acl';

// Contract Editing (read operations only - mutations are Server Actions)
export {
  hasContractVersions,
  getOriginalContractVersion,
  getOriginalProductVersions,
} from './contracts/edit/service';
export type {
  OriginalProductVersions,
  OriginalProductDetail,
  OriginalProductUser,
  OriginalVendorProduct,
} from './contracts/edit/service';

// Types for contract editing (used by both v2 reads and Server Actions)
export type {
  PendingChanges,
  FieldChange,
  SaveContractEditsResult,
} from './contracts/edit/types';

// Product Transforms
export {
  hasFeeOverrides,
  getCurrentTermProducts,
  convertAllProductsToUSD,
} from './products/transforms';

// =============================================================================
// INVENTORY
// =============================================================================

export { getInventoryList, type InventoryResult } from './inventory/service';

export type { InventoryItem } from './inventory/types';

export {
  buildInventoryItem,
  groupInventoryByVendor,
  filterInventoryByVendor,
} from './inventory/transforms';

// =============================================================================
// PRODUCTS
// =============================================================================

export {
  getProductsList,
  enrichContractProducts,
  type ProductsResult,
  type ContractProductsResult,
  type ContractProduct,
} from './products/service';

// =============================================================================
// DASHBOARD
// =============================================================================

export { getDashboardData, type DashboardData } from './dashboard/service';

// =============================================================================
// CALENDAR
// =============================================================================

export {
  getCalendarData,
  type CalendarResult,
  type CalendarRange,
} from './calendar/service';

// =============================================================================
// VENDORS
// =============================================================================

export {
  getVendorContractsWithMetrics,
  fetchVendorDetails,
  fetchVendorOrgDetails,
  getVendorCurrentFySpend,
  getVendorInventory,
  getVendorSpendIndex,
} from './vendors/service';

export {
  aggregateTopVendors,
  buildVendorListRows,
  type TopVendor,
  type VendorListRow,
  type VendorProductRow,
  type VendorProductSpend,
  type VendorSpendIndex,
  type VendorSpendTotals,
  type VendorTableRow,
} from './vendors/transforms';

// =============================================================================
// BLOOMBERG SID
// =============================================================================

export {
  getVendorFirmwideAccounts,
  getVendorSidProducts,
  getVendorSidReport,
} from './bloomberg-sid/service';

export { sidProductInventoryItems } from './bloomberg-sid/transforms';

export type {
  SidReport,
  SidReportMonth,
  SidAccount,
  SidSubscription,
  SidExchangeFee,
  SidExchangeFeeLine,
  SidKey,
  SidHrMatch,
  SidReportFile,
  SidProductSummary,
} from './bloomberg-sid/report';

// =============================================================================
// REPORTS
// =============================================================================

export {
  buildReportFromContracts,
  getReportData,
  getReportSummary,
  getMultipleReportSummaries,
} from './reports/service';

export { reportPipelines } from './reports/definitions';

export { getMissingFields } from './reports/transforms/missing-clauses';

export type {
  ReportPipeline,
  ReportData,
  ReportSummary,
  FilterResult,
  PipelineOptions,
} from './reports/pipeline/types';

// =============================================================================
// GROUPS
// =============================================================================

export {
  getContractBusinessGroups,
  getGroupsWithContracts,
  getContractIdsForGroup,
  type ContractGroup,
} from './groups/service';

// =============================================================================
// CORE TYPES
// =============================================================================

export type {
  ContractBase,
  ContractWithLineage,
  ContractWithPricing,
  ProductWithLineage,
  ProductWithPricing,
  EnrichedProduct,
  InheritedCancelByDate,
  // Subrow types
  ProductSubRow,
  ReportSubRow,
  ContractSubRow,
  // Table row types
  ContractTableRow,
  VendorGroupRow,
  CurrentProduct,
  ContractTag,
  AssetClass,
} from './core/types';

// =============================================================================
// CORE FILTERS
// =============================================================================

export {
  // Status filters
  filterActiveContracts,
  applyDefaultFilters,
  filterExcludeInvoices,
  // Date filters
  filterByDateRange,
  // Budget filters
  filterToBudgetContracts,
  // Aggregation filters - use these to avoid double-counting
  filterForAggregation,
  // Types
  type DateRangeResult,
} from './core/filters';

// =============================================================================
// CORE BUDGET UTILITIES
// =============================================================================

export {
  // Aggregation utilities
  shouldExcludeFromAggregations,
  getContributingProducts,
  getEffectiveFee,
  getEffectiveTCV,
  sumValuesInUSD,
  getUSDValue,
  // Budget calculations
  calculateBudgetTotals,
  sumContractValuesInUSD,
  buildBudgetSummary,
  type BudgetSummary,
  type BudgetTotals,
} from './core/budget';

// =============================================================================
// CORE ENRICHMENT FUNCTIONS
// =============================================================================

export {
  enrichWithLineage,
  filterToOnePerFamily,
  deriveCancelByDateFromParent,
  formatInheritedCancelByTooltip,
} from './core/lineage';

export { enrichWithPricing, enrichWithEffectiveFees } from './core/pricing';

export { extractProducts } from './core/products';

export { getExchangeRates, convertToUSD } from './core/currency';

// =============================================================================
// CHAT
// =============================================================================

export {
  // Service
  getChatTools,
  buildSystemPrompt,
  validateChatContext,
  // Transforms
  formatCurrency as formatChatCurrency,
  extractExcerptData,
  buildContractLink,
  // Tool factories
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
} from './chat';

export type {
  // Search types
  ContractSearchResult,
  // Spend types
  ContractSpendDetail,
  SingleContractSpend,
  VendorTotalSpend,
  SpendResult,
  SpendToolOutput,
  // Query types
  QueryType,
  ExcerptData,
  DataQueryResult,
  DataContract,
  QueryContractsResult,
  ExpiringContractsResult,
  RenewalsResult,
  // Payment terms types
  PaymentTermsSummaryResult,
  PaymentTermsToolOutput,
  // Input types
  CalculateSpendInput,
  QueryContractsInput,
  SummarizePaymentTermsInput,
  // Context types
  ChatContext,
} from './chat';

// =============================================================================
// CHAT PERSISTENCE
// =============================================================================

export {
  getChatSessions,
  getChatMessages,
  createChatSession,
  saveChatMessage,
  updateChatSessionTitle,
  deleteChatSession,
} from './chat/persistence';

export type {
  ChatSession,
  ChatMessage,
  ChatMessageMetadata,
  ToolCallMetadata,
  ToolResultMetadata,
  CreateSessionInput,
  SaveMessageInput,
  UpdateSessionTitleInput,
  ChatSessionsResult,
  ChatMessagesResult,
  CreateSessionResult,
  SaveMessageResult,
} from './chat/persistence';

// =============================================================================
// CHAT WELCOME
// =============================================================================

export { getWelcomeData } from './chat/welcome';

export type {
  WelcomeData,
  WelcomeDataResponse,
  ExpiringContractsData,
  RecentUploadsData,
  TopVendorData,
} from './chat/welcome';

// =============================================================================
// INVESTOR / VENTURE
// =============================================================================

export {
  getVentureDocumentSummary,
  getVentureDocuments,
  getEntityDocuments,
  getCompanyDocuments,
  type VentureDocumentSummary,
  type VentureDocumentSummaryResult,
  type VentureDocumentFile,
  type VentureDocumentRow,
  type VentureDocumentsResult,
} from './investor/service';

// Investor Calculations
export {
  calculatePortfolioMOIC,
  calculateCompanyMOIC,
  calculatePortfolioGains,
  formatMOIC,
} from './investor/calculations';

// =============================================================================
// REPORTING (investor KPI / reporting-pack collection)
// =============================================================================

export {
  CUSTOM_KPI_VALUE_TYPES,
  NARRATIVE_CATEGORY,
  type CompanyCustomKpi,
  type CreateCustomKpiResult,
  type CustomKpiValue,
  type CustomKpiValueType,
  type KpiDefinition,
  type KpiEvent,
  type KpiEventPayload,
  type KpiEventType,
  type KpiMetric,
  type KpiPeriod,
  type KpiPeriodView,
  type KpiValueEditedPayload,
  type KpiValueType,
  type PendingRequest,
  type PortcoUserOption,
  type RecipientAddedPayload,
  type ReminderSentPayload,
  type ReportingDocTypeOption,
  type ReportingDocument,
  type ReportingKpiValue,
  type ReportingQuarter,
  type ReportingRequestDetails,
  type ReportingType,
  type RequestKpiRef,
  type RequestRecipient,
  type RequestSentPayload,
  type ResolvedKpiValue,
  type SubmissionCounts,
  type SubmissionReceivedPayload,
} from './kpis/types';

export {
  buildKpiPeriods,
  canSendReminder,
  currentPeriod,
  customDisplayValue,
  earliestDisplayedYear,
  formatKpiDisplay,
  formatMonthLabel,
  formatPeriodLabel,
  hasQuarterlyQuantKpis,
  KPI_HISTORY_YEARS,
  pivotKpisByCategory,
  quarterOfMonth,
  REMINDER_WAIT_DAYS,
  requestProgressPercent,
  resolveAnnualKpi,
  resolveQuarterKpi,
  rollUpToFiscalYears,
} from './kpis/transforms';

export {
  getCompanyCustomKpis,
  getCompanyReporting,
  getCompanyReportingRequests,
  getKpis,
  getOrgPortcoUsers,
  getReportingDocTypes,
  getReportingRequestDetails,
  getReportingRequestRecipients,
} from './kpis/service';

export { getKpiEvents, logKpiEvent } from './kpis/events';
export type { LogKpiEventInput } from './kpis/events';

export { deriveSubmissionCounts, toKpiEvent } from './kpis/transforms';
export type { RawKpiEventRow } from './kpis/transforms';

export {
  addReportingRequestRecipient,
  createReportingRequest,
  removeReportingRequestRecipient,
  sendReportingRequestReminder,
  type CreateReportingRequestInput,
  type CreateReportingRequestResult,
  type ReportingCaller,
} from './kpis/requests';

export {
  createCustomKpi,
  deactivateCustomKpi,
  setKpiValue,
  type CreateCustomKpiInput,
  type CustomKpiCaller,
  type SetKpiValueInput,
} from './kpis/custom-kpis';

export {
  getHiddenKpiIds,
  setHiddenKpiIds,
  KpiSettingsError,
} from './kpis/kpi-settings';

// =============================================================================
// MODULES
// =============================================================================

export {
  getUserModuleAccess,
  hasModuleAccess,
  getModuleByCode,
  type ModuleAccessResult,
} from './modules/service';

// =============================================================================
// ARCHIVES
// =============================================================================

export {
  createModuleArchive,
  getModuleArchives,
  type ModuleArchiveRow,
  type ModuleArchivesResult,
} from './archives/service';

// =============================================================================
// TAGS
// =============================================================================

export {
  updateContractTags,
  getOrgTags,
  updateEntityTags,
  getEntityTags,
} from './tags/service';
