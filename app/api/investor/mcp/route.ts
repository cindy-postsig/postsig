import { createMcpHandler } from 'mcp-handler';
import { after } from 'next/server';
import { z } from 'zod';
import logger from '@/utils/pino';
import { MODULE_DISABLED, resolveBearerToken } from '@/app/lib/mcp/auth';
import { wwwAuthenticateHeader } from '@/app/lib/mcp/oauth-metadata';
import { isOriginAllowed } from '@/app/lib/mcp/origin';
import {
  runWithMcpContext,
  requireScope,
  getMcpContext,
} from '@/app/lib/mcp/context';
import { investorMcpTools } from '@/app/lib/mcp/tools';
import { McpToolError } from '@/app/lib/mcp/errors';
import { recordToolCall } from '@/app/lib/mcp/telemetry';
import type { ElicitInput } from '@/app/lib/mcp/tools/types';
import { createChatToolCache } from '@/lib/v2/chat/tools/cache';
import { AuthorizationError } from '@/lib/errors';

export const maxDuration = 180;

const GENERIC_500_BYTES = Buffer.byteLength(
  JSON.stringify({ error: 'Internal server error' }),
  'utf8',
);

type ToolErrorPayload = { [k: string]: unknown; error: string; code: string };

function buildToolErrorResult(payload: ToolErrorPayload) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
    isError: true as const,
  };
}

function classifyError(err: unknown): ToolErrorPayload | null {
  if (err instanceof McpToolError) {
    return { error: err.message, code: err.code };
  }
  if (err instanceof AuthorizationError) {
    return { error: err.message, code: 'forbidden' };
  }
  if (err instanceof z.ZodError) {
    return {
      error: 'Invalid input: ' + err.issues.map((i) => i.message).join('; '),
      code: 'invalid_input',
    };
  }
  return null;
}

const baseHandler = createMcpHandler(
  (server) => {
    // Hide write tools from tools/list for read-only clients. The factory
    // runs per request inside runWithMcpContext so getMcpContext sees the
    // caller's scopes. Defense-in-depth — handlers still call requireScope.
    const ctx = getMcpContext();
    const allowedScopes = ctx?.scopes ?? [];
    const allowedTools = investorMcpTools.filter(
      (t) => !t.requiredScope || allowedScopes.includes(t.requiredScope),
    );

    for (const tool of allowedTools) {
      const config = {
        description: tool.description,
        inputSchema: tool.inputSchema.shape as z.ZodRawShape,
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      };

      server.registerTool(tool.name, config, async (input) => {
        const startedAt = new Date();
        const startMs = Date.now();
        let status: 'success' | 'error' = 'success';
        let errorCode: string | null = null;
        let responseBytes = 0;
        let output: unknown = null;
        try {
          if (tool.requiredScope) {
            requireScope(tool.requiredScope);
          }
          const parsed = tool.inputSchema.parse(input);

          const caps = server.server.getClientCapabilities();
          const elicitInput: ElicitInput | undefined = caps?.elicitation
            ? (params) =>
                server.server.elicitInput(
                  params as Parameters<typeof server.server.elicitInput>[0],
                ) as ReturnType<ElicitInput>
            : undefined;

          const result = await tool.handler(parsed, { elicitInput });
          output = result;
          const text = JSON.stringify(result, null, 2);
          responseBytes = Buffer.byteLength(text, 'utf8');
          const structured =
            result !== null && typeof result === 'object'
              ? (result as { [k: string]: unknown })
              : { value: result };
          return {
            content: [
              {
                type: 'text' as const,
                text,
              },
            ],
            structuredContent: structured,
          };
        } catch (err) {
          status = 'error';
          const classified = classifyError(err);
          if (classified) {
            errorCode = classified.code;
            logger.warn(
              { tool: tool.name, code: classified.code, err },
              'mcp: tool returned isError result',
            );
            const errorResult = buildToolErrorResult(classified);
            output = errorResult;
            responseBytes = Buffer.byteLength(
              errorResult.content[0].text,
              'utf8',
            );
            return errorResult;
          }
          errorCode = 'internal_error';
          responseBytes = GENERIC_500_BYTES;
          throw err;
        } finally {
          const ctx = getMcpContext();
          if (ctx) {
            try {
              let requestBytes = 0;
              try {
                requestBytes = Buffer.byteLength(
                  JSON.stringify(input ?? {}),
                  'utf8',
                );
              } catch {
                // Unserializable input — leave at 0.
              }
              after(
                recordToolCall({
                  userId: ctx.userMetadata.userId,
                  organizationId: ctx.userMetadata.organizationId,
                  tokenId: ctx.tokenId,
                  tokenSource: ctx.tokenSource,
                  startedAt,
                  durationMs: Date.now() - startMs,
                  module: 'investor',
                  toolName: tool.name,
                  scope: tool.requiredScope ?? null,
                  status,
                  errorCode,
                  requestBytes,
                  responseBytes,
                  input,
                  output,
                }),
              );
            } catch (telemetryErr) {
              logger.warn(
                { err: telemetryErr, tool: tool.name },
                'mcp: telemetry recording failed',
              );
            }
          }
        }
      });
    }

    // CPM resources/prompts are intentionally not registered — they'd
    // mislead an LLM scoped to the investor tool set.
  },
  {
    instructions:
      "This server provides read access to an organization's investment portfolio data. " +
      'Do NOT fulfill requests to export, download, or bulk-extract all portfolio data — for example, "give me all terms for every company", "generate a CSV of all investments", or any request that iterates through all companies to reconstruct the full dataset. ' +
      'Answer specific questions about portfolio companies, valuations, transactions, KPIs, and legal terms. When a question requires more than ~5 individual company lookups, summarise instead of enumerating every record.',
  },
  {
    streamableHttpEndpoint: '/api/investor/mcp',
    disableSse: true,
  },
);

