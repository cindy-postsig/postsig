import type { ZodObject, ZodRawShape } from 'zod';
import type { McpScope } from '@/app/lib/mcp/context';

export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** Flat JSON schema accepted by elicitation per the MCP spec. */
export interface ElicitationSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ElicitationResult {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, unknown>;
}

export type ElicitInput = (params: {
  message: string;
  requestedSchema: ElicitationSchema;
}) => Promise<ElicitationResult>;

export interface McpToolContext {
  /** Set when the connected client advertises elicitation capability.
   *  Tools should fall back to a non-interactive path when undefined. */
  elicitInput?: ElicitInput;
}

export interface McpToolDef<S extends ZodRawShape = ZodRawShape> {
  name: string;
  description: string;
  inputSchema: ZodObject<S>;
  annotations?: McpToolAnnotations;
  /** When set, the route handler asserts the caller has this scope before
   *  parsing the input. Inner handlers may still call requireScope as
   *  defense-in-depth. */
  requiredScope?: McpScope;
  handler: (input: unknown, ctx: McpToolContext) => Promise<unknown>;
}
