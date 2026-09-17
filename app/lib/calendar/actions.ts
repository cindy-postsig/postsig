'use server';

import { createClient } from '@/utils/supabase/server';
import { DatabaseError } from '@/lib/errors';
import logger from '@/utils/pino';

export async function fetchDatesByRange({
  month,
  startDate,
  endDate,
}: {
  month: number;
  startDate: string;
  endDate: string;
}): Promise<any[]> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('contracts')
      .select('term_end_date')
      .gte('term_end_date', '2024-03-01')
      .lte('term_end_date', '2026-03-31');

    if (error) {
      logger.error(error, 'Error fetching contracts by date range');
      throw new DatabaseError(
        'Failed to fetch contracts by date range from Supabase',
        error,
      );
    }

    return data;
  } catch (error) {
    logger.error(error, 'Database Error in calendar actions');
    throw new DatabaseError('Failed to fetch calendar data', error as Error);
  }
}
