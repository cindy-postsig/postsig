/**
 * Chat Types Module
 *
 * Type definitions for AI chat tool inputs, outputs, and domain objects.
 * These types ensure type safety across the chat service layer.
 */

// =============================================================================
// MONTHLY SPEND TYPES
// =============================================================================

export interface MonthlyDataPoint {
  key: string;
  label: string;
  value: number;
}

/** @deprecated Use MonthlyDataPoint instead */
export type AmortizedDataPoint = MonthlyDataPoint;

export interface MonthlySpendReport {
  data: MonthlyDataPoint[];
  isMonthly: boolean;
}

/** @deprecated Use MonthlySpendReport instead */
export type AmortizedReport = MonthlySpendReport;

// =============================================================================
// BASE TYPES
// =============================================================================

/**
 * Base contract item with common fields shared across all contract types.
 * Extend this interface for specific use cases.
 */
export interface BaseContractItem {
  id: number;
  vendorName: string | undefined;
  contractType: string | undefined;
}

/**
 * Permission levels for contract/folder access
 */
export type PermissionLevel = 'read' | 'write' | 'admin';

/**
 * Standard tool error response
 */
export interface ToolError {
  error: string;
  noResults?: boolean;
  searchedBy?: string;
  searchTerm?: string;
  suggestion?: string;
}

/**
 * Type guard to check if a tool output is an error
 */
export function isToolError<T>(output: T | ToolError): output is ToolError {
  return (
    output !== null &&
    typeof output === 'object' &&
    'error' in output &&
    typeof (output as ToolError).error === 'string'
  );
}

export function isExecutionError<T>(
  output: T | ToolError,
): output is ToolError {
  return (
    isToolError(output) &&
    output.error !== '_NO_RESULTS_' &&
    output.noResults !== true
  );
}

// =============================================================================
// CONTRACT SEARCH TYPES
// =============================================================================

export interface ContractSearchResult {
  id: number;
  vendorName: string | undefined;
  productName: string | undefined;
  /**
   * Names from `productName` cancelled by a confirmed later-chain
   * declaration (PSK-1830). Mentioned rather than omitted so the model can
   * say a product was cancelled instead of asserting it is licensed.
   */
  cancelledProductNames?: string;
  currentSpend: number | undefined;
  summary: string | undefined;
  termStartDate: string | undefined;
  termEndDate: string | undefined;
  contractType: string | undefined;
}

export interface ListContractsResult {
  type: 'list_contracts';
  contracts: Record<string, unknown>[];
}

// =============================================================================
// SPEND CALCULATION TYPES
// =============================================================================

export interface ContractSpendDetail {
  contractId: number;
  vendorName: string | undefined;
  contractType: string | undefined;
  currency: string;
  totalContractValueUSD: number;
  currentBudgetUSD: number;
  projectedBudgetUSD: number;
  termStartDate: string | undefined;
  termEndDate: string | undefined;
  products:
    | Array<{
        product_id: number;
        name: string;
        fees: number;
      }>
    | undefined;
  /** True when this contract is excluded from spend totals (stricken in the budget UI) */
  isExcludedFromTotals?: boolean;
  /** Why the contract is excluded: superseded by an amendment or linked child invoice */
  exclusionReason?: 'fully_superseded' | 'linked_child_invoice';
}

export interface SingleContractSpend {
  type: 'single_contract';
  contract: ContractSpendDetail;
  summary: string;
  amortizedReport?: MonthlySpendReport;
  actualCostReport?: MonthlySpendReport;
}

export interface VendorTotalSpend {
  type: 'vendor_total';
  vendorName: string;
  contractCount: number;
  totals: {
    totalContractValueUSD: number;
    currentBudgetUSD: number;
    projectedBudgetUSD: number;
  };
  contracts: ContractSpendDetail[];
  summary: string;
  amortizedReport?: MonthlySpendReport;
  actualCostReport?: MonthlySpendReport;
}

