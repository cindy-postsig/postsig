// This file contains type definitions for your data.
// It describes the shape of the data, and what data type each property should accept.
// For simplicity of teaching, we're manually defining these types.

import { BillingFrequency } from '@/app/lib/budget/invoiceUtils';
import { AIExtractionStatus } from '@/app/lib/constants';

// However, these types are generated automatically if you're using an ORM such as Prisma.
export type User = {
  id: string;
  name: string;
  email: string;
  password: string;
};

export type Contracts = {
  id: number;
  contract_types: {
    name: string | null;
  } | null;
  contract_statuses: {
    id: number;
    name: string;
  } | null;
  vendors: {
    name: string | null;
  } | null;
  users: {
    name: string | null;
  } | null;
}[];

export type Vendor = {
  id: number;
  name: string;
  description: string;
  domain: string;
  address: string;
};

export type Product = {
  name: string;
  fees: number;
  compoundedFees?: number;
  originalFees?: number;
  renewalCount?: number;
  displayFees?: number;
  hasCompoundedIncrease?: boolean;
  vendor_products: any;
};

export interface BudgetContract {
  id: number;
  vendor_id: number;
  vendors: any;
  vendor_products_details: Array<{
    fees: number;
    [key: string]: any;
  }>;
  [key: string]: any;
}

export interface InvoiceNormalizationResult {
  expectedInvoiceAmount?: number;
  invoiceAmount?: number;
  difference?: number;
  discrepancy?: number;
  parentBillingFrequency?: string;
  frequencyMultiplier?: number;
  frequencyAligned?: boolean;
}

/**
 * Action types available in the contracts table
 * These control which bulk actions and filters are shown
 */
export type ActionType =
  | 'bulkEdit'
  | 'export'
  | 'archive'
  | 'bulk-edit'
  | 'folder'
  | 'share'
  | 'tags'
  | 'renewalType'
  | 'confirmIct'
  | 'addIct'
  | 'notIct'
  | 'none'
  | string;

export type ContractsTableRow = {
  id: string;
  vendor: string;
  orderNumber?: string | number | null;
  vendorId: string;
  vendorDomain: string;
  type: string | string[];
  typeId: number;
  contractStatus: number;
  status: string;
  status_id: number;
  user_id?: string;
  contract_id?: string;
  uploadedBy?: { id: string; name: string; email?: string };
  product: Product[];
  currentProducts: any[];
  currentYearProducts?: any[]; // Products contributing to current year spend
  cancelByDateRange: string | any;
  termStartDate: string | null;
  originalStartDate: string;
  termEndDate: string | null;
  originalEndDate: string;
  billingFrequency: string;
  discount: number;
  totalContractValue: number;
  lifetimeContractValue: number;
  currentBudget: number;
  projectedBudget: number;
  annualCost?: number; // Added for sorting
  annualDifference: number;
  annualIncrease: number;
  cancelByDate: string | null | any;
  term: number;
  renewalPeriod: number;
  multiYear?: boolean;
  renewalType: string;
  projectedCost?: number;
  active?: boolean;
  renewed: boolean;
  contract_status: string;
  subRows?: ContractsTableRow[];
  currency: string;
  aiExtractionStatus: AIExtractionStatus | string;
  fileName: string;
  businessSponsor: string | string[];
  businessGroup: string;
  isDuplicate: boolean;
  fees?: number;
  willNotRenew?: boolean;
  willNotRenewNextYear?: boolean;
  isReportRow?: boolean;
  isProductRow?: boolean;
  isSuperseded?: boolean;
  isFullySuperseded?: boolean;
  hasMissingClauses?: boolean;
  missingClauses?: any[];
  missingClausesCount?: number; // Added for sorting
  isMissingClausesRow?: boolean;
  doraScore: {
    score: number;
    details: Record<string, boolean>;
  };
  doraScoreValue?: number; // Added for sorting
  missingDoraCategories: string[];
  isMissingDoraCategoriesRow?: boolean;
  hasICTVendor?: boolean;

  isInvoiceReport?: boolean;
  reportType?: string;
  rawParentAmount?: number;
  rawInvoiceAmount?: number;

  adjustedParentAmount?: number;
  adjustedInvoiceAmount?: number;

  expectedInvoiceAmount?: number;

  parentBillingFrequency?: BillingFrequency;
  invoiceBillingFrequency?: BillingFrequency;
  invoiceFreqMultiplier?: number;
  frequencyMultiplier?: number;
  frequencyAligned?: boolean;

  difference?: number;
  discrepancy?: number;
  /** Discrepancy in the org base currency, at the invoice-date FX rate. */
  discrepancyBase?: number;

  isProductUsageRow?: boolean;
  unusedSeatsValue?: number;
  // New fields for sorting report columns
  seatUsageDisplay?: string;
  utilizationPercentage?: number;
  pricePerSeat?: number;
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
    byProduct: {
      [key: string]: {
        id: number;
        name: string;
        seats: any;
        users: any[];
      };
    };
  };
  fiscalYearStart?: number;
  tags?: Array<{
    id: number;
    name: string;
  }>;
  assetClasses?: Array<{
    id: number;
    name: string;
  }>;
  extendedTermEndDate?: string | null;
  ndaRiskLevel?: 1 | 2 | 3;
  ndaRiskFlags?: number;
  ndaInsights?: Record<string, boolean>;
  isGroup?: boolean;
  folderId?: string | null;
  folderContracts?: Array<{
    folder_id: string;
  }>;
};

