/**
 * Investor Portfolio Types (inv_* schema)
 *
 * TypeScript interfaces for the new inv_* database schema.
 * These types closely match the database schema for type safety.
 */

import type { Database, Json } from '@/database.types';
import type { CompanyEnrichment } from '@/lib/v2/companies/enrichment';

import type {
  AppliedOverrideMeta,
  OverrideMetadataByEntity,
} from './overrides/applyOverrides';
import type { ValuationOverrides } from './overrides/mergeValuation';

// =============================================================================
// DATABASE ROW TYPES
// =============================================================================

export type InvCompanyRow = Database['public']['Tables']['inv_company']['Row'];
export type InvCompaniesRow =
  Database['public']['Tables']['inv_companies']['Row'];
export type InvFundRow = Database['public']['Tables']['inv_fund']['Row'];
export type InvSecurityRow =
  Database['public']['Tables']['inv_security']['Row'];
export type InvSecurityTermsRow =
  Database['public']['Tables']['inv_security_terms']['Row'];
export type InvTransactionRow =
  Database['public']['Tables']['inv_transaction']['Row'];
export type InvCapTableSnapshotRow =
  Database['public']['Tables']['inv_cap_table_snapshot']['Row'];
export type InvBoardSeatRow =
  Database['public']['Tables']['inv_board_seat']['Row'];
export type InvInformationRightsRow =
  Database['public']['Tables']['inv_information_rights']['Row'];
export type InvFinancingRoundRow =
  Database['public']['Tables']['inv_financing_round']['Row'];
export type InvRoundTermsRow =
  Database['public']['Tables']['inv_round_terms']['Row'];
export type InvCompanyValuationRow =
  Database['public']['Views']['v_inv_company_valuation']['Row'];

// =============================================================================
// ENRICHED TYPES
// =============================================================================

/**
 * Portfolio company with global company data joined.
 * Combines inv_company (org-scoped) with inv_companies (global).
 */
export interface InvCompany {
  // From inv_company (org-scoped)
  id: number;
  publicId: string;
  organizationId: string;
  companyId: number;
  status: string;
  sector: string | null;
  tags: string[] | null;
  notes: string | null;
  investmentThesis: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  externalId: string | null;
  metadata: Json;
  createdAt: string;
  updatedAt: string;

  // From inv_companies (global) - with COALESCE for name
  name: string;
  nameOverride: string | null;
  domain: string | null;
  industry: string | null;
  headquarters: string | null;
  description: string | null;
  foundedYear: number | null;
  legalName: string | null;
  legalJurisdiction: string | null;
  entityType: string | null;

  // From inv_stages (via stage_id / entry_stage_id FKs)
  stageCode: string | null;
  stageDisplayName: string | null;
  entryStageCode: string | null;
  entryStageDisplayName: string | null;
}

/**
 * Investment fund (inv_fund).
 */
export interface InvFund {
  id: number;
  publicId: string;
  organizationId: string;
  name: string;
  shortName: string | null;
  code: string | null;
  description: string | null;
  currency: string;
  status: string;
  vintageYear: number | null;
  targetSize: number | null;
  committedCapital: number | null;
  metadata: Json;
}

/**
 * Security with current terms joined.
 */
export interface InvSecurity {
  id: number;
  publicId: string;
  companyId: number;
  organizationId: string;
  name: string;
  securityType: string;
  seriesName: string | null;
  isValuationReference: boolean;
  metadata: Json;
  // Current terms (where superseded_date IS NULL)
  terms: InvSecurityTerms | null;
}

/**
 * Security terms (inv_security_terms).
 */
export interface InvSecurityTerms {
  id: number;
  securityId: number;
  effectiveDate: string;
  supersededDate: string | null;
  // Economic terms
  originalIssuePrice: number | null;
  authorizedShares: number | null;
  issuedShares: number | null;
  outstandingShares: number | null;
  parValue: number | null;
  // Conversion
  conversionPrice: number | null;
  conversionRatio: number | null;
  // Anti-dilution
  antiDilutionType: string | null;
  aggregateLiqPref: number | null;
  // Liquidation
  liquidationMultiplier: number | null;
  liquidationSeniority: number | null;
  // Participation
  participationType: string | null;
  participationCap: number | null;
  // Dividends
  dividendRate: number | null;
  dividendCumulative: boolean | null;
  dividendAccruing: boolean | null;
  dividendSeniority: number | null;
  // Convertible note terms
  valuationCap: number | null;
  discountRate: number | null;
  interestRate: number | null;
  interestType: string | null;
  maturityDate: string | null;
  qualifiedFinancingThreshold: number | null;
}