export type SpendResult = SingleContractSpend | VendorTotalSpend;

export interface AnnualIncreaseContract {
  id: number;
  vendor: string | undefined;
  contractType: string | undefined;
  annualIncrease: number | null;
  currentBudgetUSD: number;
  projectedBudgetUSD: number;
  annualDifference: number;
}

export interface AnnualIncreaseResult {
  type: 'annual_increase';
  contracts: AnnualIncreaseContract[];
}

export interface SpendError {
  error: string;
  noResults?: boolean;
  searchedBy?: 'vendor' | 'tag' | 'contractId' | 'vendorId';
  searchTerm?: string;
  suggestion?: string;
}

export type SpendToolOutput = SpendResult | SpendError;

// =============================================================================
// QUERY CONTRACTS TYPES
// =============================================================================

export type QueryType =
  | 'derived_data'
  | 'ai_usage'
  | 'billing_frequency'
  | 'liability'
  | 'cancellation_process'
  | 'usage_restrictions'
  | 'expiring_soon'
  | 'renewal'
  | 'discounts'
  | 'dora_compliance'
  | 'nda_risk'
  | 'asset_class'
  | 'recent_uploads'
  | 'price_increase'
  | 'unexecuted'
  | 'vendor_statistics'
  | 'seat_utilization';

export interface ExcerptData {
  title: string;
  contractId: number;
  vendor: string | undefined;
  content: string;
}

export interface DataContract {
  id: number;
  vendor: string | undefined;
  clauseContent: string;
  contractType: string | undefined;
}

export interface DataQueryResult {
  type: 'data_query';
  contracts: DataContract[];
  excerpts: ExcerptData[];
}

export interface BillingFrequencyContract {
  id: number;
  vendor: string | undefined;
  contractType: string | undefined;
  billingFrequency: string;
  paymentTerms: string;
}

export interface UsageRestrictionsContract {
  id: number;
  vendor: string | undefined;
  contractType: string | undefined;
  scopeOfUse: string | null;
  geoRestrictions: string | null;
  distributionRights: string | null;
}

export interface ExpiringContract {
  id: number;
  vendor: string | undefined;
  contractType: string | undefined;
  termEndDate: string | undefined;
  autoRenewal: boolean | undefined;
  tcv: number;
}

export interface ExpiringContractsResult {
  count: number;
  totalTCV: number;
  contracts: ExpiringContract[];
}

export interface RenewalContract {
  id: number;
  vendor: string | undefined;
  cancelByDate: Date | null;
  termEndDate: string | null;
  tcv: number;
  contractType: string | undefined;
  renewalType: string | undefined;
}

export interface RenewalsResult {
  count: number;
  totalRenewalExposure: number;
  contracts: RenewalContract[];
}

export interface DiscountContract {
  id: number;
  vendor: string | undefined;
  contractType: string | undefined;
  discount: number | null;
  currency: string | null;
}

export interface DoraComplianceContract {
  id: number;
  vendor: string | undefined;
  contractType: string | undefined;
  doraScore: number;
  maxScore: number;
  missingCategories: string[];
  hasICTVendor: boolean;
}

export interface NdaRiskContract {
  id: number;
  vendor: string | undefined;
  contractType: string | undefined;
  riskLevel: 1 | 2 | 3;
  riskFlags: number;
  risks: string[];
}

export interface AssetClassContract {
  id: number;
  vendor: string | undefined;
  contractType: string | undefined;
  assetClasses: string[];
  marketDataTypes: string | null;
}

export interface RecentUploadContract {
  id: number;
  vendor: string | undefined;
  contractType: string | undefined;
  summary: string | undefined;
  createdAt: string;
}

export interface RecentUploadsResult {
  count: number;
  contracts: RecentUploadContract[];
}