export type ContractsTable = {
  headers?: { key: string; label: string; sort: boolean; customCss: string }[];
  rows: ContractsTableRow[];
};

export type AssetClass = {
  id: number;
  name: string;
};

export type ContractAssetClass = {
  contract_id: number;
  asset_class_id: number;
  is_parent_tag: boolean;
};

/**
 * Contract relationship from database
 * Represents parent-child relationships between contracts (amendments, addendums, etc.)
 */
export interface ContractRelationship {
  id?: number;
  parent_contract_id: number | null;
  child_contract_id: number | null;
  organization_id?: string | null;
  // NULL = hierarchy edge; 'billing' = an additional parent of an invoice that
  // tree-shaped code must ignore. Optional because narrow selects omit it —
  // which means `isHierarchyEdge` FAILS OPEN on a row that never loaded the
  // column (`undefined == null`). Before filtering a new call site, confirm its
  // select actually asks for `relationship_type`, or the guard is a no-op.
  relationship_type?: string | null;
  active: boolean | null;
  disabled?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: any;
}

export interface MatchedInvoiceProduct {
  id: string;
  product_id: number | string;
  product_name: string;
  product_code?: string | null;
  parent_fee: number;
  invoice_fee: number;
  expectedInvoiceAmount: number;
  adjustedParentAmount: number;
  adjustedInvoiceAmount: number;
  invoiceBillingFrequency: BillingFrequency;
  parentBillingFrequency: BillingFrequency;
  difference: number;
  discrepancy: number;
  frequencyAligned: boolean;
  frequencyMultiplier: number;
  invoiceFreqMultiplier: number;
  parentProduct: any;
  invoiceProduct: any;
}

export interface ProcessedContract extends ContractsTableRow {
  isGroup?: boolean;
  parentContract?: any;
  matchedProducts?: MatchedInvoiceProduct[];
  isInvoiceProductRow?: boolean;
  seatUsage?: {
    assigned: number;
    licensed: number;
  };
  potentialOverage?: number;
  originalCurrency?: string;
  convertedTotalContractValue?: number;
  convertedLifetimeContractValue?: number;
  convertedAnnualCost?: number;
  convertedCurrentBudget?: number;
  convertedProjectedBudget?: number;
  supersededProducts?: string[]; // Array of product keys that have been superseded by later amendments
  isFullySuperseded?: boolean;
  invoiceStatus?: string | null;
  executionDate?: string | null;
}