/**
 * Transaction record (inv_transaction).
 */
export interface InvTransaction {
  id: number;
  publicId: string;
  companyId: number;
  fundId: number;
  securityId: number;
  financingRoundId: number | null;
  organizationId: string;
  transactionType: string;
  transactionDate: string;
  settlementDate: string | null;
  units: number;
  amount: number;
  currency: string;
  counterpartyName: string | null;
  signatory: string | null;
  notes: string | null;
  externalId: string | null;
  metadata: Json;
  // Joined data
  fund?: InvFund;
  financingRound?: InvFinancingRound | null;
  security?: InvSecurity;
}

/**
 * Cap table snapshot (inv_cap_table_snapshot).
 */
export interface InvCapTableSnapshot {
  id: number;
  companyId: number;
  organizationId: string;
  snapshotDate: string;
  snapshotTypeId: number | null;
  snapshotTypeCode: string | null;
  financingRoundId: number | null;
  // Totals
  fullyDilutedTotal: number;
  totalOutstanding: number | null;
  impliedValuation: number | null;
  sharePrice: number | null;
  // Common stock
  commonAuthorized: number | null;
  commonOutstanding: number | null;
  // Preferred stock
  preferredAuthorized: number | null;
  preferredOutstanding: number | null;
  // Option pool
  optionPoolAuthorized: number | null;
  optionPoolOutstanding: number | null;
  optionPoolAvailable: number | null;
  optionPoolFdPercent: number | null;
  // Our position
  ourTotalShares: number | null;
  ourCommonShares: number | null;
  ourPreferredShares: number | null;
  ourPreferredPct: number | null;
  ourOwnershipPercent: number | null;
  ourFdOwnershipPercent: number | null;
  ourVotingPct: number | null;
  // Detail JSON
  capTableDetail: Json;
  stageCode: string | null;
  stageName: string | null;
}

/**
 * Board seat (inv_board_seat).
 */
export interface InvBoardSeat {
  id: number;
  companyId: number;
  organizationId: string;
  holderName: string;
  holderTitle: string | null;
  seatType: string;
  effectiveDate: string;
  endDate: string | null;
  designatingFundId: number | null;
  designatingSecurityId: number | null;
  committeeMemberships: string[] | null;
  metadata: Json;
  // Joined data
  designatingFund?: InvFund | null;
  /** Override lineage per overridden column of this seat (edited-field badges). */
  overridden?: Record<string, AppliedOverrideMeta>;
}

/**
 * Information rights (inv_information_rights).
 */
export interface InvInformationRights {
  id: number;
  companyId: number;
  organizationId: string;
  financingRoundId: number | null;
  effectiveDate: string;
  expirationDate: string | null;
  isMajorInvestor: boolean;
  majorInvestorThreshold: number | null;
  // Info rights flags
  infoRightsForMajor: boolean | null;
  infoRightsForAll: boolean | null;
  inspectionRights: boolean | null;
  capTableAccess: boolean | null;
  // Monthly reporting
  monthlyBalanceSheet: boolean | null;
  monthlyIncomeCashFlows: boolean | null;
  monthlyStockholdersEquity: boolean | null;
  monthlyCapTable: boolean | null;
  monthlyTimingDays: number | null;
  auditedMonthly: boolean | null;
  // Quarterly reporting
  quarterlyBalanceSheet: boolean | null;
  quarterlyIncomeCashFlows: boolean | null;
  quarterlyStockholdersEquity: boolean | null;
  quarterlyCapTable: boolean | null;
  quarterlyTimingDays: number | null;
  auditedQuarterly: boolean | null;
  // Year-end reporting
  yearEndBalanceSheet: boolean | null;
  yearEndIncomeCashFlows: boolean | null;
  yearEndStockholdersEquity: boolean | null;
  yearEndCapTable: boolean | null;
  yearEndBudgetBusinessPlan: boolean | null;
  yearEndTimingDays: number | null;
  auditedYearEnd: boolean | null;
  // Reporting contact
  reportingContactName: string | null;
  reportingContactEmail: string | null;
  notes: string | null;
  metadata: Json;
}

