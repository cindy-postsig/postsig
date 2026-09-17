/**
 * Chat Stream Handler — MCP-tool-powered assistant.
 *
 * Wires the AI SDK to the MCP tools registered in app/lib/mcp/tools via the
 * mcp-adapter. Per-tool guidance lives in each tool's description rather
 * than the system prompt.
 */

import { Context } from 'hono';
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
  type ModelMessage,
  wrapLanguageModel,
  smoothStream,
  consumeStream,
} from 'ai';
import { createVertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { ROUTE_DEFINITIONS } from '@/lib/config/routes';
import {
  buildSystemPrompt,
  validateChatContext,
  isExecutionError,
} from '@/lib/v2/chat';
import {
  buildChatTokenId,
  getMcpToolsForChat,
} from '@/lib/v2/chat/mcp-adapter';
import { parseChatStreamBody } from '@/lib/v2/chat/stream-request';
import {
  getChatMessages,
  getChatSession,
  partitionStoredTurn,
  saveAssistantMessage,
  saveChatMessage,
  toUIMessage,
} from '@/lib/v2/chat/persistence';
import logger from '@/utils/pino';
import { logSanitizedChatQuery } from '@/lib/v2/chat/query-log/service';
import type { UserMetadata } from '@/constants/types';
import {
  truncateMessagesToTokenLimit,
  estimateTokens,
  estimateMessageTokens,
} from '@/lib/v2/chat/tools/utils';
import { compressHistoryMessages } from '@/lib/v2/chat/history/compress-messages';
import { buildConversationSummary } from '@/lib/v2/chat/history/summarize-conversation';
import { vertexToGoogleProviderOptionsMiddleware } from '@/lib/v2/chat/tools/models';
import {
  handleNavigationQuery,
  classifyQuery,
  type QueryClassification,
} from '@/lib/v2/chat/routing';

const MAX_INPUT_TOKENS = 250_000;
const MESSAGE_COUNT_THRESHOLD = 20;
const RECENT_MESSAGES_KEEP = 16;
const MAX_RETRIES = 3;

const MAX_TOKENS_SIMPLE = 3000;
const MAX_TOKENS_COMPLEX = 12000;
// Step caps matched to the production assistant. MCP tools usually answer in
// one or two hops, but legitimate multi-tool flows (compare two vendors, an
// overview plus its DORA gaps) need headroom — so these are a runaway guard,
// not a tuning target.
const MAX_STEPS_SIMPLE = 20;
const MAX_STEPS_COMPLEX = 50;

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('resource_exhausted') ||
      message.includes('resource exhausted') ||
      message.includes('rate limit') ||
      message.includes('quota exceeded') ||
      message.includes('too many requests') ||
      message.includes('429')
    );
  }
  return false;
}

const MODEL_ID = process.env.GOOGLE_VERTEX_MODEL_ID || 'claude-sonnet-4-6';
const credentialsBuffer = process.env.GOOGLE_APPLICATION_CREDENTIALS;

function buildAiNotConfiguredResponse(c: Context) {
  return c.json(
    {
      error: 'AI Service not configured.',
      details:
        'Google Vertex AI client failed to initialize. Check credentials.',
    },
    500,
  );
}

function buildStreamChatErrorResponse(c: Context, error: unknown) {
  logger.error({ error }, '[CHAT_API_ERROR]');
  let errorMessage = 'An unexpected error occurred.';
  let isRateLimited = false;

  if (error instanceof Error) {
    errorMessage = error.message;
    isRateLimited = isRetryableError(error);
  }

  if (
    !credentialsBuffer &&
    (error as Error)?.message?.includes('Could not load credentials')
  ) {
    errorMessage =
      'AI Service credentials are not configured. Please contact support.';
  }

  if (isRateLimited) {
    return c.json(
      {
        error: 'AI service is temporarily busy.',
        details:
          'The AI service is experiencing high demand. Please try again in a moment.',
        isRetryable: true,
      },
      429,
    );
  }

  return c.json(
    {
      error: 'Failed to process chat message.',
      details: errorMessage,
      isRetryable: false,
    },
    500,
  );
}

