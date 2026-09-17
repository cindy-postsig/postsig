/**
 * Errors that should surface to the MCP client as a tool-level result with
 * `isError: true` (per MCP spec) rather than as a transport-level HTTP 5xx.
 *
 * Anything not derived from McpToolError is treated as an unexpected
 * exception and bubbles to the route handler, which returns HTTP 500.
 */
export class McpToolError extends Error {
  readonly code: string;

  constructor(message: string, code: string = 'tool_error') {
    super(message);
    this.name = 'McpToolError';
    this.code = code;
  }
}

export class NotFoundToolError extends McpToolError {
  constructor(resource: string, id: number | string) {
    super(`${resource} ${id} not found`, 'not_found');
    this.name = 'NotFoundToolError';
  }
}

export class ValidationToolError extends McpToolError {
  constructor(message: string) {
    super(message, 'validation');
    this.name = 'ValidationToolError';
  }
}

export class FeatureDisabledToolError extends McpToolError {
  constructor(feature: string) {
    super(
      `${feature} is not enabled for this organization`,
      'feature_disabled',
    );
    this.name = 'FeatureDisabledToolError';
  }
}

export class TenantIsolationError extends McpToolError {
  constructor(tool: string) {
    super(`Tenant isolation violation in ${tool}`, 'tenant_isolation');
    this.name = 'TenantIsolationError';
  }
}