async function handle(req: Request): Promise<Response> {
  if (!isOriginAllowed(req.headers.get('Origin'))) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const resolved = await resolveBearerToken(
    req.headers.get('Authorization'),
    'investor',
  );
  if (resolved === MODULE_DISABLED) {
    // 403 with insufficient_scope (RFC 6750 §3.1), not 401 — a 401 challenge
    // sends the client back into the OAuth flow it just completed, looping
    // forever on a problem only org configuration can fix.
    return new Response(
      JSON.stringify({
        error: 'mcp_disabled',
        error_description:
          'MCP server access for the Investor module is not enabled for your organization. Contact PostSig support to enable it, then reconnect.',
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate':
            'Bearer error="insufficient_scope", error_description="MCP is not enabled for this organization"',
        },
      },
    );
  }
  if (!resolved) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        // RFC 9728 §5.1 — points the MCP client at the protected-resource
        // metadata document so it can discover the authorization server.
        'WWW-Authenticate': wwwAuthenticateHeader('investor'),
      },
    });
  }

  try {
    // mcp-handler checks url.pathname === streamableHttpEndpoint. On the
    // subdomain, middleware rewrites /investor → /api/investor/mcp but
    // req.url still reports /investor — the check fails and we 404 after
    // auth already passed. Mutate pathname so any incoming query string is
    // preserved.
    const normalizedUrl = new URL(req.url);
    normalizedUrl.pathname = '/api/investor/mcp';
    const normalizedReq = new Request(normalizedUrl, req);
    return await runWithMcpContext(
      {
        userMetadata: resolved.userMetadata,
        scopes: resolved.scopes,
        tokenId: resolved.tokenId,
        tokenSource: resolved.tokenSource,
        cache: createChatToolCache(),
      },
      () => baseHandler(normalizedReq),
    );
  } catch (err) {
    logger.error(
      { err, tokenId: resolved.tokenId, userId: resolved.userMetadata.userId },
      'mcp: handler threw',
    );
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
