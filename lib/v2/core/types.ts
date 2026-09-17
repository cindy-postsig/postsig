/**
 * Shared Types for V2 Services
 */

import type {
  BusinessGroupRef,
  RawContractOwnerRow,
} from '@/lib/v2/owners/types';

// Re-export amendment types for convenience
export type {
  AmendedField,
  FieldAmendments,
  ContractWithAmendments,
  ProductWithAmendments,
  EffectiveFieldValue,
  EffectiveValues,
} from './amendments';

/**
 * Product detail from vendor_products_details array.
 * This is the raw shape from the Supabase query result.
 */
export interface VendorProductDetail {
  product_id?: number;
  year?: number;
  fees?: number;
  name?: string;
  one_time_only?: boolean;
  sort_order?: number | null;
  vendor_products?: {
    id: number;
    name: string;
    /** Exchange Agreement Product Code; null outside those agreements. */
    product_code?: string | null;
    data_delivery_types?: { name: string };
  };
  // FX stamp written by convertAllProductsToUSD, so the details view can show
  // which rate a converted amount came from.
  fxRate?: number | null;
  fxDate?: string | null;
  fxTargetCurrency?: string;
}

/**
 * Raw group shape from ACL query results
 */
export interface RawACLGroup {
  id: number;
  name: string;
  public_uuid: string;
}

/**
 * Base contract shape from fetchContractsBase.
 * Partial typing of the Supabase query result.
 */
export interface ContractBase {
  id: number;
  status: string;
  currency?: string | null;
  execution_date?: string | null;
  annual_increase?: number | null;
  business_sponsor?: unknown;
  business_group?: string | null;
  end_users?: string | null;
  end_user?: string | null;
  permitted_entities?: string | null;
  term_start_date?: Array<{ date: string; updated_at?: string }> | null;
  term_end_date?: Array<{ date: string; updated_at?: string }> | null;
  contract_types?: { name: string } | null;
  contract_users?: Array<{
    id: number;
    name: string;
    email: string;
    product_id: number;
    org_employee_id?: number | null;
  }> | null;
  vendor_products_users?: Array<{
    product_id: number;
    number_of_users?: number | null;
    enterprise?: boolean;
  }> | null;
  vendor_products_details?: VendorProductDetail[] | null;
  contract_data_delivery_types?: Array<{
    data_delivery_types?: { name: string } | null;
  }> | null;
  // ACL embeds: the groups a contract is shared with (extractSharedGroups).
  contract_acl_group?: Array<{ groups?: RawACLGroup | null }> | null;
  folder_contracts?: Array<{
    folders?: {
      folder_acl_group?: Array<{ groups?: RawACLGroup | null }> | null;
    } | null;
  }> | null;
  // The contract's owners (psk-1975), embedded on every contract select and
  // cached with the row. Absent on a narrow select, which reads as unowned.
  contract_owners?: RawContractOwnerRow[] | null;
}

/**
 * A cancel-by date derived from a service order's MSA parent rather than
 * extracted from the service order itself.
 */
export interface InheritedCancelByDate {
  /** Resolved date, `yyyy-MM-dd`. */
  date: string;
  /** Notice period taken from the MSA, in days. */
  noticeDays: number;
  /** The MSA the notice period came from. */
  sourceContractId: number;
}

export interface ContractWithLineage {
  id: number;
  vendor_id: number;
  vendor_name: string;
  vendor_domain?: string;
  contract: any;
  products: ProductWithLineage[];
  /** True if this is an invoice (type_id 6) that has a parent contract */
  isLinkedChildInvoice: boolean;
  /**
   * True when this contract must be kept out of overall spend: an invoice whose
   * `contracts.apply_to_overall_spend` a reviewer has not set.
   */
  excludedFromOverallSpend?: boolean;
  /** Set only when the contract has no cancel-by date of its own */
  inheritedCancelByDate?: InheritedCancelByDate | null;
}

export interface ProductWithLineage {
  product_id: number;
  name: string;
  fees: number;
  year: number;
  /** Books once in its recorded year; excluded from renewal terms (psk-1492). */
  one_time_only?: boolean;
  sort_order?: number | null;
  // Lineage metadata
  sourceContractId: number;
  isSuperseded: boolean;
  supersededByContractId?: number;
  // Superseding metadata (for products that supersede a parent)
  isSuperseding: boolean;
  supersedesProductInContractId?: number;
}

