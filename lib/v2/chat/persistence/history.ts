import type { ChatMessage } from './types';

// A retried send carries the same client message id, so the turn stored by the
// first attempt is reused instead of being persisted twice.
export function partitionStoredTurn(
  stored: ChatMessage[],
  clientMessageId: string,
): { history: ChatMessage[]; alreadyStored: boolean } {
  const history = stored.filter(
    (message) => message.metadata?.clientMessageId !== clientMessageId,
  );
  return { history, alreadyStored: history.length !== stored.length };
}
