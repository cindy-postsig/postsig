import { describe, expect, it } from '@jest/globals';
import {
  McpToolError,
  NotFoundToolError,
  ValidationToolError,
  TenantIsolationError,
} from '@/app/lib/mcp/errors';

describe('McpToolError hierarchy', () => {
  it('NotFoundToolError carries the not_found code and a useful message', () => {
    const err = new NotFoundToolError('Contract', 42);
    expect(err).toBeInstanceOf(McpToolError);
    expect(err.code).toBe('not_found');
    expect(err.message).toBe('Contract 42 not found');
  });

  it('ValidationToolError carries the validation code', () => {
    const err = new ValidationToolError('Bad input');
    expect(err).toBeInstanceOf(McpToolError);
    expect(err.code).toBe('validation');
    expect(err.message).toBe('Bad input');
  });

  it('TenantIsolationError carries the tenant_isolation code and names the tool', () => {
    const err = new TenantIsolationError('list_contracts');
    expect(err).toBeInstanceOf(McpToolError);
    expect(err.code).toBe('tenant_isolation');
    expect(err.message).toContain('list_contracts');
  });

  it('McpToolError defaults to tool_error when no code is supplied', () => {
    const err = new McpToolError('something');
    expect(err.code).toBe('tool_error');
  });
});
