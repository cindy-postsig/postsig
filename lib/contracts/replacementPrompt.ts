import { sanitizeOrderNumber } from '@/lib/v2/contracts/orderNumber';
import { formatDate } from '@/lib/date-format';

/** One side of a replacement event as the prompt surfaces need it. */
export interface ReplacementContractSummary {
  id: number;
  orderNumber: string | null;
  vendorName: string | null;
  firstProductName: string | null;
  /** Raw ISO date of the contract's term start, if known. */
  startDate: string | null;
}

/**
 * Line-1 copy naming one contract. On the old contract's page it describes
 * the detected replacement; on the replacement's page it describes the old
 * contract proposed for archiving.
 */
export interface ReplacementPromptCopy {
  contractId: number;
  contractNumber: string;
  vendorName: string;
  firstProductName: string | null;
  contractDate: string | null;
}

/**
 * Everything the replacement banner renders and acts on, for one event.
 * The "linked" contract is the event's other side relative to the page the
 * banner renders on — the banner names and links it, never the page itself.
 */
export interface ContractReplacementPrompt {
  eventId: number;
  /** The contract "Yes" archives — the OLD side of the event. */
  oldContractId: number;
  /** Named by id in the copy, and the link target. */
  linkedContractId: number;
  vendorName: string;
  firstProductName: string | null;
  /** Pre-formatted in the org's date format; server-side, so no locale drift. */
  linkedContractDate: string | null;
  /** Pre-formatted end date of the old contract — informational copy only. */
  oldContractEndDate: string | null;
}

/**
 * Whether a list row should carry the replacement hazard flag.
 *
 * Row ids are strings and include vendor-group rows (`"vendor-3"`), which
 * `Number()` turns into NaN — those never match a contract id, so a group row
 * is never flagged.
 */
export function hasReplacementPrompt(
  rowId: string,
  flaggedContractIds: readonly number[] | undefined,
): boolean {
  return (flaggedContractIds ?? []).includes(Number(rowId));
}

/**
 * Label for a contract that has no extracted order number. The "Replaced by"
 * badge names the replacing contract, so it can never render a bare blank —
 * "Contract 412" at least identifies which record to open.
 */
function contractLabel(id: number, orderNumber: string | null): string {
  return orderNumber ?? `Contract ${id}`;
}

/**
 * Shape one side of a replacement event into the banner's line-1 copy fields.
 *
 * Dates are formatted here, server-side, against the viewer's resolved pattern
 * so the rendered string carries no locale dependency into the client bundle.
 */
export function buildReplacementPromptCopy(
  contract: ReplacementContractSummary,
  dateFormat: string,
): ReplacementPromptCopy {
  return {
    contractId: contract.id,
    contractNumber: contractLabel(
      contract.id,
      sanitizeOrderNumber(contract.orderNumber),
    ),
    vendorName: contract.vendorName ?? '',
    firstProductName: contract.firstProductName,
    contractDate: contract.startDate
      ? formatDate(contract.startDate, dateFormat, '')
      : null,
  };
}