function extractUserText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ')
    .trim();
}

function buildRouteListForPrompt(): string {
  return ROUTE_DEFINITIONS.map(
    (r) => `  - Path: ${r.path}, Description: ${r.description}`,
  ).join('\n');
}

const GREETING_RESPONSE = [
  "Hi! I'm your contract management assistant. Here are a few things I can help with:\n\n",
  '- **Spend analysis** — "How much are we spending on AWS?"\n',
  '- **Contract search** — "Find all contracts expiring this quarter"\n',
  '- **Compliance checks** — "Show me our DORA compliance status"\n\n',
  'What would you like to explore?',
].join('');

function buildStaticStreamResponse(text: string) {
  const partId = crypto.randomUUID();
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'start-step' });
      writer.write({ type: 'text-start', id: partId });
      writer.write({ type: 'text-delta', id: partId, delta: text });
      writer.write({ type: 'text-end', id: partId });
      writer.write({ type: 'finish-step' });
      writer.write({ type: 'finish', finishReason: 'stop' });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

async function respondWithoutModel(sessionId: number, text: string) {
  await saveChatMessage({ sessionId, role: 'assistant', content: text });
  return buildStaticStreamResponse(text);
}

function buildNavigationText(path: string, label: string): string {
  logger.info(
    { path, label },
    '[CHAT_NAVIGATION] Resolved navigation query without LLM',
  );
  return JSON.stringify({ action: 'navigate', path });
}

function injectContextIntoLastUserMessage(
  messages: ModelMessage[],
  context: string,
): ModelMessage[] {
  if (!context || messages.length === 0) return messages;
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role !== 'user') return messages;

  const prefix = `Context: "${context}"\n\nUser query: `;
  if (typeof lastMessage.content === 'string') {
    lastMessage.content = prefix + lastMessage.content;
    return messages;
  }

  if (!Array.isArray(lastMessage.content)) return messages;
  const textPart = lastMessage.content.find(
    (part): part is { type: 'text'; text: string } => part.type === 'text',
  );
  if (textPart) textPart.text = prefix + textPart.text;
  return messages;
}

/**
 * Drop tool parts that the AI SDK marked incomplete on a prior turn. A tool
 * part with state other than `output-available` may be missing `input` (e.g.
 * a stream that was cancelled mid-call, or a model-emitted empty-input
 * tool_use). When such a part round-trips through the next request, the
 * Anthropic API rejects the assistant message with
 * `messages.X.content.Y.tool_use.input: Field required`.
 */
function sanitizeIncompleteToolParts(messages: UIMessage[]): UIMessage[] {
  return messages.map((msg) => {
    if (!Array.isArray(msg.parts)) return msg;
    const parts = msg.parts.filter((part) => {
      if (!('type' in part) || typeof part.type !== 'string') return true;
      if (!part.type.startsWith('tool-')) return true;
      const tp = part as { state?: string; input?: unknown };
      const hasInput =
        tp.input !== undefined && tp.input !== null && tp.input !== '';
      return tp.state === 'output-available' && hasInput;
    });
    return { ...msg, parts };
  });
}

async function buildModelMessages(
  uiMessages: UIMessage[],
  context?: string,
): Promise<ModelMessage[]> {
  const safeMessages = sanitizeIncompleteToolParts(uiMessages);
  const rawModelMessages = await convertToModelMessages(safeMessages);
  const modelMessages = compressHistoryMessages(rawModelMessages);
  return context
    ? injectContextIntoLastUserMessage(modelMessages, context)
    : modelMessages;
}

