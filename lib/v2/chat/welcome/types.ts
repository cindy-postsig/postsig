/**
 * Types for chat welcome data
 */

export interface ExpiringContractsData {
  count: number;
  totalValueUSD: number;
}

export interface RecentUploadsData {
  count: number;
}

export interface TopVendorData {
  name: string;
  totalSpend: number;
}

export interface WelcomeData {
  expiringContracts: ExpiringContractsData;
  recentUploads: RecentUploadsData;
  topVendors: TopVendorData[];
  suggestedPrompts: string[];
}

export interface WelcomeDataResponse {
  data: WelcomeData;
}
