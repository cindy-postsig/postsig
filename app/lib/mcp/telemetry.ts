import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import type { Json } from '@/database.types';
import type { McpScope, McpTokenSource } from '@/app/lib/mcp/context';
import type { McpModule } from '@/app/lib/mcp/auth';

const MAX_INPUT_SAMPLE_BYTES = 4096;
// Largest observed response is ~170KB (get_report_data); 1MB leaves headroom
// while preventing a runaway tool from writing a multi-MB row.
const MAX_OUTPUT_SAMPLE_BYTES = 1024 * 1024;

export interface ToolCallRecord {
  userId: string;
  organizationId: string;
  tokenId: string;
  tokenSource: McpTokenSource;
  startedAt: Date;
  durationMs: number;
  module: McpModule;
  toolName: string;
  scope: McpScope | null;
  status: 'success' | 'error';
  errorCode: string | null;
  requestBytes: number;
  responseBytes: number;
  input: unknown;
  output: unknown;
}

// JSONB requires valid JSON, so over-cap or unserializable values get a
// sentinel object — never a truncated string mid-payload.
function buildJsonSample(value: unknown, maxBytes: number): Json | null {
  if (value === undefined || value === null) return null;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { _unserializable: true };
  }
  if (!serialized) return null;
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > maxBytes) {
    return { _truncated: true, _bytes: bytes };
  }
  // JSON.stringify just succeeded, so value is structurally Json-compatible
  // even though the input type is `unknown`.
  return value as Json;
}

export async function recordToolCall(record: ToolCallRecord): Promise<void> {
  const supabase = createServiceClient();
  try {
    const { error } = await supabase.from('mcp_tool_calls').insert({
      user_id: record.userId,
      organization_id: record.organizationId,
      token_id: record.tokenId,
      token_source: record.tokenSource,
      started_at: record.startedAt.toISOString(),
      duration_ms: record.durationMs,
      module: record.module,
      tool_name: record.toolName,
      scope: record.scope,
      status: record.status,
      error_code: record.errorCode,
      request_bytes: record.requestBytes,
      response_bytes: record.responseBytes,
      input_sample: buildJsonSample(record.input, MAX_INPUT_SAMPLE_BYTES),
      output_sample: buildJsonSample(record.output, MAX_OUTPUT_SAMPLE_BYTES),
    });
    if (error) {
      logger.warn(
        { err: error, tool: record.toolName },
        'mcp: failed to record tool call telemetry',
      );
    }
  } catch (err) {
    // Transport-level rejection (PostgREST errors land on { error } above).
    logger.warn(
      { err, tool: record.toolName },
      'mcp: failed to record tool call telemetry',
    );
  }
}