export interface ProductWithPricing extends ProductWithLineage {
  currentFee: number;
  currency: string;
  currentFeeUSD: number;
  currentProducts?: any[];
  // Effective fees (after merging amendment fees)
  effectiveFeeUSD: number;
  /**
   * The effective fee before conversion, in `effectiveFeeCurrency` — the
   * currency of whichever contract sources the fee (this one, or the
   * superseding amendment's). Single-product rows display these (PSK-1796).
   */
  effectiveFee?: number;
  effectiveFeeCurrency?: string;
  feeSourceContractId?: number; // undefined = this contract, set = amendment contract
  /**
   * Cancelled by a confirmed product lineage event (PSK-1830). Distinct from
   * isSuperseded (amendment re-pricing): drives the same struck-through UI
   * but never triggers amendment fee merging.
   */
  isCancelled?: boolean;
}

export interface ContractWithPricing {
  id: number;
  vendor_id: number | null;
  vendor_name: string;
  vendor_domain?: string;
  contract: any;
  products: ProductWithPricing[];
  priceHistory: any;
  isLinkedChildInvoice: boolean;
  /** See ContractWithLineage.excludedFromOverallSpend. */
  excludedFromOverallSpend?: boolean;
  isFullySuperseded?: boolean;
  /** Set only when the contract has no cancel-by date of its own */
  inheritedCancelByDate?: InheritedCancelByDate | null;
  // Stamped by enrichWithEngineSpend at the fetch boundary; getUSDValue reads
  // the current/projected base-currency pair from here instead of the cached
  // price history, and buildContractTableRow reads the native pair for row
  // display. TCV is deliberately not included — see enrich.ts.
  engineSpend?: {
    // Org base display currency (see EngineSpendValues).
    currentBase: number;
    projectedBase: number;
    currentNative: number;
    projectedNative: number;
    // Budget table path only: per-product values for the same windows and
    // basis, native currency, so product sub-rows agree with the parent row.
    products?: Record<
      number,
      { currentNative: number; projectedNative: number }
    >;
    // Invoice rows only (mirrors EngineSpendValues): the invoice's whole
    // recorded amount, window-independent. See enrich.ts.
    recordedNative?: number;
    recordedBase?: number;
    // Historical-FY path only (mirrors EngineSpendValues; inlined because
    // lib/v2/spend imports this module): the cycle in force for the stamped
    // window and whether the contract contributed spend to it.
    cycle?: {
      termStart: string;
      termEnd: string;
      cancelBy: string | null;
    } | null;
    activeInWindow?: boolean;
  };
}

export interface EnrichedProduct {
  product_id: number;
  name: string;
  vendor_id: number | null;
  vendor_name: string;
  vendor_domain?: string;
  contract_id: number;
  sourceContractId: number;
  isSuperseded: boolean;
  supersededByContractId?: number;
  // Superseding metadata
  isSuperseding: boolean;
  supersedesProductInContractId?: number;
  currentFee: number;
  currency: string;
  currentFeeUSD: number;
  currentProducts?: any[];
  // Effective fees (after merging amendment fees)
  effectiveFeeUSD: number;
  /** Native counterpart pair — see ProductWithPricing. */
  effectiveFee?: number;
  effectiveFeeCurrency?: string;
  feeSourceContractId?: number;
}

// =============================================================================
// SUBROW TYPES
// =============================================================================

/**
 * Product subrow displayed beneath a contract row in tables.
 * Used when a contract has multiple products to show individual product details.
 */
export interface ProductSubRow {
  id: string;
  contract_id: string;
  vendor_products: {
    id: number;
    name: string;
  };
  fees: number;
  compoundedFees: number;
  currentBudget: number;
  /**
   * Null on an invoice line: the fee was billed once, on its dates, so nothing
   * projects forward and the cell shows blank — the same rule the parent
   * invoice row follows (psk-996).
   */
  projectedBudget: number | null;
  currency: string;
  year: number;
  termStartDate: string | null;
  fiscalYearStart?: number;
  isProductRow: true;
  isReportRow: false;
  isSuperseded?: boolean;
}

/**
 * Report-specific subrow types for different report views.
 * Each report type can have its own specialized subrow format.
 */
export interface MissingClausesSubRow {
  id: string;
  contract_id: string;
  isMissingClausesRow: true;
  isReportRow: true;
  missingClauses: string[];
}

export interface MissingDoraCategoriesSubRow {
  id: string;
  contract_id: string;
  isMissingDoraCategoriesRow: true;
  isReportRow: true;
  missingDoraCategories: string[];
}

export interface ProductUsageSubRow {
  id: string;
  contract_id: string;
  product: Array<{ vendor_products: { id: number | string; name: string } }>;
  productUsage: {
    totalSeats: {
      assigned: number;
      licensed: number;
      value: number;
      valuePerSeat: number;
      unusedSeatsValue: number;
    };
  };
  seatUsage: {
    assigned: number;
    licensed: number;
  };
  potentialOverage: number;
  currency: string;
  isReportRow: true;
  isProductUsageRow: true;
  isSuperseded?: boolean;
  isEnterprise?: boolean;
  reportType: 'utilization';
}