/**
 * Financing round (inv_financing_round).
 */
export interface InvFinancingRound {
  id: number;
  publicId: string;
  companyId: number;
  organizationId: string;
  name: string;
  stageId: number | null;
  stageName?: string | null;
  stageCode?: string | null;
  currency: string;
  preMoneyValuation: number | null;
  announcedDate: string | null;
  initialCloseDate: string | null;
  finalCloseDate: string | null;
  notes: string | null;
  externalId: string | null;
  metadata: Json;
  impliedValuation: number | null;
  /**
   * Id of the cap-table snapshot `impliedValuation` was sourced from. Lets the
   * transactions table reflect a PMV override when this is the company's latest
   * (overridable) snapshot. Null when no snapshot backed the value.
   */
  impliedValuationSnapshotId?: number | null;
}

/**
 * Round terms (inv_round_terms).
 */
export interface InvRoundTerms {
  id: number;
  financingRoundId: number;
  organizationId: string;
  effectiveDate: string;
  supersededDate: string | null;
  // Option pool
  optionPoolPercent: number | null;
  preMoneyFdShares: number | null;
  postMoneyFdShares: number | null;
  // Major investor
  majorInvestorThresholdAmount: number | null;
  majorInvestorThresholdShares: number | null;
  majorInvestorThresholdOwnershipPct: number | null;
  namedMajorInvestors: string[] | null;
  // Pro rata
  proRataRightsAll: boolean | null;
  proRataRightsMajor: boolean | null;
  standardProRataFormulation: boolean | null;
  // QSBS
  qsbsRepMade: boolean | null;
  qsbsCovenantGiven: boolean | null;
  // Other rights
  payToPlay: boolean | null;
  dragAlong: boolean | null;
  rofrCosale: boolean | null;
  investorsSubjectToRofr: boolean | null;
  redemptionRights: boolean | null;
  registrationRightsPreferred: boolean | null;
  // Governance
  doInsurance: boolean | null;
  founderVestingApplied: boolean | null;
  employeeVestingProtocol: boolean | null;
  // Closing details
  milestoneClosings: boolean | null;
  subsequentClosingWindowDays: number | null;
  requiredClosingPayments: boolean | null;
  issuerPaysInvestorCounsel: boolean | null;
  investorCounselFeeCap: number | null;
  rawTerms: Json;
}

// =============================================================================
// VALUATION DATA (from v_inv_company_valuation view)
// =============================================================================

/**
 * Company valuation data from the pre-computed view.
 */
export interface InvCompanyValuation {
  companyId: number;
  globalCompanyId: number | null;
  organizationId: string | null;
  // Company info
  companyName: string | null;
  companyDomain: string | null;
  sector: string | null;
  industry: string | null;
  headquarters: string | null;
  status: string | null;
  // Valuation metrics
  myFmv: number | null;
  multiple: number | null;
  aggregateCost: number | null;
  realizedProceeds: number | null;
  ownershipPct: number | null;
  myFdPct: number | null;
  myUnits: number | null;
  postMoneyValuation: number | null;
  currentPriceUnit: number | null;
  fullyDilutedTotal: number | null;
  totalEquityFinancing: number | null;
  lastTransactionDate: string | null;
  snapshotDate: string | null;
  // Entry transaction data (from earliest purchase transaction)
  entryDate: string | null;
  entryAmount: number | null;
  entryStageCode: string | null;
  entryStageDisplayName: string | null;
  // Current stage data (from latest purchase transaction)
  currentStageCode: string | null;
  currentStageDisplayName: string | null;
  // Fund data (aggregated from transactions)
  fundIds: number[] | null;
  fundNames: string[] | null;
  fundShortNames: string[] | null;
  primaryFundName: string | null;
  primaryFundShortName: string | null;
  // Corporate event data (predecessor share excluded, cost carried in as successor)
  maExcludedShare: number | null;
  maCarriedCost: number | null;
  maEventDate: string | null;
}

// =============================================================================
// SERVICE RESULT TYPES
// =============================================================================

