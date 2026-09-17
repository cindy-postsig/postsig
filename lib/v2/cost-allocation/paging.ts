import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';

// Paged reads shared by the context loader and the seat reader. They live
// apart from context.ts so a module the context itself reads can page without
// importing it back.

/** PostgREST caps responses at `max_rows` (1000), so read every page. */
const DB_PAGE_SIZE = 1000;
/** Keeps `.in(...)` filters within a sane query-string length. */
const ID_CHUNK_SIZE = 500;

export async function fetchAllPages<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  organizationId: string,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += DB_PAGE_SIZE) {
    const { data, error } = await buildQuery(offset, offset + DB_PAGE_SIZE - 1);
    if (error) {
      logger.error(
        { error: sanitizeForLogging(error), organizationId, label },
        'Failed to load allocation context',
      );
      throw error;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < DB_PAGE_SIZE) break;
  }
  return rows;
}

export async function fetchByIds<T>(
  ids: readonly number[],
  buildQuery: (
    chunk: number[],
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  organizationId: string,
  label: string,
): Promise<T[]> {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + ID_CHUNK_SIZE));
  }
  const pages = await Promise.all(
    chunks.map((chunk) =>
      fetchAllPages(
        (from, to) => buildQuery(chunk, from, to),
        organizationId,
        label,
      ),
    ),
  );
  return pages.flat();
}
