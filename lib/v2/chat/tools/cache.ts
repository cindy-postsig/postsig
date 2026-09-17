/**
 * Per-request in-memory cache for chat tool data.
 *
 * Created once per streamText() call and shared across all tool invocations
 * within that request's multi-step reasoning. Unlike React cache(), this
 * persists across AI SDK steps within the same request.
 */

import logger from '@/utils/pino';

interface CacheStats {
  hits: number;
  misses: number;
}

export class ChatToolCache {
  private store = new Map<string, unknown>();
  private stats: CacheStats = { hits: 0, misses: 0 };

  /**
   * Build a standardised cache key from a function name and its parameters.
   * Format: `functionName:JSON.stringify(params)` where params defaults to
   * an empty object when omitted, producing deterministic keys.
   */
  static buildKey(
    functionName: string,
    params?: Record<string, unknown>,
  ): string {
    const serialised = params
      ? JSON.stringify(params, Object.keys(params).sort())
      : '{}';
    return `${functionName}:${serialised}`;
  }

  async getOrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (this.store.has(key)) {
      this.stats.hits++;
      logger.debug({ key }, '[ChatToolCache] hit');
      return this.store.get(key) as T;
    }

    this.stats.misses++;
    logger.debug({ key }, '[ChatToolCache] miss');
    try {
      const value = await fetcher();
      this.store.set(key, value);
      return value;
    } catch (error) {
      logger.error({ error, key }, '[ChatToolCache] fetch failed');
      throw error;
    }
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }
}

export function createChatToolCache(): ChatToolCache {
  return new ChatToolCache();
}
