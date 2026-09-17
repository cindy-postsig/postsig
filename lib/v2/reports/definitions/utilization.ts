/**
 * Utilization Report Pipeline Definition
 */

import { ReportPipeline, FilterResult } from '../pipeline/types';
import { EnrichedContract } from '@/lib/v2/contracts/service';
import {
  buildUtilizationRow,
  UtilizationReportRow,
} from '../transforms/utilization';
import { sumValuesInUSD } from '@/lib/v2/core/budget';

export const utilizationReport: ReportPipeline<
  Record<string, unknown>,
  undefined,
  UtilizationReportRow
> = {
  filter: (contracts): FilterResult<undefined> => {
    const filtered = contracts.filter((c) => {
      const productSeatsData = c.contract.vendor_products_users || [];
      // Include enterprise-licensed contracts regardless of seat count
      const hasEnterprise = productSeatsData.some(
        (seat: { enterprise?: boolean }) => seat.enterprise === true,
      );
      if (hasEnterprise) return true;
      // Otherwise must have licensed seats
      const totalLicensed = productSeatsData.reduce(
        (sum: number, seat: { number_of_users?: number }) =>
          sum + (seat.number_of_users || 0),
        0,
      );
      return totalLicensed > 0;
    });
    return { contracts: filtered };
  },

  transform: (contracts) => contracts.map(buildUtilizationRow),

  calculateTotal: (rows, valueField) => {
    if (valueField === 'potentialOverage') {
      // Sum potential overages, converting to USD
      return sumValuesInUSD(rows, (row: any) => {
        const valueUSD = row.convertedCurrentBudget || row.currentBudget || 0;
        const licensed = row.seatUsage?.licensed || 0;
        const assigned = row.seatUsage?.assigned || 0;
        if (licensed <= 0) return 0;
        const unusedSeats = Math.max(0, licensed - assigned);
        const valuePerSeat = valueUSD / licensed;
        return unusedSeats * valuePerSeat;
      });
    }
    // Default calculation
    return sumValuesInUSD(rows, (row: any) => row[valueField] || 0);
  },
};
