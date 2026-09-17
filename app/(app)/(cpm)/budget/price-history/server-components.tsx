import { notFound } from 'next/navigation';
import { getActiveAndArchivedContracts } from '@/lib/v2';
import { getUserMetadata } from '@/data/users';
import { enrichContractProducts } from '@/lib/v2/products/transforms';
import {
  buildVendorPriceSummaries,
  type PriceHistoryCostMethod,
} from '@/lib/v2/reports/price-history/summary';
import { buildSpendRateProvider } from '@/lib/v2/core/spendRates';
import { isInvoiceType } from '@/app/lib/constants';
import type { CurrencyPolicy } from '@/lib/v2/spend';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import { PriceHistoryView } from '@/components/budget/PriceHistoryView';
import { getDefaultCostMethod } from '@/lib/settings/default-cost-method';
import type { ContractSummary } from '@/components/budget/ContractSummarySheet';
import { Card, CardContent } from '@/components/ui/card';

function buildContractSummary(
  ec: ContractWithPricing,
  fiscalYearStartMonth: number,
): ContractSummary {
  const contract = ec.contract;

  // Reuse the same enrichment ProductsLicensed and InventoryItemSheet use,
  // so the sheet renders fees with the same per-year structure (compounded
  // fees, sort order, hasValidTermDate, etc.) and currency context.
  const currentTermProducts = enrichContractProducts(
    contract,
    fiscalYearStartMonth,
  );

  return {
    contractId: ec.id,
    contractType: contract.contract_types?.name ?? 'Contract',
    vendorName: ec.vendor_name,
    vendorId: ec.vendor_id ?? undefined,
    vendorDomain: ec.vendor_domain,
    status: contract.status ?? 'unknown',
    termStartDate: contract.term_start_date?.[0]?.date ?? null,
    termEndDate: contract.term_end_date?.[0]?.date ?? null,
    // Surface the original date when the contract has been renewed (array
    // has >1 entry). Index [length-1] is the original; [0] is the current
    // active term.
    originalTermStartDate:
      (contract.term_start_date?.length ?? 0) > 1
        ? (contract.term_start_date?.[contract.term_start_date.length - 1]
            ?.date ?? null)
        : null,
    originalTermEndDate:
      (contract.term_end_date?.length ?? 0) > 1
        ? (contract.term_end_date?.[contract.term_end_date.length - 1]?.date ??
          null)
        : null,
    currency: currentTermProducts.currency ?? contract.currency ?? 'USD',
    renewalType: contract.renewal_type ?? null,
    renewalPeriodMonths: contract.renewal_period ?? null,
    subscriptionTermMonths: contract.subscription_term ?? null,
    billingFrequency: contract.billing_frequency ?? null,
    willNotRenew: contract.will_not_renew ?? false,
    annualIncrease: contract.annual_increase ?? null,
    annualIncreaseMonths: contract.annual_increase_months ?? null,
    currentTermProducts,
  };
}

export async function PriceHistoryServer() {
  const [
    userMetaData,
    { contracts: enrichedContracts, relationships, cutoffsByContract },
  ] = await Promise.all([getUserMetadata(), getActiveAndArchivedContracts()]);

  if (!userMetaData) {
    notFound();
  }

  const fiscalYearStartMonth = userMetaData.organizationFY ?? 1;
  // Loosely cap projections at ~1 year out so the table shows current + next
  // renewal (mirroring the "current budget" / "projected budget" framing on
  // the overview page), not a 5-year speculative horizon.
  const TARGET_YEAR = new Date().getFullYear() + 1;
  const asOf = new Date();

  // All three psk-1844 methods, precomputed so the client selector swaps
  // instantly; the shared resolver work dominates and stays warm per call.
  // The page's window opens at the epoch floor and closes at the FY after
  // TARGET_YEAR; the rate provider clamps the fetch to a sane earliest date.
  const currency: CurrencyPolicy = {
    mode: 'base',
    target: userMetaData.baseCurrency,
    rates: await buildSpendRateProvider({
      contracts: enrichedContracts.map((ec) => ec.contract),
      target: userMetaData.baseCurrency,
      asOf,
      span: {
        start: new Date('1970-01-01T00:00:00.000Z'),
        end: new Date(
          `${TARGET_YEAR + 1}-${String(fiscalYearStartMonth).padStart(2, '0')}-01T00:00:00.000Z`,
        ),
      },
    }),
  };

  const forMethod = (method: PriceHistoryCostMethod) =>
    buildVendorPriceSummaries(
      enrichedContracts,
      fiscalYearStartMonth,
      TARGET_YEAR,
      relationships ?? [],
      asOf,
      method,
      // Confirmed cancellation cutoffs (PSK-1830), resolved during the
      // shared enrichment: a cancelled product stops accruing at the
      // cancelling contract's effective start date.
      cutoffsByContract,
      currency,
    );
  const summaries = {
    committed: forMethod('committed'),
    amortized: forMethod('amortized'),
    actual: forMethod('actual'),
  };
  const { vendors } = summaries.committed;

  // The vendor rollup drops invoices/linked child invoices internally; the
  // contract summary sheets need the same filtered set.
  const aggregatable = enrichedContracts.filter(
    (c) => !isInvoiceType(c.contract.type_id) && !c.isLinkedChildInvoice,
  );

  if (vendors.length === 0) {
    return (
      <>
        <div className="mb-8 mt-6">
          <h1 className="mb-2 font-serif leading-none">Price History</h1>
          <p className="text-sm text-muted-foreground">
            Vendor pricing trends over time.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No price history available
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  const contractSummaries = aggregatable.map((ec) =>
    buildContractSummary(ec, fiscalYearStartMonth),
  );

  const defaultCostMethod = await getDefaultCostMethod(
    userMetaData.organizationId,
  );

  return (
    <PriceHistoryView
      summaries={summaries}
      contractSummaries={contractSummaries}
      defaultMethod={defaultCostMethod}
    />
  );
}