export interface InvCompanyResult {
  company: InvCompany;
}

export interface InvCompaniesResult {
  companies: InvCompany[];
  count: number;
}

export interface InvCompanyValuationResult {
  valuation: InvCompanyValuation;
  /** Which valuation fields reflect an active value override. */
  overridden: ValuationOverrides;
}

export interface InvCapTableSnapshotResult {
  snapshot: InvCapTableSnapshot;
  availableDates: string[];
  /** Override lineage per overridden column of the returned snapshot. */
  overridden: Record<string, AppliedOverrideMeta>;
}

export interface InvTransactionsResult {
  transactions: InvTransaction[];
  /** Override lineage keyed by transaction id, then column. */
  overridden: OverrideMetadataByEntity;
}

export type InvCorporateEventType =
  | 'merger'
  | 'acquisition'
  | 'spin_off'
  | 'reorganization';

export type InvCorporateEventRole = 'predecessor' | 'successor';

/** Another company on the same corporate event, seen from one company's page. */
export interface InvCorporateEventCounterpart {
  companyId: number;
  publicId: string;
  name: string;
  role: InvCorporateEventRole;
  costAllocationRatio: number | null;
}

/** A corporate event as it relates to one company (its role and the others). */
export interface InvCorporateEventSummary {
  id: number;
  eventType: InvCorporateEventType;
  eventDate: string;
  role: InvCorporateEventRole;
  counterparts: InvCorporateEventCounterpart[];
}

export interface InvBoardCompositionResult {
  members: InvBoardSeat[];
}

export interface InvInvestorStatusResult {
  hasBoardSeat: boolean;
  isMajorInvestor: boolean;
  hasProRataRights: boolean;
  hasInformationRights: boolean;
}

/**
 * Editable Investor Status context: post-override flag values plus the source
 * row ids and per-field override metadata the Overview section needs to render
 * badges and write new overrides. `informationRightsId` / `roundTermsId` are
 * null when no backing row exists (editing that status is then unavailable).
 */
export interface InvestorStatusOverrideContext {
  informationRightsId: number | null;
  roundTermsId: number | null;
  /**
   * When no backing row exists, the existing financing round a new
   * inv_information_rights / inv_round_terms record can be created against
   * (via the droid financing-rounds PATCH). Null when there is no round to
   * attach to — droid forbids investor tokens from creating financing rounds,
   * so companies with no round cannot have Investor Status records created.
   */
  createTarget: {
    financingRoundId: number;
    companyId: number;
    roundName: string;
    effectiveDate: string;
  } | null;
  /** Flag values after active overrides are applied. */
  values: {
    isMajorInvestor: boolean;
    infoRightsForMajor: boolean;
    infoRightsForAll: boolean;
    proRataRightsMajor: boolean;
    proRataRightsAll: boolean;
  };
  /** AppliedOverrideMeta per DB field_key, for edited/recomputed markers. */
  overridden: {
    is_major_investor?: AppliedOverrideMeta;
    info_rights_for_major?: AppliedOverrideMeta;
    info_rights_for_all?: AppliedOverrideMeta;
    pro_rata_rights_major?: AppliedOverrideMeta;
    pro_rata_rights_all?: AppliedOverrideMeta;
  };
}

/**
 * Editable Legal Terms context: the id of each source row the tab reads, plus
 * per-field override metadata for rendering edit affordances and badges. An id is
 * null when the company has no such row, in which case the fields it backs are
 * read-only (creating a row on edit is not supported here).
 *
 * Displayed values are omitted deliberately — the tab renders post-override
 * values via `LegalTerms`, which is built from the merged rows. The `values`
 * block is the exception: it carries the RAW STORED value of the fields the tab
 * renders differently from how they are stored (a mapped label, a rank shown as
 * a phrase, a rate rescaled for display), so the edit popup seeds and writes the
 * value the column actually holds.
 *
 * Keys within each `overridden` group are that table's column names, matching the
 * registry's field_key.
 */
export interface LegalTermsOverrideContext {
  roundTermsId: number | null;
  informationRightsId: number | null;
  securityTermsId: number | null;
  values: {
    antiDilutionType: string | null;
    liquidationSeniority: number | null;
    dividendRate: number | null;
    dividendSeniority: number | null;
  };
  overridden: {
    roundTerms: Record<string, AppliedOverrideMeta>;
    informationRights: Record<string, AppliedOverrideMeta>;
    securityTerms: Record<string, AppliedOverrideMeta>;
  };
}

