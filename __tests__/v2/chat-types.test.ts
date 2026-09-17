import { isToolError, isExecutionError } from '@/lib/v2/chat/types';
import type { ToolError } from '@/lib/v2/chat/types';

describe('isToolError', () => {
  it('returns true for a ToolError object', () => {
    const err: ToolError = { error: 'something went wrong' };
    expect(isToolError(err)).toBe(true);
  });

  it('returns false for a non-error object', () => {
    expect(isToolError({ data: 'ok' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isToolError(null)).toBe(false);
  });
});

describe('isExecutionError', () => {
  it('returns true for an error that is not _NO_RESULTS_', () => {
    const err: ToolError = { error: 'Failed to retrieve contracts' };
    expect(isExecutionError(err)).toBe(true);
  });

  it('returns true for "User context not available"', () => {
    const err: ToolError = { error: 'User context not available' };
    expect(isExecutionError(err)).toBe(true);
  });

  it('returns false for _NO_RESULTS_ error', () => {
    const err: ToolError = { error: '_NO_RESULTS_', noResults: true };
    expect(isExecutionError(err)).toBe(false);
  });

  it('returns false for non-error objects', () => {
    expect(isExecutionError({ type: 'vendor_total', vendorName: 'Acme' })).toBe(
      false,
    );
  });

  it('returns false for null', () => {
    expect(isExecutionError(null)).toBe(false);
  });
});
