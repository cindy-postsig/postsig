'use server';

import Redis from 'ioredis';
import { getRedisConfig } from './config';
import logger from '@/utils/pino';

class RedisService {
  private static instance: RedisService | null = null;
  private static initializationPromise: Promise<RedisService> | null = null;
  private client: Redis | null = null;
  private isConnected = false;
  private connectionPromise: Promise<unknown> | null = null;

  private constructor() {}

  private async initialize(): Promise<void> {
    const config = await getRedisConfig();

    if (!config.url) {
      throw new Error('Redis URL not found');
    }

    this.client = new Redis(config.url, config.options);

    this.setupEventHandlers();
  }

  static async getInstance(): Promise<RedisService> {
    if (RedisService.instance) {
      return RedisService.instance;
    }

    if (RedisService.initializationPromise) {
      return RedisService.initializationPromise;
    }

    RedisService.initializationPromise = (async () => {
      const instance = new RedisService();
      await instance.initialize();
      RedisService.instance = instance;
      return instance;
    })().catch((error) => {
      // Clear the cached promise, or one transient failure keeps every later
      // caller broken until the next deploy.
      RedisService.initializationPromise = null;
      throw error;
    });

    return RedisService.initializationPromise;
  }

  private setupEventHandlers(): void {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    this.client.on('connect', () => {
      this.isConnected = true;
    });

    this.client.on('error', (error: Error) => {
      this.isConnected = false;
      logger.error({ error }, 'Redis connection error');
    });

    this.client.on('close', () => {
      this.isConnected = false;
    });
  }

  private async ensureConnection(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    if (this.isConnected) return;

    if (!this.connectionPromise) {
      this.connectionPromise = this.client.connect().catch((error: unknown) => {
        logger.error({ error }, 'Failed to connect to Redis');
        throw error;
      });
      // Cleared either way, so a failed handshake can be retried next call.
      this.connectionPromise.finally(() => {
        this.connectionPromise = null;
      });
    }

    await this.connectionPromise;
  }

  private getUserKey(baseKey: string, userMetadata?: any): string {
    if (!userMetadata?.userId) return baseKey;
    return `user:${userMetadata.userId}:${baseKey}`;
  }

  private getOrganizationKey(baseKey: string, userMetadata?: any): string {
    if (!userMetadata?.organizationId) return baseKey;
    return `org:${userMetadata.organizationId}:${baseKey}`;
  }

  async get<T>(key: string, userMetadata?: any): Promise<T | null> {
    try {
      await this.ensureConnection();
      const cacheKey = this.getUserKey(key, userMetadata);
      if (!this.client) throw new Error('Redis client not initialized');
      const value = await this.client.get(cacheKey);

      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      logger.error({ error }, 'Redis GET error');
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    userMetadata?: any,
    ttl: number = 3600,
  ): Promise<boolean> {
    try {
      await this.ensureConnection();
      const cacheKey = this.getUserKey(key, userMetadata);
      const serializedValue = JSON.stringify(value);

      if (!this.client) throw new Error('Redis client not initialized');
      const result = await this.client.setex(cacheKey, ttl, serializedValue);
      return result === 'OK';
    } catch (error) {
      logger.error({ error }, 'Redis SET error');
      return false;
    }
  }

  async del(key: string, userMetadata?: any): Promise<boolean> {
    try {
      await this.ensureConnection();
      const cacheKey = this.getUserKey(key, userMetadata);
      if (!this.client) throw new Error('Redis client not initialized');
      const result = await this.client.del(cacheKey);
      return result > 0;
    } catch (error) {
      logger.error({ error }, 'Redis DEL error');
      return false;
    }
  }

  /**
   * Atomic counter for rate limiting. The TTL is applied only when absent, so
   * the window is fixed rather than sliding and a lost EXPIRE self-heals.
   *
   * This and the three below throw, unlike the cache methods above. Do not wrap
   * them in a swallowing try/catch: a counter that cannot tell a real zero from
   * an unreachable store would stop enforcing silently.
   */
  async incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    await this.ensureConnection();
    if (!this.client) throw new Error('Redis client not initialized');
    const results = await this.client.pipeline().incr(key).ttl(key).exec();

    const [incrResult, ttlResult] = results ?? [];
    if (!incrResult || incrResult[0] || typeof incrResult[1] !== 'number') {
      throw new Error('Redis INCR returned no count');
    }
    // Must not fall through to EXPIRE on a failed read — that would slide the
    // window forward on every attempt so it never closes.
    if (!ttlResult || ttlResult[0] || typeof ttlResult[1] !== 'number') {
      throw new Error('Redis TTL returned no value');
    }

    if (ttlResult[1] < 0) {
      await this.client.expire(key, ttlSeconds);
    }

    return incrResult[1];
  }