export interface InvLegalTermsResult {
  informationRights: InvInformationRights | null;
  roundTerms: InvRoundTerms | null;
  securityTerms: InvSecurityTerms | null;
  allRoundTerms: InvRoundTerms[];
  /** Post-override values + source ids for the editable Investor Status UI. */
  investorStatusEdit: InvestorStatusOverrideContext;
  /** Source ids + override metadata for the editable Legal Terms tab. */
  legalTermsEdit: LegalTermsOverrideContext;
}

export interface InvSecuritiesResult {
  securities: InvSecurity[];
}

export interface InvFundsResult {
  funds: InvFund[];
  count: number;
}

/**
 * Equity plan snapshot (inv_equity_plan_snapshot + inv_equity_plan join).
 */
export interface InvEquityPlanSnapshot {
  id: number;
  planId: number;
  organizationId: string;
  effectiveDate: string;
  authorizedShares: number | null;
  issuedShares: number | null;
  outstandingOptions: number | null;
  exercisedShares: number | null;
  cancelledShares: number | null;
  poolPercentFd: number | null;
  metadata: Json;
  planName: string;
}

export interface InvEquityPlanSnapshotsResult {
  snapshots: InvEquityPlanSnapshot[];
}

// =============================================================================
// CAP TABLE DETAIL JSON SHAPES
// =============================================================================

/**
 * Shape of legal_terms inside cap_table_detail JSON (portfolio_import snapshots).
 */
export interface CapTableDetailLegalTerms {
  drag_along: boolean | null;
  pay_to_play: boolean | null;
  do_insurance: boolean | null;
  redemption_rights: boolean | null;
  our_pro_rata_rights: boolean | null;
  anti_dilution_rights: string | null;
  cumulative_dividends: boolean | null;
  employee_vesting_protocol: boolean | null;
  onex_liq_pref_multipliers: boolean | null;
  protective_provisions_ref: string | null;
  registration_rights_preferred: boolean | null;
}

/**
 * Shape of investor_status inside cap_table_detail JSON (portfolio_import snapshots).
 */
export interface CapTableDetailInvestorStatus {
  major_investor_status: boolean | null;
  our_information_rights: boolean | null;
}

// =============================================================================
// CO-INVESTOR TYPES
// =============================================================================

/**
 * Co-investor record from inv_co_investor joined with financing round + stage.
 */
export interface InvCoInvestor {
  id: number;
  organizationId: string;
  financingRoundId: number;
  investorName: string;
  investorType: string | null;
  relationship: string;
  hasBoardSeat: boolean;
  isMajorInvestor: boolean;
  amountInvested: number | null;
  currency: string;
  // Joined from inv_financing_round
  roundStageName: string | null;
  roundStageCode: string | null;
  roundDate: string | null; // initial_close_date ?? final_close_date
}

/**
 * Co-investor network data from v_inv_co_investor_network.
 * Used for the "Also in N other portcos" badge.
 */
export interface InvCoInvestorNetworkEntry {
  investorName: string;
  investorType: string | null;
  roundsParticipated: number;
  companiesCoinvested: number;
  companyNames: string[];
  totalCoinvested: number | null;
}

export interface InvCoInvestorsResult {
  coInvestors: InvCoInvestor[];
}

// =============================================================================
// PORTFOLIO / PRESENTATION TYPES
// =============================================================================

/** Base stages that carry granular sub-stage and extension labels. */
type GranularStageBase =
  | 'Pre-Seed'
  | 'Seed'
  | 'Series Seed'
  | 'Series A'
  | 'Series B'
  | 'Series C'
  | 'Series D'
  | 'Series E'
  | 'Series F'
  | 'Series G';

/**
 * Granular stage labels: a numbered sub-stage ("Series A-3") or an extension
 * ("Series A Extension"). See `docs/stage-taxonomy.md`. "Pre-Seed-<n>" is
 * technically in this union but has no `inv_stages` row and is never produced.
 */
type GranularStageLabel =
  | `${GranularStageBase}-${1 | 2 | 3 | 4 | 5}`
  | `${GranularStageBase} Extension`;

