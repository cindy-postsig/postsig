/**
 * Inventory Types
 *
 * V2-native types for inventory items displayed in tables.
 */

import { VendorProductDetails } from '@/constants/types';
import { FieldAmendments } from '@/lib/v2/core/types';
import type { BusinessGroupRef } from '@/lib/v2/owners/types';

/**
 * Fields that can be amended in inventory items.
 * Used for per-field amendment tracking.
 */
export interface AmendableInventoryFields {
  licensesCount: number;
  deliveryMethods: string[];
  startDate: string;
  endDate: string;
  endUsers: string;
  annualIncrease: number | null;
  cost: { amount: number; currency: string };
  businessSponsor: string[];
}

/**
 * Active user associated with an inventory item
 */
export interface InventoryActiveUser {
  id: number;
  name: string;
  email: string | null;
  product_id: number;
  employee_id: string | null;
  region: string | null;
  country: string | null;
  division: string | null;
  department: string | null;
  cost_center: string | null;
  entity: string | null;
  business_unit: string | null;
  team: string | null;
  businessGroup: { id: number; name: string } | null;
  start_date: string | null;
  leave_date: string | null;
  org_employee_id: number | null;
}

/**
 * Term start date entry
 */
interface TermStartDateEntry {
  date: string | null;
  updated_at?: string;
}

/**
 * Term products structure for fee breakdown display
 */
export interface InventoryTermProducts {
  productsByYear: Record<string, any[]>; // TODO: type properly from priceHistoryProducts
  hasValidTermDate: boolean;
  sortedYears: string[];
  termStartDate: TermStartDateEntry[];
  fiscalYearStartMonth?: number;
}

/**
 * V2 Inventory Item
 *
 * Represents a product from a contract displayed in the inventory view.
 * One product per contract family after lineage processing.
 */
export interface InventoryItem {
  // Identity
  id: string;
  vendor: string;
  vendorId?: number | null;
  vendorDomain?: string;
  /** Where the row came from; absent means a contract. */
  source?: 'contract' | 'bloomberg-sid';

  // Product info
  productName: string[];
  product_id?: number;
  licensesCount: number;
  endUsers: string;

  // Dates
  startDate: string;
  endDate: string;

  // Financial
  /** Org base currency — what vendor rollups sum and the Cost column sorts on. */
  cost: number;
  /**
   * What the row displays (PSK-1796): a product row's fee unconverted in the
   * fee-source contract's currency; a vendor group's shared currency when its
   * items agree, else the org base.
   */
  costNative: number;
  currency: string;

  // Delivery
  deliveryMethods: string[];

  // Status
  status: 'Active' | 'Inactive';

  // Users
  activeUsers: InventoryActiveUser[];
  enterprise?: boolean;

  // Alert fields
  contractedLicenses?: number;
  activeLicenses?: number;
  isExpiredButActive?: boolean;
  hasMissingDeployment?: boolean;
  contractedTeams?: number;
  deployedTeams?: number;

  // Grouping
  subRows?: InventoryItem[];
  vendor_products?: { name: string };
  isVendorGroup?: boolean;

  // Contract relationship
  contractId?: string;
  contractType?: string;
  executionDate?: string;

  // Ownership
  businessSponsor?: string[];
  businessGroup?: string;
  businessGroups?: BusinessGroupRef[];

  // Pricing
  annualIncrease?: number | null;
  currentTermProducts?: InventoryTermProducts | null;

  // Source tracking for merged products (amendment chain)
  pricingSourceContractId?: number;
  pricingSourceContractType?: string;

  // Vendor product details with amendment tracking fields
  vendor_products_details?: Array<
    VendorProductDetails & {
      _replacedByChild?: boolean;
      _replacedByContractId?: number;
      _replacedByContractType?: string;
    }
  >;

  /**
   * Per-field amendment tracking.
   * Only populated when at least one field was amended.
   * Each field entry only present if that specific field differs from original.
   */
  amendments?: FieldAmendments<AmendableInventoryFields>;
}

/**
 * Inventory result from service
 */
export interface InventoryResult {
  items: InventoryItem[];
  count: number;
}