export interface LeaverSubRow {
  id: string;
  contract_id: string;
  isReportRow: true;
  isLeaverSubRow: true;
  reportType: 'leavers';
  departedEmployeeNames: string[];
}

export interface InvoiceProductSubRow {
  id: string;
  contract_id: string;
  product: Array<{ vendor_products: { id: number | string; name: string } }>;
  expectedInvoiceAmount: number;
  adjustedParentAmount: number;
  invoiceAmount: number;
  adjustedInvoiceAmount: number;
  parentBillingFrequency: string;
  invoiceBillingFrequency: string;
  difference: number;
  discrepancy: number;
  frequencyAligned: boolean;
  frequencyMultiplier: number;
  invoiceFreqMultiplier: number;
  frequencyMismatch: boolean;
  parent_fee: number;
  invoice_fee: number;
  currency: string;
  isReportRow: true;
  isInvoiceProductRow: true;
  reportType: 'invoices';
}

/**
 * Union type of all possible report subrow types
 */
export type ReportSubRow =
  | MissingClausesSubRow
  | MissingDoraCategoriesSubRow
  | ProductUsageSubRow
  | InvoiceProductSubRow
  | LeaverSubRow;

/**
 * Union type of all possible subrow types (product + report)
 */
export type ContractSubRow = ProductSubRow | ReportSubRow;

// =============================================================================
// CONTRACT TABLE ROW TYPES (V2)
// =============================================================================

/**
 * Tag attached to a contract
 */
export interface ContractTag {
  id: number;
  name: string;
}

/**
 * Asset class associated with a contract
 */
export interface AssetClass {
  id: number;
  name: string;
}

/**
 * A sharing group (from the groups table) — the ACL sense, extractSharedGroups' output.
 */
export interface ContractGroup {
  id: number;
  name: string;
  publicUuid: string;
}

/**
 * Product in current products array
 */
export interface CurrentProduct {
  product_id: number;
  fees: number;
  compoundedFees: number;
  originalFees: number;
  sort_order?: number | null;
  vendor_products: {
    id: number;
    name: string;
  };
  originalCurrency: string;
  isSuperseded: boolean;
}

/**
 * V2 Contract Table Row
 *
 * This is the V2-native type for contract rows displayed in tables.
 * It replaces the legacy ProcessedContract type with a cleaner structure.
 *
 * Key differences from legacy ProcessedContract:
 * - subRows is properly typed as ProductSubRow[] | ContractTableRow[]
 * - Report-specific fields are optional and populated conditionally by report pipelines
 * - Cleaner separation of concerns
 */
export interface ContractTableRow {
  // Identity
  id: string;
  contract_id: string;
  vendor: string;
  vendorId: string;
  vendorDomain: string;

  // Contract metadata
  type: string | string[];
  typeId: number;
  status: string;
  status_id: number;
  contractStatus: number;
  contract_status: string;
  renewalType: string;
  billingFrequency: string;
  term: number;
  renewalPeriod: number;
  multiYear?: boolean;
  renewed: boolean;
  currency: string;
  aiExtractionStatus: string;
  fileName: string;
  orderNumber?: string | number | null;

  // Dates
  termStartDate: string | null;
  executionDate: string | null;
  termEndDate: string | null;
  originalStartDate: string;
  originalEndDate: string;
  cancelByDate: string | null;
  cancelByDateRange: string | null;
  /** Set when cancelByDate was derived from the MSA parent's notice period */
  cancelByDateInherited?: InheritedCancelByDate | null;

  // Financial values (native currency). Projected/difference are null for
  // invoices — a billing event that already happened projects nothing
  // (decision #11), and the cells render blank rather than $0.
  currentBudget: number;
  projectedBudget: number | null;
  // Invoices only, else null: the whole amount the invoice records, which is
  // window-independent — the invoices folder lists a register of what was
  // billed, so a prior-period invoice shows its amount here while
  // currentBudget keeps reporting its (correct) zero for the current window.
  // Invoice-only vendor group rows carry the USD sum of their children;
  // absent on rows built without engine stamps (reports, unstamped paths).
  recordedAmount?: number | null;
  recordedAmountUSD?: number | null;
  annualCost: number;
  annualDifference: number | null;
  totalContractValue: number;
  lifetimeContractValue: number;
  discount: number;
  annualIncrease: number;

  // Financial values (USD converted)
  convertedCurrentBudget: number;
  convertedProjectedBudget: number | null;
  convertedAnnualCost: number;
  convertedTotalContractValue: number;
  convertedLifetimeContractValue: number;
  originalCurrency: string;

  // Effective values account for amendments that supersede parent product fees
  effectiveCurrentBudgetUSD?: number;
  effectiveProjectedBudgetUSD?: number;
  effectiveTotalContractValueUSD?: number;