export type InvestmentStage =
  | GranularStageBase
  | GranularStageLabel
  | 'IPO'
  | 'Winding Down'
  | 'Dissolved'
  | 'Acquired'
  | 'Merged'
  | 'Reclassification'
  | 'Reverse Split'
  | 'Forward Split';

export type InvestmentStatus = 'Active' | 'Pending' | 'Exited';

export type TransactionFlowType =
  | 'investment'
  | 'distribution'
  | 'exit'
  | 'sale';

export interface InvestmentTransaction {
  /** Source inv_transaction.id — present when loaded via the inv service layer. */
  id?: number;
  date: string;
  amount: number;
  type: string; // e.g., 'Pre-Seed', 'Seed', 'Series A', 'Follow-on', 'Acquisition', 'Dividend'
  transactionType?: string; // Display-formatted transaction type for the Type column (e.g., 'Secondary Sale')
  rawTransactionType?: string; // Raw inv_transaction.transaction_type (e.g., 'purchase', 'sale') — sign source for amount edits
  flowType?: TransactionFlowType; // 'investment' = outflow (cost), 'distribution'/'exit' = inflow (proceeds). Defaults to 'investment'
  entityName?: string; // Fund/entity name associated with the transaction
  // Extended fields for detailed views
  stage?: InvestmentStage; // Stage name (e.g., 'Seed', 'Series A')
  equityClass?: string;
  cost?: number; // Amount invested (same as amount for investments)
  realizedProceeds?: number; // Proceeds from sale of shares (populated for sale/secondary_sale transactions)
  myUnits?: number; // Units/shares purchased (negative for sales)
  postMoneyValuation?: number | null; // Post-money valuation at time of transaction
  postMoneySnapshotId?: number | null; // Cap-table snapshot id that sourced postMoneyValuation (null when derived from pre-money + amount)
  myFMV?: number | null; // Fair market value of position at this transaction
  cumulativeUnits?: number; // Cumulative units after this transaction
}

export type CashPosition =
  | '0-3 months'
  | '4-6 months'
  | '7-12 months'
  | '12+ months';

export interface BoardMember {
  id?: number;
  name: string;
  role?: string;
  fund?: string;
  designatingFundId?: number | null;
  isLead?: boolean;
  seatType?: string;
  /** Override lineage per overridden column of this seat. */
  overridden?: Record<string, AppliedOverrideMeta>;
}

export interface FinancingRoundSummary {
  id: number;
  name: string;
  stageCode: string;
  stageName: string;
  date: string; // Best available: initialCloseDate > announcedDate > finalCloseDate
}

export interface PortfolioCompany {
  id: string;
  entityId: number;
  name: string;
  logoUrl?: string;
  domain?: string;
  stage?: InvestmentStage;
  investmentStatus?: InvestmentStatus;
  hasTransactionData: boolean;
  hasKpiData?: boolean;
  valuation: number;
  myTotalFMV: number;
  /**
   * Date the FMV estimate was computed from — the latest cap table
   * snapshot's date, or the creation date of a manual myFmv override. Null
   * when the position is exited or FMV genuinely could not be computed
   * (myTotalFMV's 0 is a display default in that case).
   */
  fmvAsOfDate: string | null;
  postMoneyValuation: number;
  myOwnership: number;
  tags: { id: string; name: string }[];
  cashPosition?: CashPosition;
  nextBoardMeeting: string | null;
  currentlyRaising: boolean;
  entityType: string;
  foundedYear: number;
  headquarters: string;
  corporateJurisdiction: string;
  companyUrl: string;
  industry: string;
  sector: string;
  description: string | null;
  totalEquityFinancing: number;
  currentPricePerUnit: number;
  lastTransactionDate: string;
  fund: string;
  fundIds?: number[]; // Fund entity IDs from metadata.funds
  funds?: { id: number; name: string; shortName: string }[]; // Fund entities with names
  boardOfDirectors: BoardMember[];
  boardObservers: {
    id?: number;
    name: string;
    seatType?: string;
    overridden?: Record<string, AppliedOverrideMeta>;
    role?: string;
    fund?: string;
    designatingFundId?: number | null;
  }[];
  // Entry transaction fields
  myEntryDate: string;
  stageAtEntry?: InvestmentStage;
  myEntryCost: number;
  postMoneyAtEntry: number | null;
  // Current economics fields
  myAggregateCost: number;
  realizedProceeds: number;
  impliedValue: number;
  multiple: number;
  moic: number | null;
  myFullyDilutedPercent: number;
  // Legal terms
  legalTerms?: LegalTerms;
  // Documents
  documents?: CompanyDocuments;
  // Transaction history for charting
  transactions?: InvestmentTransaction[];
  capTable?: CapTableData;
  liqPrefData?: LiqPrefData;
  financingRounds?: FinancingRoundSummary[];
  // Per-round legal terms (keyed by financing round ID)
  legalTermsByRound?: { financingRoundId: number; legalTerms: LegalTerms }[];
  enrichment?: CompanyEnrichment;
  // Co-investors (grouped by investor name)
  coInvestors?: CoInvestor[];
}

