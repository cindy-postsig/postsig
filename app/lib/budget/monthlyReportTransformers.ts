import { parseISO, startOfDay } from 'date-fns';
import logger from '@/utils/pino';

/**
 * Adjust contracts for monthly report by handling future term dates.
 * If the most recent term_start_date is in the future, use the previous term dates.
 * This ensures the report shows the currently active term, not a future renewal.
 *
 * NOTE: In the JSONB columns, the LATEST date is FIRST (index 0), not last.
 */
export function adjustContractsForMonthlyReport(
  contracts: any[],
  asOf: Date = new Date(),
): any[] {
  const today = startOfDay(asOf);

  return contracts.map((contract) => {
    // Check if we have term_start_date array
    if (!contract.term_start_date || contract.term_start_date.length === 0) {
      return contract;
    }

    // The latest date is FIRST in the array (index 0)
    const mostRecentStartDate = contract.term_start_date[0];

    // Check if the date property exists and is valid
    if (!mostRecentStartDate || !mostRecentStartDate.date) {
      return contract;
    }

    const mostRecentStartDateParsed = startOfDay(
      parseISO(mostRecentStartDate.date),
    );

    // If the most recent start date is in the future, we need to go back in time
    if (
      mostRecentStartDateParsed > today &&
      contract.term_start_date.length > 1
    ) {
      // The previous term is at index 1
      const previousStartDate = contract.term_start_date[1];

      // Check if previous date exists
      if (!previousStartDate || !previousStartDate.date) {
        return contract;
      }

      logger.debug(
        {
          contractId: contract.id,
          vendorName: contract.vendors?.name,
          futureStartDate: mostRecentStartDate.date,
          previousStartDate: previousStartDate.date,
        },
        'Contract has future term start date, using previous term for monthly report',
      );

      // Create a copy of the contract with adjusted dates
      const adjustedContract = { ...contract };

      // Remove the first entry (latest/future date)
      adjustedContract.term_start_date = contract.term_start_date.slice(1);

      // Also adjust term_end_date if it exists
      if (contract.term_end_date && contract.term_end_date.length > 1) {
        // Remove the first entry (latest/future date)
        adjustedContract.term_end_date = contract.term_end_date.slice(1);
      }

      // Also adjust cancel_date if it exists
      if (contract.cancel_date && contract.cancel_date.length > 1) {
        // Remove the first entry (latest/future date)
        adjustedContract.cancel_date = contract.cancel_date.slice(1);
      }

      return adjustedContract;
    }

    // Return original contract if no adjustment needed
    return contract;
  });
}
