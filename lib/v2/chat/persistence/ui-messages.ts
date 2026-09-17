import type { UIMessage } from 'ai';
import type {
  ChatMessage,
  ChatMessageMetadata,
  SerializedToolPart,
} from './types';

export function getTextFromMessage(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text',
    )
    .map((part) => part.text)
    .filter((t) => t.trim())
    .join('\n\n');
}

export function extractToolPartsFromMessage(
  message: UIMessage,
): SerializedToolPart[] {
  const toolParts: SerializedToolPart[] = [];

  for (const part of message.parts) {
    if (!part.type.startsWith('tool-')) continue;

    // AI SDK v6 puts the tool call arguments on `input`; earlier versions
    // used `args`. Read both so we don't silently drop inputs on save.
    const toolPart = part as {
      type: string;
      state: string;
      toolCallId?: string;
      toolName?: string;
      args?: Record<string, unknown>;
      input?: Record<string, unknown>;
      output?: unknown;
    };

    // Persist only completed tool outputs.
    if (toolPart.state !== 'output-available') continue;

    toolParts.push({
      type: toolPart.type,
      state: toolPart.state,
      toolCallId: toolPart.toolCallId,
      toolName: toolPart.toolName,
      args: toolPart.args ?? toolPart.input,
      output: toolPart.output,
    });
  }

  return toolParts;
}

export function reconstructMessageParts(
  content: string,
  metadata: ChatMessageMetadata | null,
): UIMessage['parts'] {
  const parts: UIMessage['parts'] = [];

  if (content) {
    parts.push({ type: 'text' as const, text: content });
  }

  if (metadata?.toolParts) {
    for (const toolPart of metadata.toolParts) {
      parts.push({
        type: toolPart.type,
        state: toolPart.state,
        toolCallId: toolPart.toolCallId,
        toolName: toolPart.toolName,
        args: toolPart.args,
        output: toolPart.output,
      } as UIMessage['parts'][number]);
    }
  }

  if (parts.length === 0) {
    parts.push({ type: 'text' as const, text: '' });
  }

  return parts;
}

export function toUIMessage(message: ChatMessage): UIMessage {
  return {
    id: String(message.id),
    role: message.role,
    parts: reconstructMessageParts(message.content, message.metadata),
  };
}