export interface PortfolioTableRow extends PortfolioCompany {
  isGroup?: boolean;
  subRows?: PortfolioCompany[];
}

// Co-Investor Types
export interface CoInvestorInvestment {
  financingRoundId: number;
  date: string | null;
  stageName: string | null;
  stageCode: string | null;
  totalInvestment: number | null;
  currency: string;
}

export interface CoInvestor {
  investorName: string;
  investorType: string | null;
  roundsCount: number;
  /** Number of portfolio companies this investor has co-invested in (from network view). */
  companiesCoinvested: number;
  /** Names of other portcos this investor appears in (excludes current company). */
  otherCompanyNames: string[];
  investments: CoInvestorInvestment[];
}

// Legal Terms Types
export interface FrequencyFlags {
  monthly: boolean;
  quarterly: boolean;
  yearEnd: boolean;
}

export interface InformationRights {
  budgetAndBusinessPlan: FrequencyFlags;
  capitalizationTable: FrequencyFlags;
  balanceSheet: FrequencyFlags;
  incomeAndCashFlows: FrequencyFlags;
  auditedBalanceSheet: FrequencyFlags;
  auditedFinancialStatements: FrequencyFlags;
  auditedIncomeAndCashFlows: FrequencyFlags;
  auditedStockholdersEquity: FrequencyFlags;
}

export interface MajorInvestor {
  thresholdAmount: number | null;
  thresholdOwnershipPercent: number | null;
  thresholdShares: number | null;
  majorInvestorsByThreshold: string[];
  namedMajorInvestor: string[];
}

export interface EconomicRights {
  antiDilutionRights: string;
  liquidationPreferenceSeniority: string[];
  milestoneClosings: boolean;
}

export interface QSBS {
  qualifiedSmallBusinessStockCovenantGiven: boolean;
  qualifiedSmallBusinessRepMade: boolean;
}

export interface Dividends {
  accruingDividends: boolean | null;
  cumulativeDividends: boolean | null;
  dividendRate: number | null;
  dividendSeniority: string | null;
}

export interface OtherLegalTerms {
  proRataRightsForAll: boolean;
  proRataRightsForMajorInvestors: boolean;
  dragAlong: boolean;
  payToPlay: boolean;
  dAndOInsurance: boolean;
  investorCounselFeeCap: number | null;
  employeeVestingProtocol: boolean;
  investorsSubjectToROFR: boolean;
  requiredClosingPayments: boolean;
  rofrAndCosaleAgreement: boolean;
  subsequentClosingWindowDays: number | null;
  standardProRataFormulation: boolean;
  issuerPaysInvestorCounselFees: boolean;
  founderVestingProtocol: boolean;
  registrationRightsForPreferredInvestors: boolean;
}

export interface LegalTerms {
  headerStatus: {
    majorInvestorStatus: boolean;
    informationRights: boolean;
  };
  informationRights: InformationRights;
  majorInvestor: MajorInvestor;
  economicRights: EconomicRights;
  qsbs: QSBS;
  dividends: Dividends;
  otherLegalTerms: OtherLegalTerms;
}

// Document Types
export type DocumentCategoryId =
  | 'kpi'
  | 'transaction'
  | 'capTables'
  | 'supplemental';

export interface DocumentCategory {
  id: DocumentCategoryId;
  label: string;
  count: number;
  expandable?: boolean;
}

