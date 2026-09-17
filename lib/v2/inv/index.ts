/**
 * Investor Portfolio API (inv_* schema)
 *
 * Entry point for the new investor portfolio data layer.
 * Import from here to ensure you're using the correct functions.
 */

// =============================================================================
// SERVICE FUNCTIONS
// =============================================================================

export {
  getInvCompany,
  getInvCompanies,
  getInvCompanyValuation,
  getInvCapTableSnapshot,
  getInvTransactions,
  getInvBoardComposition,
  getInvBoardSeatIds,
  getInvCorporateEventsForCompany,
  getInvInvestorStatus,
  getInvSecurities,
  getInvLegalTerms,
  getInvFunds,
  getInvEquityPlanSnapshots,
  pickCreateTarget,
  // Composite functions
  getInvPortfolioCompany,
  getInvPortfolioCompanies,
  getInvPortfolioFunds,
  getInvInvestmentFlows,
  getInvCashFlows,
  getInvMissingDocuments,
  type InvPortfolioCompanyResult,
  type InvPortfolioCompaniesResult,
  type InvInvestmentFlow,
  type InvInvestmentFlowsResult,
  type InvCashFlow,
  type InvCashFlowsResult,
  type GetInvCompaniesOptions,
  type GetInvPortfolioCompaniesOptions,
  type GetInvMissingDocumentsOptions,
} from './service';

// =============================================================================
// VALUE OVERRIDES
// =============================================================================

export type {
  AppliedOverrideMeta,
  OverrideMetadataByEntity,
  ValueOverrideRow,
} from './overrides/applyOverrides';
export type { ValuationOverrides } from './overrides/mergeValuation';

// =============================================================================
// TRANSFORMS
// =============================================================================

export {
  pickLatestSnapshot,
  transformInvToPortfolioCompany,
  transformInvTransactions,
  transformInvBoardMembers,
  transformInvToCapTableData,
  transformInvToLegalTerms,
} from './transforms';

// =============================================================================
// STAGE / TRANSACTION-TYPE CLASSIFICATION
// =============================================================================

export {
  SYNTHETIC_STAGE_CODES,
  isSyntheticStageCode,
  ADJUSTMENT_TRANSACTION_TYPES,
  isAdjustmentTransactionType,
  POSITION_COST_TRANSACTION_TYPES,
  POSITION_PROCEEDS_TRANSACTION_TYPES,
} from './stage-utils';

// =============================================================================
// METRICS
// =============================================================================

export { computePortfolioMetrics } from './metrics';
export type { PortfolioMetrics } from './metrics';

// =============================================================================
// TYPES
// =============================================================================

export type * from './types';
