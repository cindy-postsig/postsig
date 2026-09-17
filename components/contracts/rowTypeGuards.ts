interface RowTypeGuardInput {
  original: {
    id?: string | number | null;
    vendor_products?: unknown;
    isProductRow?: boolean;
    isProductUsageRow?: boolean;
    isInvoiceProductRow?: boolean;
    isMissingDoraCategoriesRow?: boolean;
    isMissingClausesRow?: boolean;
  };
}

export const isProductRow = (row: RowTypeGuardInput): boolean =>
  'vendor_products' in row.original;

export const isVendorRow = (row: RowTypeGuardInput): boolean =>
  row.original.id?.toString().startsWith('vendor-') ?? false;

export const isReportRow = (row: RowTypeGuardInput): boolean =>
  row.original.id?.toString().startsWith('report-') ?? false;

/**
 * Any row that is a detail *of* a contract rather than a contract itself:
 * product, product-usage, invoice-product, and the report detail rows.
 *
 * Replaces the `row.depth >= 2` checks that used to identify these. Depth
 * stopped being a reliable signal once contracts can nest under one another —
 * a product row's depth is now whatever its contract's depth is, plus one.
 */
export const isLeafDetailRow = (row: RowTypeGuardInput): boolean =>
  isProductRow(row) ||
  isReportRow(row) ||
  row.original.isProductRow === true ||
  row.original.isProductUsageRow === true ||
  row.original.isInvoiceProductRow === true ||
  row.original.isMissingDoraCategoriesRow === true ||
  row.original.isMissingClausesRow === true;