  // Products
  product: VendorProductDetail[];
  currentProducts: CurrentProduct[];
  currentYearProducts?: CurrentProduct[];

  // Ownership
  businessSponsor: string | string[];
  businessGroup: string;
  businessGroups?: BusinessGroupRef[];
  uploadedBy?: { id: string; name: string; email?: string };

  // Organization
  tags?: ContractTag[];
  assetClasses?: AssetClass[];
  folderId?: string | null;
  folderContracts?: any[];
  fiscalYearStart?: number;

  // Flags
  isDuplicate: boolean;
  willNotRenew?: boolean;
  willNotRenewNextYear?: boolean;
  isFullySuperseded?: boolean;
  isLinkedChildInvoice?: boolean;

  // Superseded products tracking (for UI strikethrough)
  supersededProducts?: string[];

  // Grouping
  isGroup?: boolean;

  // Row type indicators (for subrows and mixed table views)
  isProductRow?: boolean;
  isReportRow?: boolean;

  // Lineage nesting (set by nestContractRowsByLineage). Separate from
  // `row.depth`, which also counts the vendor group level above these.
  /** 0 for a chain root, n for a descendant. */
  lineageDepth?: number;
  /** This contract is nested under another contract. */
  isLineageChild?: boolean;
  /** This contract has contract children, as opposed to product sub-rows. */
  hasLineageChildren?: boolean;
  /** Earliest date across this row's subtree; read only by lineage-aware sorting. */
  subtreeEarliestTermEndDate?: string | null;
  subtreeEarliestCancelByDate?: string | null;
  isSuperseded?: boolean;
  fees?: number;
  compoundedFees?: number;

  // DORA compliance fields (populated by dora report)
  doraScore?: {
    score: number;
    details: Record<string, boolean>;
  };
  doraScoreValue?: number;
  missingDoraCategories?: string[];
  isMissingDoraCategoriesRow?: boolean;
  hasICTVendor?: boolean;

  // Missing clauses fields (populated by contract-omissions report)
  missingClauses?: string[];
  hasMissingClauses?: boolean;
  missingClausesCount?: number;
  isMissingClausesRow?: boolean;

  // NDA fields (populated by nda report)
  ndaRiskLevel?: 1 | 2 | 3;
  ndaRiskFlags?: number;
  ndaInsights?: Record<string, boolean>;
  extendedTermEndDate?: string | null;

  // Invoice comparison fields (populated by invoices report)
  invoiceStatus?: string | null;
  invoiceDecisionReason?: string | null;
  externalInvoiceStatus?: string | null;
  externalSource?: string | null;
  isInvoiceReport?: boolean;
  reportType?: string;
  rawParentAmount?: number;
  rawInvoiceAmount?: number;
  adjustedParentAmount?: number;
  adjustedInvoiceAmount?: number;
  expectedInvoiceAmount?: number;
  parentBillingFrequency?: string;
  invoiceBillingFrequency?: string;
  invoiceFreqMultiplier?: number;
  frequencyMultiplier?: number;
  frequencyAligned?: boolean;
  difference?: number;
  discrepancy?: number;
  /** Discrepancy in the org base currency, at the invoice-date FX rate. */
  discrepancyBase?: number;
  isInvoiceProductRow?: boolean;
  isUnmatched?: boolean;
  hasUnmatchedProducts?: boolean;

  // Utilization fields (populated by utilization report)
  productUsage?: {
    contractUsers: Array<{
      id: number;
      name: string;
      email: string;
      productId: number;
      productName: string;
    }>;
    totalSeats: {
      assigned: number;
      licensed: number;
      value: number;
      valuePerSeat: number;
      unusedSeatsValue: number;
    };
    byProduct: Record<
      string,
      {
        id: number;
        name: string;
        seats: any;
        users: any[];
      }
    >;
  };
  isProductUsageRow?: boolean;
  seatUsage?: {
    assigned: number;
    licensed: number;
  };
  seatUsageDisplay?: string;
  utilizationPercentage?: number;
  pricePerSeat?: number;
  potentialOverage?: number;
  unusedSeatsValue?: number;
  singleAllocatedProduct?: { id: string | number; name: string };
  isEnterprise?: boolean;

  // Trial/days remaining fields
  daysRemaining?: number;

  // Leavers report fields
  departedLicensesCount?: number;

  // Subrows - properly typed for V2
  subRows?: ProductSubRow[] | ContractTableRow[];
}

/**
 * Vendor group row - extends ContractTableRow with vendor-specific fields
 */
export interface VendorGroupRow extends Omit<ContractTableRow, 'subRows'> {
  isGroup: true;
  subRows: ContractTableRow[];
}
