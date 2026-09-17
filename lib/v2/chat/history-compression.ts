/**
 * History Compression - Public API
 *
 * Strips large tool result outputs from conversation history messages before
 * sending them to the LLM. Older tool results are replaced with compact
 * summaries of the form `"[Tool: {toolName} -> {brief result}]"` while recent
 * messages are kept intact for context continuity.
 *
 * Summary extraction per tool type:
 *   - calculate_spend:          vendor name + TCV amount + contract count
 *   - query_contracts:          query type + result count (search: vendor + IDs, list: count)
 *   - summarize_payment_terms:  vendor name + term count
 *   - get_groups:               group count
 *   - query_tags:               tag names + count
 *   - get_current_date:         date string (already small, passed through)
 *
 * The full tool output is preserved in `chat_messages.metadata` for UI
 * reconstruction; only the LLM-sent version is compressed.
 */

import type { ModelMessage } from 'ai';
import { compressHistoryMessages } from '@/lib/v2/chat/history/compress-messages';

/**
 * Number of trailing messages to keep uncompressed.
 *
 * We preserve the last 4 messages (roughly the last 2 assistant turns
 * including their tool-result predecessors) so the model has full context
 * for the most recent exchange.
 */
const RECENT_MESSAGES_TO_KEEP = 6;

/**
 * Replace verbose tool-result parts in older conversation history with
 * compact summaries before sending messages to `streamText()`.
 *
 * Messages within the last two assistant turns are left untouched so the
 * model retains precise context for the current exchange.
 *
 * @param messages - Full conversation history as ModelMessages
 * @returns A new array with older tool results replaced by summaries
 */
export function compressToolResults(messages: ModelMessage[]): ModelMessage[] {
  return compressHistoryMessages(messages, RECENT_MESSAGES_TO_KEEP);
}