function applyTokenLimits(
  modelMessages: ModelMessage[],
  systemPromptTokens: number,
): ModelMessage[] {
  const tokenLimitedMessages = truncateMessagesToTokenLimit(
    modelMessages,
    systemPromptTokens,
    MAX_INPUT_TOKENS,
  );

  const summaryAwareMessages =
    tokenLimitedMessages.length > MESSAGE_COUNT_THRESHOLD
      ? [
          buildConversationSummary(
            tokenLimitedMessages.slice(0, -RECENT_MESSAGES_KEEP),
          ),
          ...tokenLimitedMessages.slice(-RECENT_MESSAGES_KEEP),
        ]
      : tokenLimitedMessages;

  return truncateMessagesToTokenLimit(
    summaryAwareMessages,
    systemPromptTokens,
    MAX_INPUT_TOKENS,
  );
}

function getMaxTokensForClassification(classification: QueryClassification): {
  maxTokens: number;
  maxSteps: number;
} {
  if (classification === 'complex') {
    return { maxTokens: MAX_TOKENS_COMPLEX, maxSteps: MAX_STEPS_COMPLEX };
  }
  return { maxTokens: MAX_TOKENS_SIMPLE, maxSteps: MAX_STEPS_SIMPLE };
}

function logTokenEstimate(args: {
  systemPromptTokens: number;
  messageTokens: number;
  messageCount: number;
}) {
  logger.debug(
    {
      systemPromptTokens: args.systemPromptTokens,
      messageTokens: args.messageTokens,
      totalEstimatedTokens: args.systemPromptTokens + args.messageTokens,
      messageCount: args.messageCount,
    },
    '[CHAT_TOKEN_ESTIMATE] Input token estimate',
  );
}

function onStreamError({ error }: { error: unknown }) {
  const isRateLimited = isRetryableError(error);
  logger.error(
    { error, isRateLimited },
    isRateLimited ? '[CHAT_API_RATE_LIMITED]' : '[CHAT_API_ERROR]',
  );
}

function startStreamText(args: {
  googleClient: ReturnType<typeof createVertexAnthropic>;
  systemPrompt: string;
  messages: ModelMessage[];
  userMetadata: UserMetadata;
  maxTokens: number;
  maxSteps: number;
}) {
  const tokenId = buildChatTokenId(args.userMetadata);
  return streamText({
    maxRetries: MAX_RETRIES,
    onError: onStreamError,
    model: wrapLanguageModel({
      model: args.googleClient(MODEL_ID),
      middleware: [vertexToGoogleProviderOptionsMiddleware()] as any,
    }),
    messages: args.messages,
    system: args.systemPrompt,
    allowSystemInMessages: false,
    tools: getMcpToolsForChat(args.userMetadata, tokenId),
    maxOutputTokens: args.maxTokens,
    temperature: 0.2,
    stopWhen: stepCountIs(args.maxSteps),
    experimental_transform: smoothStream({ delayInMs: 25, chunking: 'word' }),
    async onStepFinish(event) {
      const failedTools = event.toolResults
        ?.filter((tr) => isExecutionError(tr.output))
        .map((tr) => ({
          toolName: tr.toolName,
          error: (tr.output as { error: string }).error,
        }));

      if (failedTools && failedTools.length > 0) {
        logger.warn(
          {
            failedTools,
            userId: args.userMetadata.userId,
          },
          '[CHAT_TOOL_EXECUTION_ERROR]',
        );
      }

      logger.info(
        {
          finishReason: event.finishReason,
          toolsCalled: event.toolCalls?.map((tc) => tc.toolName) ?? [],
          tokenUsage: event.usage,
        },
        '[CHAT_MULTI_STEP]',
      );
    },
    async onFinish(event) {
      logger.debug(
        {
          finishReason: event.finishReason,
          usage: event.usage,
        },
        '[CHAT_API_ON_FINISH]',
      );
    },
  });
}

