// Interface for the signed URL cache
export interface SignedUrlCache {
  [id: string]: {
    url: string;
    expiry: number; // timestamp when the URL expires
  };
}

export const signedUrlCache: SignedUrlCache = {};

export function getFromUrlCache(id: string): string | null {
  const cached = signedUrlCache[id];
  const now = Date.now();

  if (cached && cached.expiry > now) {
    return cached.url;
  }

  return null;
}

export function addToUrlCache(
  id: string,
  url: string,
  expiryMinutes: number = 55,
): void {
  signedUrlCache[id] = {
    url,
    expiry: Date.now() + expiryMinutes * 60 * 1000,
  };
}

/**
 * Clear a specific URL from the cache
 * @param id The attachment ID
 */
export function clearFromUrlCache(id: string): void {
  delete signedUrlCache[id];
}

/**
 * Clear all URLs from the cache
 */
export function clearUrlCache(): void {
  Object.keys(signedUrlCache).forEach((key) => {
    delete signedUrlCache[key];
  });
}

/**
 * Refreshes the expiry time for a cached URL
 * @param id The attachment ID
 * @param expiryMinutes Minutes until the URL expires (default: 55)
 * @returns True if the URL was found and refreshed, false otherwise
 */
export function refreshUrlCacheExpiry(
  id: string,
  expiryMinutes: number = 55,
): boolean {
  if (signedUrlCache[id]) {
    signedUrlCache[id].expiry = Date.now() + expiryMinutes * 60 * 1000;
    return true;
  }
  return false;
}
