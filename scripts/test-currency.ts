/* eslint-disable no-console */
/**
 * Quick script to test currency conversion functionality
 * Run with: npx tsx scripts/test-currency.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local file
config({ path: resolve(process.cwd(), '.env.local') });

import { getExchangeRates, convertToUSD } from '../lib/v2/core/currency';

async function testCurrency() {
  console.log('Testing currency conversion...\n');

  try {
    // Test 1: Get exchange rates for specific currencies
    console.log('Test 1: Fetching EUR, GBP, JPY rates...');
    const rates = await getExchangeRates(['EUR', 'GBP', 'JPY']);
    console.log('Rates:', rates);

    // Test 2: Convert values to USD
    console.log('\nTest 2: Converting values to USD...');
    if (rates.EUR) {
      const eurValue = 100;
      const usdValue = convertToUSD(eurValue, 'EUR', rates);
      console.log(`€${eurValue} = $${usdValue.toFixed(2)}`);
    }

    if (rates.GBP) {
      const gbpValue = 100;
      const usdValue = convertToUSD(gbpValue, 'GBP', rates);
      console.log(`£${gbpValue} = $${usdValue.toFixed(2)}`);
    }

    // Test 3: Test USD (should return same value)
    console.log('\nTest 3: Converting USD to USD (should be same)...');
    const usdValue = convertToUSD(100, 'USD', rates);
    console.log(`$100 = $${usdValue.toFixed(2)}`);

    // Test 4: Get all rates (cached)
    console.log('\nTest 4: Fetching all rates (should use cache)...');
    const allRates = await getExchangeRates([]);
    console.log(`Total currencies available: ${Object.keys(allRates).length}`);
    console.log(
      'Sample currencies:',
      Object.keys(allRates).slice(0, 10).join(', '),
    );

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testCurrency();
