interface CacheEntry<T> {
  data: T;
  expiry: number;
  userHash?: string;
}

class GenericCache<T> {
  private cache: { [key: string]: CacheEntry<T> } = {};
  private defaultCacheDuration: number;

  constructor(defaultCacheDuration: number = 5 * 60 * 1000) {
    this.defaultCacheDuration = defaultCacheDuration;
  }

  private getUserHash(userMetadata?: any): string | undefined {
    if (!userMetadata) return undefined;

    const relevantData = {
      id: userMetadata.id,
      organization_id: userMetadata.organization_id,
      roles: userMetadata.roles || [],
    };

    try {
      return btoa(JSON.stringify(relevantData));
    } catch (e) {
      // btoa is not available in all environments (e.g. server components in some contexts)
      // Fallback to a simple string representation
      return JSON.stringify(relevantData);
    }
  }

  private getCacheKey(baseKey: string, userMetadata?: any): string {
    const userHash = this.getUserHash(userMetadata);
    return userHash ? `${baseKey}_${userHash}` : baseKey;
  }

  get(key: string, userMetadata?: any): T | null {
    const cacheKey = this.getCacheKey(key, userMetadata);
    const entry = this.cache[cacheKey];
    const now = Date.now();

    if (entry && entry.expiry > now) {
      if (userMetadata && entry.userHash !== this.getUserHash(userMetadata)) {
        return null;
      }
      return entry.data;
    }

    return null;
  }

  set(key: string, data: T, userMetadata?: any, duration?: number): void {
    const cacheKey = this.getCacheKey(key, userMetadata);
    const expiry = Date.now() + (duration || this.defaultCacheDuration);
    const userHash = this.getUserHash(userMetadata);

    this.cache[cacheKey] = {
      data,
      expiry,
      userHash,
    };
  }

  clear(key?: string, userMetadata?: any): void {
    if (key) {
      const cacheKey = this.getCacheKey(key, userMetadata);
      delete this.cache[cacheKey];
    } else {
      // If no key, clear the entire cache
      this.cache = {};
    }
  }

  isValid(key: string, userMetadata?: any): boolean {
    const cacheKey = this.getCacheKey(key, userMetadata);
    const entry = this.cache[cacheKey];
    const now = Date.now();

    return !!(
      entry &&
      entry.expiry > now &&
      (!userMetadata || entry.userHash === this.getUserHash(userMetadata))
    );
  }
}

export const vendorCache = new GenericCache<any[]>();
