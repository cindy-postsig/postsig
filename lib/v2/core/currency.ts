/**
 * Currency Conversion Functions
 *
 * Handles exchange rate fetching and currency conversion.
 * Designed for batch operations to minimize API calls.
 */

import Currencyapi from '@everapi/currencyapi-js';
import { getCacheService } from '@/app/lib/redis/cache-service';
import logger from '@/utils/pino';

const CACHE_KEY = 'exchange-rates:usd';
const CACHE_TTL = 6 * 60 * 60; // 6 hours

let currencyApiClient: Currencyapi | null = null;

function getCurrencyApiClient(): Currencyapi {
  if (!currencyApiClient) {
    const apiKey = process.env.CURRENCY_API_KEY;
    if (!apiKey) {
      throw new Error('CURRENCY_API_KEY environment variable is not set');
    }
    currencyApiClient = new Currencyapi(apiKey);
  }
  return currencyApiClient;
}

/**
 * Fetch exchange rates for multiple currencies in a single call.
 * Returns rates for converting FROM each currency TO USD.
 * Uses Redis caching with 6-hour TTL.
 * Pass empty array to get all available rates.
 */
export async function getExchangeRates(
  currencies: string[] = [],
): Promise<Record<string, number>> {
  // Filter out USD and deduplicate
  const uniqueCurrencies = [
    ...new Set(
      currencies.map((c) => c.toUpperCase()).filter((c) => c && c !== 'USD'),
    ),
  ];

  const returnAllRates = currencies.length === 0;

  try {
    // Try to get cached rates
    const cacheService = await getCacheService();
    const cachedRates =
      await cacheService.redisService.get<Record<string, number>>(CACHE_KEY);

    if (cachedRates) {
      if (returnAllRates) {
        logger.debug('Exchange rates cache hit (all rates)');
        return { USD: 1, ...cachedRates };
      }
      // Check if we have all requested currencies
      const missingCurrencies = uniqueCurrencies.filter(
        (c) => !(c in cachedRates),
      );
      if (missingCurrencies.length === 0) {
        logger.debug(
          { currencies: uniqueCurrencies },
          'Exchange rates cache hit',
        );
        // Return only requested currencies
        const filteredRates: Record<string, number> = { USD: 1 };
        uniqueCurrencies.forEach((c) => {
          if (cachedRates[c]) filteredRates[c] = cachedRates[c];
        });
        return filteredRates;
      }
    }

    // Fetch fresh rates from API
    const client = getCurrencyApiClient();
    const response = await client.latest({
      base_currency: 'USD',
    });

    if (!response.data) {
      throw new Error('No data returned from currency API');
    }

    // Convert rates: API returns USD -> X, we need X -> USD
    const rates: Record<string, number> = {};
    for (const [currency, data] of Object.entries(response.data)) {
      if (
        currency !== 'USD' &&
        data &&
        typeof data === 'object' &&
        'value' in data
      ) {
        // Rate is USD -> currency, so invert for currency -> USD
        rates[currency] = 1 / (data as { value: number }).value;
      }
    }

    // Cache the rates
    await cacheService.redisService.set(CACHE_KEY, rates, undefined, CACHE_TTL);
    logger.info(
      { currencyCount: Object.keys(rates).length },
      'Exchange rates fetched and cached',
    );

    if (returnAllRates) {
      return { USD: 1, ...rates };
    }

    // Return only requested currencies
    const filteredRates: Record<string, number> = { USD: 1 };
    uniqueCurrencies.forEach((c) => {
      if (rates[c]) filteredRates[c] = rates[c];
    });
    return filteredRates;
  } catch (error) {
    logger.error(
      { error, currencies: uniqueCurrencies },
      'Error fetching exchange rates',
    );

    // Return fallback rates (1:1)
    const fallbackRates: Record<string, number> = { USD: 1 };
    if (!returnAllRates) {
      uniqueCurrencies.forEach((c) => {
        fallbackRates[c] = 1;
      });
    }
    return fallbackRates;
  }
}

/**
 * Convert a value to USD using pre-fetched rates.
 */
export function convertToUSD(
  value: number,
  currency: string,
  rates: Record<string, number>,
): number {
  if (!value || value === 0) return 0;
  const normalizedCurrency = currency?.toUpperCase() || 'USD';
  if (normalizedCurrency === 'USD') return value;
  return value * (rates[normalizedCurrency] || 1);
}
