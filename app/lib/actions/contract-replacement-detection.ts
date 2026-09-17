import { processWithGemini } from '@/lib/google';
import { createPromptResolver } from '@/app/lib/prompt-resolver';
import { fetchAllRelationshipsForOrg } from '@/data/superuser/contracts';
import { expandVendorLineageIds } from '@/data/superuser/vendors';
import {
  createPendingReplacementEvent,
  fetchActiveContractsForVendors,
  fetchContractForReplacement,
  fetchExistingEventOldContractIds,
  ReplacementContractRow,
} from '@/data/superuser/contractReplacementDetection';
import {
  findReplacementCandidates,
  ReplacementCandidate,
} from '@/lib/contracts/replacementCandidates';
import { reverseContractTypeMap } from '@/app/lib/constants';
import { sendContractReplacementEmail } from '@/app/lib/emails/contract-replacement';
import { logError } from '@/utils/log-sanitization';
import { logAlert } from '@/utils/logging/alert';
import { Json } from '@/database.types';
import { prompts } from '@postsig/toolkit';
import _ from 'lodash';
import { PromptQuery } from '@/app/lib/prompt-resolver/types';
import { SchemaType } from '@google/generative-ai';

/** The toolkit prompt that adjudicates one candidate pair. */
const PROMPT_FIELD = 'contract_replacement_check';

interface StepLogger {
  info(payload: Record<string, unknown>): void;
  warn(payload: Record<string, unknown>): void;
  error(payload: Record<string, unknown>): void;
}

/**
 * Contract ids sharing a lineage chain with `contractId` — everything reachable
 * over `contract_relationships` edges, in either direction, including itself.
 *
 * A contract's own amendments are normal lineage, not replacements, so the
 * whole connected component is excluded from candidacy.
 */
export function collectChainContractIds(
  contractId: number,
  relationships: Array<{
    parent_contract_id: number | null;
    child_contract_id: number | null;
  }>,
): Set<number> {
  const adjacency = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    const existing = adjacency.get(a);
    if (existing) existing.push(b);
    else adjacency.set(a, [b]);
  };

  relationships.forEach((rel) => {
    const parent = rel.parent_contract_id;
    const child = rel.child_contract_id;
    if (parent == null || child == null) return;
    link(parent, child);
    link(child, parent);
  });

  const reachable = new Set<number>([contractId]);
  const stack = [contractId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const next of adjacency.get(id) ?? []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      stack.push(next);
    }
  }
  return reachable;
}

/** Structured fields of one contract, as the pair-check prompt reads them. */
const describeContract = (
  label: string,
  contract: ReplacementContractRow,
): string =>
  [
    `${label}:`,
    `  contract id: ${contract.id}`,
    `  type: ${reverseContractTypeMap[contract.type_id ?? -1] ?? 'Unknown'}`,
    `  order number: ${contract.metadata ? _.get(contract.metadata, 'lineage.order_number', 'none') : 'none'}`,
    `  lineage phrases: ${contract.metadata ? _.get(contract.metadata, 'lineage.lineage_phrases', 'none') : 'none'}`,
    `  term start: ${JSON.stringify(contract.term_start_date)}`,
    `  term end: ${JSON.stringify(contract.term_end_date)}`,
    `  products: ${contract.productNames.join(', ') || 'none'}`,
  ].join('\n');

/**
 * The text handed to Gemini alongside the resolved prompt. Text-only — unlike
 * every other extraction call, there is no single document to attach, because
 * the question spans two contracts.
 */
export function buildPairCheckPrompt(
  newContract: ReplacementContractRow,
  oldContract: ReplacementContractRow,
  candidate: ReplacementCandidate,
): string {
  return [
    describeContract('NEW CONTRACT', newContract),
    '',
    describeContract('OLD CONTRACT', oldContract),
    '',
    `Days from the old contract's end to the new contract's start: ${candidate.dateDeltaDays}`,
  ].join('\n');
}

/** Gemini's answer, once validated. Anything else is treated as "no answer". */
interface PairCheckResult {
  isReplacement: boolean;
  evidence: string[];
}

/**
 * Read a pair-check verdict out of Gemini's response.
 *
 * Returns null for any shape that cannot be trusted — a missing field, a
 * non-boolean verdict, a null payload. Precision beats recall: an unreadable
 * answer must never be rounded up into a customer-facing prompt.
 */
