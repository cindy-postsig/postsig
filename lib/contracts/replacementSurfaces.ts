import {
  fetchConfirmedEventForOldContract,
  fetchReplacementContractSummary,
  fetchVerifiedEventsForContracts,
  fetchVerifiedEventsForNewContract,
} from '@/data/superuser/contractReplacementResolution';
import {
  buildReplacementPromptCopy,
  type ContractReplacementPrompt,
  type ReplacementPromptCopy,
} from '@/lib/contracts/replacementPrompt';
import { formatDate } from '@/lib/date-format';
import { logAlert } from '@/utils/logging/alert';

export interface ContractReplacementSurfaces {
  /** Unanswered prompt where this page's contract is the OLD side, or null. */
  prompt: ContractReplacementPrompt | null;
  /** Persistent flag once the user confirmed the replacement, or null. */
  replacedBy: { newContractId: number; newContractNumber: string } | null;
  /** Unanswered prompts where this page's contract is the NEW side — one per old contract. */
  promptsAsReplacement: Array<
    ContractReplacementPrompt & { oldContractVendorName: string }
  >;
}

interface SurfaceScope {
  contractId: number;
  organizationId: string;
  dateFormat: string;
}

/** Copy for the contract an event points at, or null when it is unreadable. */
async function copyForContract(
  contractId: number,
  { organizationId, dateFormat }: SurfaceScope,
): Promise<ReplacementPromptCopy | null> {
  const summary = await fetchReplacementContractSummary({
    contractId,
    organizationId,
  });
  return summary ? buildReplacementPromptCopy(summary, dateFormat) : null;
}

function formatEndDate(
  endDate: string | null | undefined,
  dateFormat: string,
): string | null {
  return endDate ? formatDate(endDate, dateFormat, '') : null;
}

function toPrompt(
  copy: ReplacementPromptCopy,
  extras: {
    eventId: number;
    oldContractId: number;
    oldContractEndDate: string | null;
  },
): ContractReplacementPrompt {
  return {
    ...extras,
    linkedContractId: copy.contractId,
    vendorName: copy.vendorName,
    firstProductName: copy.firstProductName,
    linkedContractDate: copy.contractDate,
  };
}

/**
 * Prompt banner for a `verified` event awaiting the user's answer. `pending`
 * has not passed extractor screening and `rejected` is suppressed forever, so
 * neither reaches the fetch this reads.
 */
async function resolvePrompt(
  scope: SurfaceScope,
): Promise<ContractReplacementSurfaces['prompt']> {
  const [event] = await fetchVerifiedEventsForContracts({
    organizationId: scope.organizationId,
    contractIds: [scope.contractId],
  });
  if (!event) return null;

  // The page contract is the old side; its own summary carries the end date
  // the "Archive this older contract on …?" line names.
  const [copy, ownSummary] = await Promise.all([
    copyForContract(event.new_contract_id, scope),
    fetchReplacementContractSummary({
      contractId: scope.contractId,
      organizationId: scope.organizationId,
    }),
  ]);
  if (!copy) return null;

  return toPrompt(copy, {
    eventId: event.id,
    oldContractId: scope.contractId,
    oldContractEndDate: formatEndDate(ownSummary?.endDate, scope.dateFormat),
  });
}

/**
 * Prompt banners for `verified` events naming this page's contract as the
 * replacement — the same question, asked from the other side. Line 1 names
 * the OLD contract each event proposes to archive. An unreadable old contract
 * skips its entry rather than failing the rest.
 */
async function resolvePromptsAsReplacement(
  scope: SurfaceScope,
): Promise<ContractReplacementSurfaces['promptsAsReplacement']> {
  const events = await fetchVerifiedEventsForNewContract({
    organizationId: scope.organizationId,
    contractId: scope.contractId,
  });

  const entries = await Promise.all(
    events.map(async (event) => {
      const oldSummary = await fetchReplacementContractSummary({
        contractId: event.old_contract_id,
        organizationId: scope.organizationId,
      });
      if (!oldSummary) return null;

      const copy = buildReplacementPromptCopy(oldSummary, scope.dateFormat);
      return {
        ...toPrompt(copy, {
          eventId: event.id,
          oldContractId: event.old_contract_id,
          oldContractEndDate: formatEndDate(
            oldSummary.endDate,
            scope.dateFormat,
          ),
        }),
        oldContractVendorName: oldSummary.vendorName ?? 'this',
      };
    }),
  );

  return entries.filter((entry) => entry !== null);
}

/** Persistent "Replaced by" flag for a `confirmed` event. */
async function resolveReplacedBy(
  scope: SurfaceScope,
): Promise<ContractReplacementSurfaces['replacedBy']> {
  const event = await fetchConfirmedEventForOldContract({
    organizationId: scope.organizationId,
    contractId: scope.contractId,
  });
  if (!event) return null;

  const copy = await copyForContract(event.new_contract_id, scope);
  return copy
    ? {
        newContractId: copy.contractId,
        newContractNumber: copy.contractNumber,
      }
    : null;
}

/**
 * Resolve the replacement surfaces for one contract detail page.
 * The surfaces are independent — a contract can carry a confirmed replacement
 * and later be proposed as replaced again, or itself be the proposed
 * replacement for others — so all are always resolved.
 *
 * A failure degrades to rendering nothing rather than failing the contract
 * page, and pages a monitor: a silently missing prompt is not something a user
 * can notice from the rendered page.
 */
export async function resolveContractReplacementSurfaces(
  scope: SurfaceScope,
): Promise<ContractReplacementSurfaces> {
  try {
    const [prompt, replacedBy, promptsAsReplacement] = await Promise.all([
      resolvePrompt(scope),
      resolveReplacedBy(scope),
      resolvePromptsAsReplacement(scope),
    ]);
    return { prompt, replacedBy, promptsAsReplacement };
  } catch (error) {
    logAlert(
      'contract-replacement-fetch-failure',
      error,
      { contractId: scope.contractId, organizationId: scope.organizationId },
      'Failed to resolve contract replacement surfaces',
    );
    return { prompt: null, replacedBy: null, promptsAsReplacement: [] };
  }
}