export interface CompanyDocument {
  category: DocumentCategoryId;
  year: number;
  period: string;
  documentType: string;
  filename: string;
}

export interface CompanyDocuments {
  categories: DocumentCategory[];
  documents: CompanyDocument[];
}

// Venture Documents List Types
export type VentureDocumentStatus =
  | 'INVALID'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'FAILED'
  | 'UPLOADED';

export interface VentureDocumentFailureInfo {
  message: string;
  stage: string;
  occurredAt: string;
}

export interface VentureDocumentFile {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number | null;
  fileType: string | null;
}

export interface VentureDocument {
  id: string;
  name: string;
  submittedOn: string;
  submittedBy: string;
  status: VentureDocumentStatus;
  isPublished?: boolean;
  investment: {
    id: string;
    name: string;
    domain?: string;
  } | null;
  documentType: string;
  files?: VentureDocumentFile[]; // Optional - not present on optimistic entries
  failureInfo?: VentureDocumentFailureInfo; // Present when status is FAILED
}

// Cap Table Types
export interface SecurityRow {
  id: string;
  name: string;
  parentId?: string;
  securityType?: string;
  units: number;
  fdPercent: number;
  myUnits?: number;
  myFdPercent?: number;
}

export interface CapTableSnapshot {
  asOfDate: string;
  snapshotTypeCode: string | null;
  financingRoundId: number | null;
  securities: SecurityRow[];
  // Snapshot-level totals
  fullyDilutedTotal: number;
  totalOutstanding: number | null;
  impliedValuation: number | null;
  sharePrice: number | null;
  // Common stock
  commonAuthorized: number | null;
  commonOutstanding: number | null;
  // Preferred stock
  preferredAuthorized: number | null;
  preferredOutstanding: number | null;
  // Option pool
  optionPoolAuthorized: number | null;
  optionPoolOutstanding: number | null;
  optionPoolAvailable: number | null;
  optionPoolFdPercent: number | null;
  // Our position
  ourTotalShares: number | null;
  ourCommonShares: number | null;
  ourPreferredShares: number | null;
  ourPreferredPct: number | null;
  ourOwnershipPercent: number | null;
  ourFdOwnershipPercent: number | null;
  ourVotingPct: number | null;
  stageCode: string;
  stageName: string;
}

export interface PreferredEquityClass {
  stageCode: string;
  stageName: string;
  roundNames: string[];
}

export interface CapTableTransaction {
  securityId: number;
  securityType: string;
  securityName: string;
  transactionDate: string;
  transactionType: string;
  signedUnits: number;
  units: number;
}

export interface EquityPlanSnapshot {
  effectiveDate: string;
  authorizedShares: number | null;
  issuedShares: number | null;
  outstandingOptions: number | null;
  exercisedShares: number | null;
  cancelledShares: number | null;
  poolPercentFd: number | null;
  planName: string;
}

export interface CapTableData {
  snapshots: CapTableSnapshot[];
  availableDates: string[];
  preferredEquityClasses: PreferredEquityClass[];
  transactions: CapTableTransaction[];
  equityPlanSnapshots: EquityPlanSnapshot[];
}

export interface LiqPrefRow {
  securityId: number;
  equityClass: string;
  preference: number | null;
  pricePerUnit: number | null;
  multiplier: number | null;
  participationType: string | null;
  participationCap: number | null;
  myShares: number;
  myCost: number;
  myLiqPref: number;
  totalOutstandingShares: number | null;
  totalLiqPref: number | null;
}

export interface LiqPrefData {
  rows: LiqPrefRow[];
  myTotalLiqPref: number;
  totalLiqPref: number;
}

// =============================================================================
// MISSING DOCUMENTS REPORT TYPES
// =============================================================================

export interface MissingDocumentItem {
  definedName: string;
  documentType: string | null;
}

export interface MissingDocumentCompanyRow {
  companyId: number;
  companyPublicId: string;
  companyName: string;
  fundName: string | null;
  fundIds: number[];
  totalExpected: number;
  receivedDocTypes: string[];
  missingDocTypes: MissingDocumentItem[];
  missingCount: number;
}

export interface MissingDocumentsResult {
  companies: MissingDocumentCompanyRow[];
  totalMissing: number;
  companiesWithMissing: number;
}
