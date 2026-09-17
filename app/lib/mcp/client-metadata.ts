import 'server-only';
import logger from '@/utils/pino';

// Speculative CIMD-style enrichment. We don't act on this metadata for
// security-sensitive decisions (redirect_uri allow-listing, audience binding,
// token issuance — all of that stays driven by what the client actually
// registered with Supabase). We only use it to *display* a richer consent
// screen when the client has bothered to publish a self-describing JSON
// document at their client_uri.

export interface ClientMetadataDocument {
  clientName?: string;
  logoUri?: string;
  clientUri?: string;
  policyUri?: string;
  tosUri?: string;
}

interface RawDoc {
  client_name?: unknown;
  logo_uri?: unknown;
  client_uri?: unknown;
  policy_uri?: unknown;
  tos_uri?: unknown;
}

const FETCH_TIMEOUT_MS = 2_000;
const MAX_BYTES = 32 * 1024; // 32 KB cap — these documents should be tiny

// Trim trailing slash so URL composition doesn't end up double-slashed.
function joinPath(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Minimal SSRF defense for the speculative CIMD fetch. The client_uri comes
// from dynamic registration and is attacker-controlled, so we hostname-reject
// loopback, RFC1918, link-local, and unique-local addresses before fetching.
// We don't do DNS resolution (an attacker can still register a public domain
// pointing to a private IP) — the value here is blocking obvious literal-IP
// targets and the cloud-metadata endpoint at 169.254.169.254. Defense in
// depth: the fetch is also https-only, 2s timeout, 32KB cap, no redirects.
function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true; // link-local + cloud metadata
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^0\./.test(host)) return true; // 0.0.0.0/8
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true; // IPv6 link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true; // IPv6 unique-local fc00::/7
  return false;
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return !isPrivateHostname(url.hostname);
  } catch {
    return false;
  }
}

function pickString(value: unknown, maxLen = 200): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

async function fetchWithCaps(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      // Don't follow redirects automatically — if the document moved, the
      // client's published metadata URL is wrong, and we don't want to chase
      // attacker-controlled redirects from a server-side fetch.
      redirect: 'error',
    });

    if (!res.ok) return null;

    // Read body with a size cap so a hostile server can't stream us a gigabyte.
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      if (text.length > MAX_BYTES) return null;
      return JSON.parse(text);
    }

    let received = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BYTES) {
        reader.cancel();
        return null;
      }
      chunks.push(value);
    }

    const buf = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c, offset);
      offset += c.byteLength;
    }
    const text = new TextDecoder('utf-8').decode(buf);
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchClientMetadataDocument(
  clientUri: string | null | undefined,
): Promise<ClientMetadataDocument | null> {
  if (!isHttpsUrl(clientUri) || !isPublicHttpsUrl(clientUri as string)) {
    return null;
  }

  // Use the .well-known pattern that mirrors RFC 9728's protected-resource
  // metadata convention. There's no settled spec for client-side metadata yet,
  // so this URL is speculative.
  const url = joinPath(
    clientUri as string,
    '/.well-known/oauth-client-metadata',
  );
  const startedAt = Date.now();

  const raw = await fetchWithCaps(url);
  const durationMs = Date.now() - startedAt;

  if (!raw || typeof raw !== 'object') {
    // Info-level so production logs answer "did anyone publish a doc yet?".
    // Search Vercel logs for `cimd: no document` to see every attempt that
    // came back empty, and grep for `cimd: enriched` to see hits.
    logger.info(
      { clientUri, url, durationMs },
      'cimd: no document at client_uri',
    );
    return null;
  }
  const doc = raw as RawDoc;

  const result: ClientMetadataDocument = {
    clientName: pickString(doc.client_name),
    // Logo + policy + tos must be https URLs so we don't render mixed content
    // or downgrade trust in the consent UI.
    logoUri: isHttpsUrl(doc.logo_uri) ? (doc.logo_uri as string) : undefined,
    clientUri: isHttpsUrl(doc.client_uri)
      ? (doc.client_uri as string)
      : undefined,
    policyUri: isHttpsUrl(doc.policy_uri)
      ? (doc.policy_uri as string)
      : undefined,
    tosUri: isHttpsUrl(doc.tos_uri) ? (doc.tos_uri as string) : undefined,
  };

  // Only return if at least one usable field came back — otherwise the caller
  // gets nothing and we don't waste cycles rendering empty overrides.
  const populatedFields = Object.entries(result)
    .filter(([, v]) => Boolean(v))
    .map(([k]) => k);

  if (populatedFields.length === 0) {
    logger.info(
      { clientUri, url, durationMs },
      'cimd: document returned but no usable fields',
    );
    return null;
  }

  logger.info(
    { clientUri, url, durationMs, fields: populatedFields },
    'cimd: enriched consent screen from client metadata',
  );
  return result;
}
