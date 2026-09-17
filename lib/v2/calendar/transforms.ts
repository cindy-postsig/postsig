/**
 * Calendar Transforms
 *
 * Transform calendar data for UI display.
 * Reuses buildContractTableRow for table tabs.
 */

import { ContractWithPricing } from '@/lib/v2/core/types';
import {
  buildContractTableRow,
  buildContractTableRows,
} from '@/lib/v2/contracts/transforms';

// Re-export for calendar table tabs
export { buildContractTableRow, buildContractTableRows };

/** Rows minus products struck by a confirmed cancellation (PSK-1830). */
function withoutRemoved<T>(
  rows: T[],
  removedIds: Set<number> | undefined,
  idOf: (row: T) => unknown,
): T[] {
  if (!removedIds?.size) return rows;
  return rows.filter((row) => {
    const id = idOf(row);
    return !(typeof id === 'number' && removedIds.has(id));
  });
}

function toCalendarEvent(
  contract: ContractWithPricing,
  today: string,
  removedIds: Set<number> | undefined,
) {
  const c = contract.contract;
  const termEndDate = c.term_end_date?.[0]?.date;
  const renewed = termEndDate && termEndDate < today && c.status === 'active';

  // Keep the deadline shown here in step with the contracts table, which
  // falls back to the date inherited from an MSA parent (psk-1855)
  const inherited = contract.inheritedCancelByDate;
  const cancelDate =
    !c.cancel_date?.[0]?.date && inherited
      ? [{ date: inherited.date }]
      : c.cancel_date;

  // Flatten structure to match what CustomCalendar expects
  return {
    id: contract.id,
    vendors: {
      name: contract.vendor_name,
    },
    vendor_id: contract.vendor_id,
    vendor_name: contract.vendor_name,
    vendor_products_details: withoutRemoved(
      c.vendor_products_details || [],
      removedIds,
      (d: any) => d?.vendor_products?.id ?? d?.product_id,
    ),
    term_start_date: c.term_start_date,
    term_end_date: c.term_end_date,
    cancel_date: cancelDate,
    status: c.status,
    status_id: c.status_id,
    contract_status: c.status_id, // For filterContracts compatibility
    renewal_type: c.renewal_type,
    renewed,
    // Include price info
    products: withoutRemoved(
      contract.products ?? [],
      removedIds,
      (p: any) => p?.product_id,
    ),
    priceHistory: contract.priceHistory,
  };
}

/**
 * Add calendar-specific fields to contracts for the calendar widget.
 * Flattens the V2 structure to match what CustomCalendar expects.
 *
 * The calendar is forward-looking, so products struck by a confirmed
 * cancellation declaration (PSK-1830) are EXCLUDED — they will not renew.
 * The contract's event itself stays even if every product is struck; its
 * dates and deadlines remain real.
 */
export function buildCalendarEvents(
  contracts: ContractWithPricing[],
  removedByContract?: Map<number, Set<number>>,
) {
  const today = new Date().toISOString().split('T')[0];

  return contracts.map((contract) =>
    toCalendarEvent(contract, today, removedByContract?.get(contract.id)),
  );
}

export interface CalendarEvent {
  id: number;
  vendors: { name: string };
  vendor_id: number;
  vendor_name: string;
  vendor_products_details: any[];
  term_start_date: any[];
  term_end_date: any[];
  cancel_date: any[];
  status: string;
  status_id: number;
  contract_status: number;
  renewal_type: string;
  renewed: boolean;
  products: any[];
  priceHistory: any;
}
