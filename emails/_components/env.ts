export const APP_BASE_URL = (() => {
  if (process.env.ENV === 'local') return 'http://localhost:3000';
  if (process.env.APP_URL) return `https://${process.env.APP_URL}`;
  return 'http://localhost:3000';
})();

// Always public — email recipients (Gmail's image proxy, etc.) can't reach
// localhost, so even in local dev we point assets at a real production URL.
export const EMAIL_ASSET_BASE_URL = (() => {
  if (process.env.APP_URL) return `https://${process.env.APP_URL}`;
  return 'https://app.postsig.com';
})();

/**
 * Base URL of the Extractor App, or null when unset. Accepts a bare host
 * (matching the APP_URL/ADMIN_APP_URL convention) or a full URL.
 *
 * Returns null rather than falling back to APP_BASE_URL: /contract-lineage
 * lives in the Extractor App, so the main app is never a valid target.
 */
export const resolveExtractorBaseUrl = (): string | null => {
  const raw = process.env.EXTRACTOR_APP_URL?.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, '');
};