async function handleStreamChatRequest(
  c: Context,
  googleClient: ReturnType<typeof createVertexAnthropic>,
) {
  const userMetadata = c.get('userMetadata');
  const validation = validateChatContext(userMetadata);
  if (!validation.valid) return c.json({ error: validation.error }, 400);

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid chat request: body must be JSON' }, 400);
  }
  const parsed = parseChatStreamBody(rawBody);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const body = parsed.body;

  const session = await getChatSession(body.sessionId);
  if (!session) return c.json({ error: 'Chat session not found' }, 404);

  const userText = extractUserText(body.message);
  const { messages: storedMessages } = await getChatMessages(body.sessionId);
  const { history, alreadyStored } = partitionStoredTurn(
    storedMessages,
    body.message.id,
  );
  if (!alreadyStored) {
    await saveChatMessage({
      sessionId: body.sessionId,
      role: 'user',
      content: userText,
      metadata: { clientMessageId: body.message.id },
    });
  }
  const messages = [...history.map(toUIMessage), body.message];

  const navResponse = handleNavigationQuery(userText);
  if (navResponse) {
    return respondWithoutModel(
      body.sessionId,
      buildNavigationText(navResponse.path, navResponse.label),
    );
  }

  const queryClassification = classifyQuery(userText);

  if (queryClassification === 'greeting') {
    logger.info(
      { userId: (userMetadata as UserMetadata)?.userId },
      '[CHAT_GREETING] Resolved greeting without LLM',
    );
    return respondWithoutModel(body.sessionId, GREETING_RESPONSE);
  }

  const { maxTokens, maxSteps } =
    getMaxTokensForClassification(queryClassification);
  const systemPrompt = buildSystemPrompt(
    buildRouteListForPrompt(),
    (userMetadata as UserMetadata).baseCurrency,
  );
  const modelMessages = await buildModelMessages(messages, body.context);
  const systemPromptTokens = estimateTokens(systemPrompt);
  const recentMessages = applyTokenLimits(modelMessages, systemPromptTokens);

  logTokenEstimate({
    systemPromptTokens,
    messageTokens: estimateMessageTokens(recentMessages),
    messageCount: recentMessages.length,
  });
  logger.info(
    {
      userId: (userMetadata as any)?.userId,
      organizationId: (userMetadata as any)?.organizationId,
      messageCount: messages.length,
      queryClassification,
      maxTokens,
      maxSteps,
    },
    'Chat stream started',
  );

  void logSanitizedChatQuery(userMetadata as UserMetadata, userText);

  return startStreamText({
    googleClient,
    systemPrompt,
    messages: recentMessages,
    userMetadata: userMetadata as UserMetadata,
    maxTokens,
    maxSteps,
  }).toUIMessageStreamResponse({
    // Keep reading the tee'd stream after a client abort so onFinish still
    // runs and the assistant turn is persisted.
    consumeSseStream: consumeStream,
    async onFinish({ responseMessage }) {
      try {
        await saveAssistantMessage(body.sessionId, responseMessage);
      } catch (error) {
        logger.error(
          { error, sessionId: body.sessionId },
          '[CHAT_PERSIST_ASSISTANT_FAILED]',
        );
      }
    },
  });
}

let google: ReturnType<typeof createVertexAnthropic> | undefined;
if (credentialsBuffer) {
  try {
    const credentialsParsed = JSON.parse(
      Buffer.from(credentialsBuffer, 'base64').toString('utf-8'),
    );
    google = createVertexAnthropic({
      googleAuthOptions: {
        credentials: credentialsParsed,
      },
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: 'global',
    });
  } catch (e) {
    logger.error(
      { error: e },
      'Failed to parse GOOGLE_APPLICATION_CREDENTIALS',
    );
  }
} else {
  logger.warn(
    'GOOGLE_APPLICATION_CREDENTIALS is not set. AI features might be limited or fail.',
  );
  google = createVertexAnthropic({
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: 'global',
  });
}

export async function streamChat(c: Context) {
  if (!google) return buildAiNotConfiguredResponse(c);
  try {
    return await handleStreamChatRequest(c, google);
  } catch (error) {
    return buildStreamChatErrorResponse(c, error);
  }
}
