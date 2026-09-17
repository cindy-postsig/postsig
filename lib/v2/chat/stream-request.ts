import { z } from 'zod';
import type { UIMessage } from 'ai';

// Only the newest user turn crosses the wire. History is loaded server-side
// from the session, so the client cannot author system, assistant, or tool
// messages.
const chatStreamBodySchema = z.object({
  sessionId: z.number().int().positive(),
  message: z.object({
    id: z.string().min(1),
    role: z.literal('user'),
    parts: z.array(z.object({ type: z.string() })),
  }),
  context: z.string().optional(),
});

export interface ChatStreamBody {
  sessionId: number;
  message: UIMessage;
  context?: string;
}

export type ChatStreamBodyResult =
  | { ok: true; body: ChatStreamBody }
  | { ok: false; error: string };

// The message shape belongs to the AI SDK, so the original object is returned
// rather than zod's stripped copy.
export function parseChatStreamBody(raw: unknown): ChatStreamBodyResult {
  const result = chatStreamBodySchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return { ok: false, error: `Invalid chat request: ${detail}` };
  }
  return {
    ok: true,
    body: {
      sessionId: result.data.sessionId,
      message: (raw as ChatStreamBody).message,
      context: result.data.context,
    },
  };
}
