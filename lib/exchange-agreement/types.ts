export const EXCHANGE_CODE = 'euronext';

export interface ExchangeSummary {
  code: string;
  name: string;
  lastPricingUpdateLabel: string | null;
  annualImpact: number | null;
  currency: string;
  productLineCount: number;
}

export interface FeeScheduleVersion {
  id: string;
  exchangeCode: string;
  productLine: string;
  version: string;
  label: string;
  effectiveDate: string;
  invalidatedDate: string | null;
  // Pre-signed, ready to open -- null until the source PDF is uploaded to
  // the exchange-fee-schedule-docs bucket and its path recorded.
  sourceDocumentUrl: string | null;
}

export interface FeeScheduleLineItem {
  id: string;
  versionId: string;
  productId: string;
  title: string;
  assetClass: string | null;
  useType: string;
  level: string | null;
  fee: number | null;
  currency: string | null;
  productCode: string | null;
  // Page in the version's source PDF this row was parsed from -- lets
  // "View Source" deep-link past the cover page instead of just opening
  // the document.
  page: number | null;
}

export interface ProductLineSummary {
  productLine: string;
  productCount: number;
  productsWithPriceChange: number;
  lastPricingUpdateLabel: string;
  lastPricingUpdateDate: string | null;
  annualImpact: number;
  currency: string;
}