export interface PriceIncreaseContract {
  id: number;
  vendor: string | undefined;
  contractType: string | undefined;
  currentBudgetUSD: number;
  projectedBudgetUSD: number;
  increaseUSD: number;
  increasePercent: number;
  termEndDate: string | undefined;
}

export interface PriceIncreaseResult {
  type: 'price_increase';
  count: number;
  totalIncreaseUSD: number;
  contracts: PriceIncreaseContract[];
}

export interface UnexecutedContract {
  id: number;
  vendor: string | undefined;
  contractType: string | undefined;
  totalContractValue: number;
  termEndDate: string | undefined;
  termStartDate: string | undefined;
}

export interface UnexecutedResult {
  count: number;
  contracts: UnexecutedContract[];
}

export interface VendorStatisticsContract {
  id: number;
  vendor: string | undefined;
  contractType: string | undefined;
  totalContractValue: number;
}

export interface VendorStatisticsResult {
  vendorCount: number;
  totalContractValue: number;
  contracts: VendorStatisticsContract[];
}

export interface SeatUtilizationProduct {
  productName: string;
  allocatedSeats: number;
  usedSeats: number;
  unusedSeats: number;
  utilizationPercentage: number;
  unusedSeatsValue: number;
}

export interface SeatUtilizationContract {
  id: number;
  vendor: string | undefined;
  contractType: string | undefined;
  productName: string | undefined;
  allocatedSeats: number;
  usedSeats: number;
  unusedSeats: number;
  utilizationPercentage: number;
  unusedSeatsValue: number;
  currency: string | null;
  products?: SeatUtilizationProduct[];
}

export interface SeatUtilizationResult {
  count: number;
  totalAllocatedSeats: number;
  totalUsedSeats: number;
  totalUnusedSeats: number;
  overallUtilizationPercentage: number;
  totalUnusedSeatsValue: number;
  contracts: SeatUtilizationContract[];
}

export type QueryContractsResult =
  | DataQueryResult
  | BillingFrequencyContract[]
  | UsageRestrictionsContract[]
  | ExpiringContractsResult
  | RenewalsResult
  | DiscountContract[]
  | DoraComplianceContract[]
  | NdaRiskContract[]
  | AssetClassContract[]
  | RecentUploadsResult
  | PriceIncreaseResult
  | SpendToolOutput
  | UnexecutedResult
  | VendorStatisticsResult
  | SeatUtilizationResult
  | ContractSearchResult[]
  | ToolError
  | ListContractsResult
  | { error: string };

// =============================================================================
// PAYMENT TERMS TYPES
// =============================================================================

export interface PaymentTermsEntry {
  id: number;
  contractType: string;
  billingFrequency: string | null;
  currency: string | null;
  paymentTerms: string | null;
  termStartDate: string | null;
  termEndDate: string | null;
  hasPaymentTerms: boolean;
  link: string;
}

export interface PaymentTermsLineageGroup {
  rootContract: PaymentTermsEntry;
  childContracts: PaymentTermsEntry[];
  governingContract: PaymentTermsEntry | null;
}

export interface FlatPaymentTermsContract extends PaymentTermsEntry {
  isRoot: boolean;
  governedBy: number | undefined;
}

export interface PaymentTermsSummaryResult {
  type: 'payment_terms_summary';
  vendorName: string;
  contractCount: number;
  lineageGroups: number;
  contracts: FlatPaymentTermsContract[];
  summary: string;
}

export type PaymentTermsToolOutput = PaymentTermsSummaryResult | ToolError;

// =============================================================================
// TOOL INPUT TYPES
// =============================================================================

export interface CalculateSpendInput {
  vendorName?: string;
  vendorId?: number;
  contractId?: number;
  tagName?: string;
}

export interface QueryContractsInput {
  queryType: QueryType;
  vendorName?: string;
  hasClause?: boolean;
  timeframeDays?: number;
  assetClassName?: string;
  doraScoreBelow?: number;
  productName?: string;
  ictProviderFilter?: 'ict' | 'other';
}

