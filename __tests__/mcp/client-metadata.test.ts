import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('server-only', () => ({}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { fetchClientMetadataDocument } from '@/app/lib/mcp/client-metadata';

type FetchMock = jest.Mock<typeof fetch>;

function mockFetchReturning(body: unknown, opts?: { status?: number }) {
  const status = opts?.status ?? 200;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const mock = jest.fn(async () => {
    return {
      ok: status >= 200 && status < 300,
      status,
      // Provide a tiny stream so the size-capped reader path runs.
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      async text() {
        return text;
      },
    } as unknown as Response;
  }) as unknown as FetchMock;
  (globalThis as { fetch: typeof fetch }).fetch =
    mock as unknown as typeof fetch;
  return mock;
}

describe('fetchClientMetadataDocument', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns null for non-https client URI', async () => {
    const result = await fetchClientMetadataDocument('http://example.com');
    expect(result).toBeNull();
  });

  it('returns null for null/empty input', async () => {
    expect(await fetchClientMetadataDocument(null)).toBeNull();
    expect(await fetchClientMetadataDocument(undefined)).toBeNull();
    expect(await fetchClientMetadataDocument('')).toBeNull();
  });

  it('parses a valid CIMD-style document', async () => {
    mockFetchReturning({
      client_name: 'Claude Desktop',
      logo_uri: 'https://claude.ai/logo.png',
      policy_uri: 'https://anthropic.com/privacy',
      tos_uri: 'https://anthropic.com/terms',
      client_uri: 'https://claude.ai',
    });

    const result = await fetchClientMetadataDocument('https://claude.ai');
    expect(result).toEqual({
      clientName: 'Claude Desktop',
      logoUri: 'https://claude.ai/logo.png',
      clientUri: 'https://claude.ai',
      policyUri: 'https://anthropic.com/privacy',
      tosUri: 'https://anthropic.com/terms',
    });
  });

  it('drops non-https logo / policy / tos URIs', async () => {
    mockFetchReturning({
      client_name: 'Sketchy',
      logo_uri: 'http://insecure.example.com/logo.png',
      policy_uri: 'http://insecure.example.com/p',
      tos_uri: 'javascript:alert(1)',
    });

    const result = await fetchClientMetadataDocument(
      'https://sketchy.example.com',
    );
    expect(result).toEqual({ clientName: 'Sketchy' });
  });

  it('returns null when no usable fields are present', async () => {
    mockFetchReturning({ unrelated: 'noise' });
    const result = await fetchClientMetadataDocument('https://example.com');
    expect(result).toBeNull();
  });

  it('returns null on non-ok HTTP', async () => {
    mockFetchReturning('not found', { status: 404 });
    const result = await fetchClientMetadataDocument('https://example.com');
    expect(result).toBeNull();
  });

  it('returns null when body is not JSON', async () => {
    mockFetchReturning('<html>not json</html>');
    const result = await fetchClientMetadataDocument('https://example.com');
    expect(result).toBeNull();
  });

  it('hits the .well-known path on the client URI', async () => {
    const mock = mockFetchReturning({ client_name: 'X' });
    await fetchClientMetadataDocument('https://example.com/');
    expect(mock).toHaveBeenCalledWith(
      'https://example.com/.well-known/oauth-client-metadata',
      expect.any(Object),
    );
  });

  it('truncates absurdly long client_name', async () => {
    mockFetchReturning({ client_name: 'x'.repeat(5000) });
    const result = await fetchClientMetadataDocument('https://example.com');
    expect(result?.clientName?.length).toBe(200);
  });

  it('returns null when fetch aborts (timeout safeguard)', async () => {
    jest.useFakeTimers();
    (globalThis as { fetch: typeof fetch }).fetch = jest.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;

    try {
      const pending = fetchClientMetadataDocument('https://slow.example.com');
      await jest.advanceTimersByTimeAsync(2_100);
      await expect(pending).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns null when response body exceeds the 32KB cap', async () => {
    const oversizedJson = JSON.stringify({
      client_name: 'x'.repeat(50 * 1024),
    });
    mockFetchReturning(oversizedJson);
    const result = await fetchClientMetadataDocument('https://big.example.com');
    expect(result).toBeNull();
  });

  it('rejects private-network hostnames before fetching', async () => {
    const mock = jest.fn() as unknown as typeof fetch;
    (globalThis as { fetch: typeof fetch }).fetch = mock;

    for (const url of [
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://10.0.0.1/x',
      'https://192.168.1.1/x',
      'https://169.254.169.254/x',
      'https://172.16.0.1/x',
      'https://internal.local/x',
      'https://[::1]/x',
      'https://[fe80::1]/x',
    ]) {
      expect(await fetchClientMetadataDocument(url)).toBeNull();
    }
    expect(mock).not.toHaveBeenCalled();
  });
});
