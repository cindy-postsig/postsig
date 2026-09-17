import { z } from 'zod';
import { ValidationToolError } from '@/app/lib/mcp/errors';

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 25;

export const paginationSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_LIMIT)
    .optional()
    .describe(
      `Page size. Defaults to ${DEFAULT_PAGE_LIMIT}, max ${MAX_PAGE_LIMIT}. Pair with cursor for follow-up pages.`,
    ),
  cursor: z
    .string()
    .optional()
    .describe(
      'Opaque cursor returned as nextCursor in a prior response. Pass it back to fetch the next page.',
    ),
} as const;

export interface PaginationInput {
  limit?: number;
  cursor?: string;
}

export interface PaginationResult<T> {
  items: T[];
  nextCursor: string | null;
  totalAvailable: number;
}

interface CursorPayload {
  o: number;
}

function decodeCursor(cursor: string): number {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json) as CursorPayload;
    if (
      typeof parsed.o !== 'number' ||
      parsed.o < 0 ||
      !Number.isFinite(parsed.o)
    ) {
      throw new Error('invalid offset');
    }
    return Math.floor(parsed.o);
  } catch {
    throw new ValidationToolError('Invalid cursor');
  }
}

function encodeCursor(offset: number): string {
  const payload: CursorPayload = { o: offset };
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
}

/**
 * In-memory pagination over a fully-materialised array. Filter first, then
 * paginate — `items` is the full filtered set.
 */
export function paginate<T>(
  items: T[],
  input: PaginationInput,
): PaginationResult<T> {
  const limit = input.limit ?? DEFAULT_PAGE_LIMIT;
  const offset = input.cursor ? decodeCursor(input.cursor) : 0;
  const slice = items.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  const nextCursor =
    nextOffset < items.length ? encodeCursor(nextOffset) : null;
  return {
    items: slice,
    nextCursor,
    totalAvailable: items.length,
  };
}
