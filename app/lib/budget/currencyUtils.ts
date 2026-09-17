import { buildBaseCurrencyRates } from '@/lib/v2/core/baseRates';
import { getContractStartDate } from '@/lib/v2/products/transforms';

/**
 * Rate lookup for a set of contracts, each converting at the rate of the day it
 * started. One prefetch for the whole set; none at all when every contract is
 * already in the target currency.
 */
function ratesFor(contracts: any[], targetCurrency: string) {
  return buildBaseCurrencyRates(
    contracts.map((c: any) => ({
      currency: c?.currency,
      startDate: getContractStartDate(c ?? {}),
    })),
    targetCurrency,
  );
}

/**
 * Calculate total fees for all contracts of a vendor with currency conversion
 * @param vendor Vendor object with contracts array
 * @param targetCurrency Currency to convert into (defaults to USD)
 * @returns Total fees in the target currency
 */
export async function calculateTotalFees(
  vendor: any,
  targetCurrency: string = 'USD',
) {
  const contracts = vendor.contracts || [];
  if (contracts.length === 0) return 0;

  const rates = await ratesFor(contracts, targetCurrency);

  let totalFees = 0;
  for (const contract of contracts) {
    const currency = contract.currency
      ? contract.currency.toUpperCase()
      : 'USD';

    const productSum = (contract.vendor_products_details || []).reduce(
      (productAcc: number, product: any) => {
        const fee = parseInt(product.fees);
        return isNaN(fee) ? productAcc : productAcc + fee;
      },
      0,
    );

    totalFees +=
      productSum * rates.multiplier(currency, getContractStartDate(contract));
  }

  return totalFees;
}