export interface SummarizePaymentTermsInput {
  vendorName: string;
}

// =============================================================================
// CHAT CONTEXT TYPES
// =============================================================================

export interface ChatContext {
  userId: string;
  organizationId: string;
  userName?: string;
}

// =============================================================================
// GROUPS TYPES
// =============================================================================

export interface GroupContractInfo {
  contractId: number;
  vendorName: string | undefined;
  contractType: string | undefined;
  permission: 'read' | 'write' | 'admin';
}

export interface GroupResult {
  type: 'group_contracts';
  groupId: number;
  groupName: string;
  memberCount: number;
  contractCount: number;
  contracts: GroupContractInfo[];
}

export interface OrgGroupsResult {
  type: 'org_groups';
  groups: Array<{
    id: number;
    name: string;
    memberCount: number;
    contractCount: number;
  }>;
}

export interface VendorGroupsResult {
  type: 'vendor_groups';
  vendorName: string;
  groups: Array<{
    id: number;
    name: string;
    permission: 'read' | 'write' | 'admin';
  }>;
}

export type GroupsToolOutput =
  | GroupResult
  | OrgGroupsResult
  | VendorGroupsResult
  | ToolError;

// =============================================================================
// TAGS TYPES
// =============================================================================

export interface TagInfo {
  id: number;
  name: string;
  contractCount: number;
}

export interface ContractWithTags {
  contractId: number;
  vendorName: string | undefined;
  contractType: string | undefined;
  tags: Array<{ id: number; name: string }>;
}

export interface TagsByContractResult {
  type: 'contract_tags';
  contracts: ContractWithTags[];
}

export interface OrgTagsResult {
  type: 'org_tags';
  tags: TagInfo[];
  totalContracts: number;
}

export interface ContractsByTagResult {
  type: 'contracts_by_tag';
  tagName: string;
  contracts: Array<{
    contractId: number;
    vendorName: string | undefined;
    contractType: string | undefined;
    summary: string | undefined;
  }>;
}

export interface UntaggedContractsResult {
  type: 'untagged_contracts';
  count: number;
  contracts: Array<{
    contractId: number;
    vendorName: string | undefined;
    contractType: string | undefined;
  }>;
}

export type TagsToolOutput =
  | TagsByContractResult
  | OrgTagsResult
  | ContractsByTagResult
  | UntaggedContractsResult
  | ToolError;

// =============================================================================
// SYNTHESIS TYPES
// =============================================================================

export interface VendorSynthesisInput {
  vendorName: string;
  includeFinancials?: boolean;
  includePaymentTerms?: boolean;
  includeTags?: boolean;
  includeGroups?: boolean;
}

export interface SynthesisSection {
  title: string;
  content: string;
  insights: string[];
  dataSource: string;
}

export interface ContractReference {
  contractId: number;
  vendorName?: string;
}

export interface VendorSynthesisResult {
  type: 'vendor_synthesis';
  vendorName: string;
  executiveSummary: string;
  sections: SynthesisSection[];
  availableData: Array<'spend' | 'payment_terms' | 'tags' | 'groups'>;
  missingData: Array<'spend' | 'payment_terms' | 'tags' | 'groups'>;
  recommendations?: string[];
  contractReferences: ContractReference[];
  partialResults: boolean;
  generatedAt: string;
}

export type SynthesisToolOutput = VendorSynthesisResult | ToolError;

// =============================================================================
// RESOLVE ENTITY TYPES
// =============================================================================

export type EntityType =
  | 'vendor'
  | 'product'
  | 'tag'
  | 'businessGroup'
  | 'sponsor';

export interface ResolvedEntity {
  type: EntityType;
  name: string;
  contractCount: number;
}

export interface ResolveEntityResult {
  query: string;
  matches: ResolvedEntity[];
}

export type ResolveEntityToolOutput = ResolveEntityResult | ToolError;
