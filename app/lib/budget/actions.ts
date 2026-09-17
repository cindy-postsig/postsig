'use server';

import { createClient } from '@/utils/supabase/server';
import { DatabaseError } from '@/lib/errors';
import logger from '@/utils/pino';
import { unstable_noStore as noStore } from 'next/cache';

export async function fetchTotalFees(): Promise<number> {
  const supabase = await createClient();
  noStore();
  try {
    let { data, error } = await supabase
      .from('contracts')
      .select<string, { products_fees: unknown }>('products_fees');

    if (error) throw error;
    const totalFees =
      data?.reduce((acc, row) => {
        const feesArray = row.products_fees as Array<{ fees: string }>;
        const feesSum = feesArray.reduce((sum, product) => {
          const fee = parseFloat(product.fees);
          return sum + (isNaN(fee) ? 0 : fee);
        }, 0);
        return acc + feesSum;
      }, 0) || 0;

    return totalFees;
  } catch (error) {
    logger.error(error, 'Failed to fetch and sum product fees');
    throw new DatabaseError(
      'Failed to fetch and sum product fees from Supabase',
      error as Error,
    );
  }
}
