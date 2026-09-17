import {
  uploadDocument,
  getDocumentStatus,
  downloadDocument,
  isSourceEqualsTargetError,
} from '../deepl';
import { ExternalServiceError, ExternalServiceQuotaError } from '@/lib/errors';

const mockFetch = jest.fn();

const jsonResponse = (body: unknown, init: { ok?: boolean } = {}) => ({
  ok: init.ok ?? true,
  status: 200,
  statusText: 'OK',
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const errorResponse = (status: number, body: string) => ({
  ok: false,
  status,
  statusText: 'Bad Request',
  json: async () => ({}),
  text: async () => body,
});

const handle = { documentId: 'doc-1', documentKey: 'key-1' };

describe('deepl document client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
    process.env = {
      ...originalEnv,
      DEEPL_API_KEY: 'test-key',
      DEEPL_API_HOST: 'https://api.deepl.test',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('uploadDocument', () => {
    it('returns the document handle and authenticates', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ document_id: 'doc-1', document_key: 'key-1' }),
      );

      await expect(
        uploadDocument(Buffer.from('pdf'), 'berenberg.pdf', 'EN-US'),
      ).resolves.toEqual(handle);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.deepl.test/v2/document');
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('DeepL-Auth-Key test-key');
      expect(options.body).toBeInstanceOf(FormData);
      expect((options.body as FormData).get('target_lang')).toBe('EN-US');
      // Omitted rather than sent empty, so DeepL still auto-detects.
      expect((options.body as FormData).get('source_lang')).toBeNull();
    });

    it.each([
      ['hi', 'HI'],
      ['de', 'DE'],
    ])('sends %s as the upper-cased source_lang', async (code, expected) => {
      mockFetch.mockResolvedValue(
        jsonResponse({ document_id: 'doc-1', document_key: 'key-1' }),
      );

      await uploadDocument(Buffer.from('pdf'), 'a.pdf', 'EN-US', code);

      const [, options] = mockFetch.mock.calls[0];
      expect((options.body as FormData).get('source_lang')).toBe(expected);
    });

    it.each([[null], [undefined], ['']])(
      'omits source_lang when it is %s',
      async (code) => {
        mockFetch.mockResolvedValue(
          jsonResponse({ document_id: 'doc-1', document_key: 'key-1' }),
        );

        await uploadDocument(Buffer.from('pdf'), 'a.pdf', 'EN-US', code);

        const [, options] = mockFetch.mock.calls[0];
        expect((options.body as FormData).get('source_lang')).toBeNull();
      },
    );

    it('throws when the API key is missing', async () => {
      delete process.env.DEEPL_API_KEY;

      await expect(
        uploadDocument(Buffer.from('pdf'), 'a.pdf', 'EN-US'),
      ).rejects.toThrow(ExternalServiceError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('raises a quota error carrying the DeepL body on a 456', async () => {
      mockFetch.mockResolvedValue(
        errorResponse(456, 'Quota for this billing period has been exceeded'),
      );

      await expect(
        uploadDocument(Buffer.from('pdf'), 'a.pdf', 'EN-US'),
      ).rejects.toThrow(ExternalServiceQuotaError);
      await expect(
        uploadDocument(Buffer.from('pdf'), 'a.pdf', 'EN-US'),
      ).rejects.toThrow(/Quota for this billing period has been exceeded/);
    });

    it('leaves a transient failure as a plain external service error', async () => {
      // A spent allowance is terminal and a 503 is not; conflating them would
      // either burn retries on a quota failure or give up on a recoverable one.
      mockFetch.mockResolvedValue(errorResponse(503, 'Service unavailable'));

      const error = await uploadDocument(
        Buffer.from('pdf'),
        'a.pdf',
        'EN-US',
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ExternalServiceError);
      expect(error).not.toBeInstanceOf(ExternalServiceQuotaError);
    });

    it('throws when the response omits the document handle', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ document_id: 'doc-1' }));

      await expect(
        uploadDocument(Buffer.from('pdf'), 'a.pdf', 'EN-US'),
      ).rejects.toThrow(/missing document_id or document_key/);
    });
  });

  describe('getDocumentStatus', () => {
    it('maps the status payload and sends the document key', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          status: 'done',
          billed_characters: 12345,
          seconds_remaining: 0,
        }),
      );

      await expect(getDocumentStatus(handle)).resolves.toEqual({
        status: 'done',
        billedCharacters: 12345,
        secondsRemaining: 0,
        errorMessage: undefined,
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.deepl.test/v2/document/doc-1');
      expect(JSON.parse(options.body)).toEqual({ document_key: 'key-1' });
    });

    it('passes through a translation error message', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({ status: 'error', error_message: 'Unsupported file' }),
      );

      const status = await getDocumentStatus(handle);

      expect(status.status).toBe('error');
      expect(status.errorMessage).toBe('Unsupported file');
    });
  });

  describe('downloadDocument', () => {
    it('returns the translated bytes as a Buffer', async () => {
      const bytes = new TextEncoder().encode('translated-pdf');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => bytes.buffer,
      });

      const result = await downloadDocument(handle);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe('translated-pdf');
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://api.deepl.test/v2/document/doc-1/result',
      );
    });

    it('throws on a non-2xx response', async () => {
      mockFetch.mockResolvedValue(errorResponse(404, 'Not found'));

      await expect(downloadDocument(handle)).rejects.toThrow(
        ExternalServiceError,
      );
    });
  });

  describe('isSourceEqualsTargetError', () => {
    it.each([
      ['Source and target language are equal.'],
      ['source and target language are equal'],
      ['Bad request: Source and target language are equal.'],
    ])('recognises %s', (message) => {
      expect(isSourceEqualsTargetError(message)).toBe(true);
    });

    it.each([
      ['Unsupported file type'],
      ['Document is too large'],
      [''],
      [undefined],
    ])('does not swallow %s', (message) => {
      expect(isSourceEqualsTargetError(message)).toBe(false);
    });
  });
});
