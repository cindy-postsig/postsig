import type { UIMessage } from '@ai-sdk/react';

import type { ExcerptData } from '@/lib/v2/chat/client';

interface ToolQueryContractsPart {
  state: string;
  output?: { type?: string; excerpts?: ExcerptData[] };
}

export function extractExcerptsFromMessages(
  messages: UIMessage[],
): ExcerptData[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'assistant') continue;
    for (const part of messages[i].parts) {
      if (part.type !== 'tool-query_clause') continue;
      const toolPart = part as ToolQueryContractsPart;
      if (
        toolPart.state === 'output-available' &&
        toolPart.output?.excerpts?.length
      )
        return toolPart.output.excerpts;
    }
  }
  return [];
}

export function generateSessionTitle(content: string): string {
  const maxLength = 50;
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.substring(0, maxLength).trim() + '...';
}

export interface NavigationAction {
  action: 'navigate';
  path: string;
}

export function parseNavigationAction(
  content: string,
): NavigationAction | null {
  const match = content.match(/\{[^{}]*"action"\s*:\s*"navigate"[^{}]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as NavigationAction;
    if (parsed.action === 'navigate' && typeof parsed.path === 'string')
      return parsed;
    return null;
  } catch {
    return null;
  }
}