export function parsePairCheckResult(data: unknown): PairCheckResult | null {
  if (!data || typeof data !== 'object') return null;

  const { is_replacement: isReplacement, evidence } = data as Record<
    string,
    unknown
  >;
  if (typeof isReplacement !== 'boolean') return null;

  return {
    isReplacement,
    evidence: Array.isArray(evidence)
      ? evidence.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

/** The response schema `processWithGemini` builds its structured output from. */
const PAIR_CHECK_QUERIES = [
  {
    dbName: 'is_replacement',
    type: 'boolean',
    description:
      'True only if the new contract replaces the old one on new paper.',
  },
  {
    dbName: 'evidence',
    type: 'array',
    items: { type: 'string' },
    description: 'Verbatim quotes supporting the verdict.',
  },
];

/**
 * Resolve the pair-check prompt, or null when it is not published yet.
 *
 * The toolkit prompt ships on its own release cadence (separate repo), so its
 * absence is the expected steady state until then — detection simply no-ops
 * rather than guessing with an ad-hoc prompt.
 */
async function resolvePairCheckPrompt(
  logger: StepLogger,
): Promise<string | null> {
  try {
    const fallbackQuery = _.find(prompts.additionalQueries, {
      dbName: PROMPT_FIELD,
    });
    const resolver = await createPromptResolver();
    const { content } = await resolver.resolvePrompt({
      fieldName: PROMPT_FIELD,
      fallbackPrompt: fallbackQuery as PromptQuery,
    });
    return typeof content === 'string' && content.trim() !== ''
      ? content
      : null;
  } catch (error) {
    logger.warn({
      promptField: PROMPT_FIELD,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Replacement check prompt unavailable; skipping detection',
    });
    return null;
  }
}

/** Ask Gemini about one pair; null on any unusable answer. */
async function checkPair({
  systemPrompt,
  newContract,
  oldContract,
  candidate,
  logger,
}: {
  systemPrompt: string;
  newContract: ReplacementContractRow;
  oldContract: ReplacementContractRow;
  candidate: ReplacementCandidate;
  logger: StepLogger;
}): Promise<PairCheckResult | null> {
  try {
    const { data } = await processWithGemini(
      undefined,
      PAIR_CHECK_QUERIES,
      `${systemPrompt}\n\n${buildPairCheckPrompt(newContract, oldContract, candidate)}`,
    );
    const parsed = parsePairCheckResult(data);
    if (!parsed) {
      logger.warn({
        newContractId: newContract.id,
        oldContractId: oldContract.id,
        message: 'Unreadable replacement check response; skipping pair',
      });
    }
    return parsed;
  } catch (error) {
    // One bad pair must not cost the others their check.
    logger.warn({
      newContractId: newContract.id,
      oldContractId: oldContract.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/** Stage 1: the same-vendor contracts this one might be replacing. */
async function findCandidates({
  newContract,
  organizationId,
  vendorId,
}: {
  newContract: ReplacementContractRow;
  organizationId: string;
  vendorId: number;
}): Promise<{
  candidates: ReplacementCandidate[];
  oldContracts: ReplacementContractRow[];
}> {
  const vendorIds = await expandVendorLineageIds(vendorId);

  const [oldContracts, relationships, existingEventOldContractIds] =
    await Promise.all([
      fetchActiveContractsForVendors({
        vendorIds,
        organizationId,
        excludeContractId: newContract.id,
      }),
      fetchAllRelationshipsForOrg(organizationId),
      fetchExistingEventOldContractIds({
        newContractId: newContract.id,
        organizationId,
      }),
    ]);

  const candidates = findReplacementCandidates({
    newContract: {
      contractId: newContract.id,
      typeId: newContract.type_id,
      termStartDate: newContract.term_start_date,
      productNames: newContract.productNames,
    },
    oldContracts: oldContracts.map((old) => ({
      contractId: old.id,
      typeId: old.type_id,
      termEndDate: old.term_end_date,
      productNames: old.productNames,
      status: old.status,
    })),
    chainContractIds: collectChainContractIds(newContract.id, relationships),
    existingEventOldContractIds: new Set(existingEventOldContractIds),
  });

  return { candidates, oldContracts };
}

/**
 * Tell the extractors a pending event was raised.
 *
 * Never rethrows: the event row is already written, and this step runs under
 * Inngest retries, so letting a mail failure bubble would re-run the LLM check
 * and re-send on the next attempt. The alert keeps a dropped notification
 * visible instead.
 */
async function notifyReplacementDetected({
  eventId,
  newContract,
  oldContract,
  candidate,
  evidence,
  organizationId,
  logger,
}: {
  eventId: number;
  newContract: ReplacementContractRow;
  oldContract: ReplacementContractRow;
  candidate: ReplacementCandidate;
  evidence: string[];
  organizationId: string;
  logger: StepLogger;
}): Promise<void> {
  try {
    await sendContractReplacementEmail({
      eventId,
      oldContract,
      newContract,
      dateDeltaDays: candidate.dateDeltaDays,
      evidence,
      organizationId,
    });
  } catch (error) {
    logAlert(
      'contract-replacement-email-failure',
      error,
      { eventId, organizationId, newContractId: newContract.id },
      'Failed to send contract replacement email',
    );
    logger.warn({
      eventId,
      organizationId,
      message: 'Contract replacement email not sent',
    });
  }
}

/**
 * Check one candidate pair and write a pending event if it holds up.
 *
 * @returns whether a new row was written (false covers both "not a
 *   replacement" and the retry case where the row already existed).
 */
async function screenOneCandidate({
  candidate,
  newContract,
  oldContract,
  systemPrompt,
  organizationId,
  logger,
}: {
  candidate: ReplacementCandidate;
  newContract: ReplacementContractRow;
  oldContract: ReplacementContractRow;
  systemPrompt: string;
  organizationId: string;
  logger: StepLogger;
}): Promise<boolean> {
  const result = await checkPair({
    systemPrompt,
    newContract,
    oldContract,
    candidate,
    logger,
  });
  if (!result?.isReplacement) return false;

  const evidence: Json = {
    date_delta_days: candidate.dateDeltaDays,
    llm_evidence: result.evidence,
  };

  const { created, eventId } = await createPendingReplacementEvent({
    oldContractId: candidate.oldContractId,
    newContractId: newContract.id,
    organizationId,
    evidence,
  });

  if (created && eventId !== null) {
    await notifyReplacementDetected({
      eventId,
      newContract,
      oldContract,
      candidate,
      evidence: result.evidence,
      organizationId,
      logger,
    });
  }

  return created;
}

/** Stage 2: run the LLM check over each candidate and write the yeses. */
async function screenCandidates({
  candidates,
  newContract,
  oldById,
  systemPrompt,
  organizationId,
  logger,
}: {
  candidates: ReplacementCandidate[];
  newContract: ReplacementContractRow;
  oldById: Map<number, ReplacementContractRow>;
  systemPrompt: string;
  organizationId: string;
  logger: StepLogger;
}): Promise<void> {
  let created = 0;

  // Sequential on purpose: one LLM call per candidate, and the candidate set is
  // already tightly filtered, so there is nothing to gain from fanning out.
  for (const candidate of candidates) {
    const oldContract = oldById.get(candidate.oldContractId);
    if (!oldContract) continue;

    const wrote = await screenOneCandidate({
      candidate,
      newContract,
      oldContract,
      systemPrompt,
      organizationId,
      logger,
    });
    if (wrote) created += 1;
  }

  // Counts only: evidence entries are verbatim contract quotes.
  logger.info({
    contractId: newContract.id,
    organizationId,
    candidateCount: candidates.length,
    createdCount: created,
  });
}

/**
 * Report a detection failure without rethrowing.
 *
 * Swallowing keeps extraction alive; the alert keeps the drop visible, since a
 * missed detection leaves the customer un-prompted with nothing to notice it by.
 */
function reportDetectionFailure(
  error: unknown,
  context: { contractId: number; userId: string; organizationId: string },
  logger: StepLogger,
): void {
  logError(logger, error, {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  });
  logAlert(
    'contract-replacement-detection-failure',
    error,
    { processName: 'processContractReplacementDetection', ...context },
    'Failed to detect contract replacement',
  );
}

/**
 * Detect whether a newly extracted contract replaces an existing one.
 *
 * Resolves nothing and writes nothing when there are no candidates, so the
 * common case costs no prompt lookup and no LLM call.
 */
export async function processContractReplacementDetection({
  contractId,
  userId,
  logger,
  organizationId,
}: {
  contractId: number;
  userId: string;
  logger: StepLogger;
  organizationId: string;
}): Promise<void> {
  try {
    const newContract = await fetchContractForReplacement({
      contractId,
      organizationId,
    });
    // An unvendored contract has no peers to compare against.
    if (!newContract?.vendor_id) return;

    const { candidates, oldContracts } = await findCandidates({
      newContract,
      organizationId,
      vendorId: newContract.vendor_id,
    });
    if (candidates.length === 0) return;

    const systemPrompt = await resolvePairCheckPrompt(logger);
    if (!systemPrompt) return;

    await screenCandidates({
      candidates,
      newContract,
      oldById: new Map(oldContracts.map((old) => [old.id, old])),
      systemPrompt,
      organizationId,
      logger,
    });
  } catch (error) {
    reportDetectionFailure(
      error,
      { contractId, userId, organizationId },
      logger,
    );
  }
}
