import { Context } from 'hono';
import { getExchangeRates } from '@/lib/v2/core/currency';
import logger from '@/utils/pino';

/**
 * GET /api/v2/exchange-rates
 * Returns exchange rates for converting currencies to USD.
 */
export async function getRates(c: Context) {
  try {
    // Fetch all rates (uses Redis caching internally)
    const rates = await getExchangeRates();

    return c.json({
      rates,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching exchange rates');
    return c.json({ error: 'Failed to fetch exchange rates' }, 500);
  }
}