  /** Remaining lifetime; -2 if the key is missing, -1 if it has no expiry. */
  async getTtl(key: string): Promise<number> {
    await this.ensureConnection();
    if (!this.client) throw new Error('Redis client not initialized');
    return await this.client.ttl(key);
  }

  /**
   * Current counter value without incrementing it; 0 if the key is missing.
   * Throws like the primitives above rather than swallowing errors.
   */
  async getCount(key: string): Promise<number> {
    await this.ensureConnection();
    if (!this.client) throw new Error('Redis client not initialized');
    const value = await this.client.get(key);
    if (value === null) return 0;
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new Error('Redis GET returned a non-numeric count');
    }
    return parsed;
  }

  /**
   * SET with an expiry, only if absent — an atomic mutex, so exactly one of N
   * concurrent callers wins. `set()` above uses SETEX and cannot express NX.
   */
  async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
    await this.ensureConnection();
    if (!this.client) throw new Error('Redis client not initialized');
    const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Removes keys, throwing on failure — unlike `del()` above, which reports a
   * failed delete the same way it reports "nothing was there". A cleanup that
   * cannot say it failed leaves a signed-in user throttled with no signal.
   * Deleting nothing is success: the keys being absent is the desired state.
   */
  async deleteKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.ensureConnection();
    if (!this.client) throw new Error('Redis client not initialized');
    await this.client.del(...keys);
  }

  /** Unconditional write with an expiry. */
  async setWithTtl(key: string, ttlSeconds: number): Promise<void> {
    await this.ensureConnection();
    if (!this.client) throw new Error('Redis client not initialized');
    await this.client.set(key, '1', 'EX', ttlSeconds);
  }

  async exists(key: string, userMetadata?: any): Promise<boolean> {
    try {
      await this.ensureConnection();
      const cacheKey = this.getUserKey(key, userMetadata);
      if (!this.client) throw new Error('Redis client not initialized');
      const result = await this.client.exists(cacheKey);
      return result === 1;
    } catch (error) {
      logger.error({ error }, 'Redis EXISTS error');
      return false;
    }
  }

  async mget<T>(keys: string[], userMetadata?: any): Promise<(T | null)[]> {
    try {
      await this.ensureConnection();
      const cacheKeys = keys.map((key) => this.getUserKey(key, userMetadata));
      if (!this.client) throw new Error('Redis client not initialized');
      const values = await this.client.mget(...cacheKeys);

      return values.map((value: string | null) => {
        if (!value) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      });
    } catch (error) {
      logger.error({ error }, 'Redis MGET error');
      return new Array(keys.length).fill(null);
    }
  }

  async mset(
    pairs: Array<{ key: string; value: any }>,
    userMetadata?: any,
    ttl: number = 3600,
  ): Promise<boolean> {
    try {
      await this.ensureConnection();
      if (!this.client) throw new Error('Redis client not initialized');
      const pipeline = this.client.pipeline();

      pairs.forEach(({ key, value }) => {
        const cacheKey = this.getUserKey(key, userMetadata);
        const serializedValue = JSON.stringify(value);
        pipeline.setex(cacheKey, ttl, serializedValue);
      });

      const results = await pipeline.exec();
      return (
        results?.every(
          ([error, result]: [Error | null, unknown]) =>
            !error && result === 'OK',
        ) ?? false
      );
    } catch (error) {
      logger.error({ error }, 'Redis MSET error');
      return false;
    }
  }

  /**
   * KEYS is O(keyspace) and blocks the single-threaded server, so a match walk
   * must SCAN in pages; UNLINK reclaims memory off-thread.
   */
  private async deleteByPattern(pattern: string): Promise<boolean> {
    await this.ensureConnection();
    if (!this.client) throw new Error('Redis client not initialized');
    let cursor = '0';
    let deleted = 0;
    do {
      const [next, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        1000,
      );
      cursor = next;
      if (keys.length > 0) {
        deleted += await this.client.unlink(...keys);
      }
    } while (cursor !== '0');
    return deleted >= 0;
  }

  async clearUserCache(userMetadata: { userId: string }): Promise<boolean> {
    try {
      return await this.deleteByPattern(`user:${userMetadata.userId}:*`);
    } catch (error) {
      logger.error({ error }, 'Redis CLEAR USER CACHE error');
      return false;
    }
  }

  async clearOrganizationCache(userMetadata: {
    organizationId: string;
  }): Promise<boolean> {
    try {
      return await this.deleteByPattern(
        `*org:${userMetadata.organizationId}:*`,
      );
    } catch (error) {
      logger.error({ error }, 'Redis CLEAR ORG CACHE error');
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        this.isConnected = false;
      }
    } catch (error) {
      logger.error({ error }, 'Error disconnecting from Redis');
    }
  }

  async getHealth(): Promise<{ connected: boolean; client: string }> {
    return {
      connected: this.isConnected,
      client: this.client?.status || 'not_initialized',
    };
  }
}

export async function getRedisService(): Promise<RedisService> {
  return await RedisService.getInstance();
}
