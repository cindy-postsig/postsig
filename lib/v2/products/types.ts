/**
 * Shared types for product-related data structures.
 * Used by ProductsLicensed, ProductTableRenderer, and other product components.
 */

export interface DateEntry {
  date: string | null;
  updated_at: string;
}

export interface SalesTaxDetail {
  year: number;
  sales_tax: string | number;
  sales_tax_percent?: string | number | null;
  description?: string;
  amount?: number;
}

export interface VendorProduct {
  id: number;
  name: string;
  product_code?: string | null;
  delivery_method_id?: number | null;
  data_delivery_types?: { id: number; name: string } | null;
}

export interface VendorProductsDetail {
  id: number;
  product_id: number;
  fees: number;
  year: number;
  sort_order?: number | null;
  vendor_products?: VendorProduct;
  vendor_products_details_versions?: Array<{
    changed_data?: Record<string, unknown> | null;
  }>;
  // FX stamp written by convertAllProductsToUSD. `fees` stays native;
  // `convertedFees` is in the org base currency; fxRate/fxDate are null when no
  // conversion was needed or no quote existed.
  convertedFees?: number;
  fxRate?: number | null;
  fxDate?: string | null;
  fxTargetCurrency?: string;
}

export interface VendorProductsUser {
  id: number;
  product_id: number;
  number_of_users: number | null;
  enterprise?: boolean;
}

// Raw product data for edit mode ID lookups
export interface RawProductData {
  vendorProductsDetails: VendorProductsDetail[];
  vendorProductsUsers: VendorProductsUser[];
  vendorProducts: VendorProduct[];
}
