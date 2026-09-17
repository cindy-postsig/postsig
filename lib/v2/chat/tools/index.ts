import type { UserMetadata } from '@/constants/types';
import type { ChatToolCache } from '@/lib/v2/chat/tools/cache';
import { createGetCurrentDateTool } from './utils';
import { createCalculateSpendTool } from './spend';
import {
  createClauseTool,
  createBillingFrequencyTool,
  createUsageRestrictionsTool,
  createExpiringContractsTool,
  createRenewalTool,
  createDiscountsTool,
  createDoraTool,
  createNdaRiskTool,
  createAssetClassTool,
  createRecentUploadsTool,
  createPriceIncreaseTool,
  createUnexecutedTool,
  createVendorStatisticsTool,
  createSeatUtilizationTool,
  createSearchContractsTool,
  createListContractsTool,
} from './queries';
import { createSummarizePaymentTermsTool } from './payments';
import { createGetGroupsTool } from './groups';
import { createQueryTagsTool } from './tags';
import { createSynthesisVendorIntelligenceTool } from './synthesis';
import { createResolveEntityTool } from './resolve-entity';
import { createAnnualIncreaseTool } from './annual-increase';

export function getChatTools(user: UserMetadata | null, cache: ChatToolCache) {
  return {
    get_current_date: createGetCurrentDateTool(),
    calculate_spend: createCalculateSpendTool(user, cache),
    query_clause: createClauseTool(user, cache),
    query_billing_frequency: createBillingFrequencyTool(user, cache),
    query_usage_restrictions: createUsageRestrictionsTool(user, cache),
    query_expiring_contracts: createExpiringContractsTool(user, cache),
    query_renewals: createRenewalTool(user, cache),
    query_discounts: createDiscountsTool(user, cache),
    query_dora_compliance: createDoraTool(user, cache),
    query_nda_risk: createNdaRiskTool(user, cache),
    query_asset_class: createAssetClassTool(user, cache),
    query_recent_uploads: createRecentUploadsTool(user, cache),
    query_price_increase: createPriceIncreaseTool(user, cache),
    query_unexecuted: createUnexecutedTool(user, cache),
    query_vendor_statistics: createVendorStatisticsTool(user, cache),
    query_seat_utilization: createSeatUtilizationTool(user, cache),
    search_contracts: createSearchContractsTool(user, cache),
    list_contracts: createListContractsTool(user, cache),
    summarize_payment_terms: createSummarizePaymentTermsTool(user, cache),
    get_groups: createGetGroupsTool(user, cache),
    query_tags: createQueryTagsTool(user, cache),
    resolve_entity: createResolveEntityTool(user, cache),
    query_annual_increase: createAnnualIncreaseTool(user, cache),
  };
}

export {
  createGetCurrentDateTool,
  createCalculateSpendTool,
  createClauseTool,
  createBillingFrequencyTool,
  createUsageRestrictionsTool,
  createExpiringContractsTool,
  createRenewalTool,
  createDiscountsTool,
  createDoraTool,
  createNdaRiskTool,
  createAssetClassTool,
  createRecentUploadsTool,
  createPriceIncreaseTool,
  createUnexecutedTool,
  createVendorStatisticsTool,
  createSeatUtilizationTool,
  createSearchContractsTool,
  createListContractsTool,
  createSummarizePaymentTermsTool,
  createGetGroupsTool,
  createQueryTagsTool,
  createSynthesisVendorIntelligenceTool,
  createResolveEntityTool,
  createAnnualIncreaseTool,
};

export { ChatToolCache, createChatToolCache } from '@/lib/v2/chat/tools/cache';
