import {
  abortAllActiveUploads,
  buildTusHeaders,
  buildTusMetadata,
  buildTusOptions,
  isActiveUpload,
  isNetworkError,
  isSessionExpired,
  registerActiveUpload,
  SessionExpiredError,
  TUS_CHUNK_SIZE,
  unregisterActiveUpload,
} from '@/lib/upload/tus-upload';
import { DetailedError, Upload } from 'tus-js-client';

const MOCK_SUPABASE_URL = 'https://test.supabase.co';
const VALID_ACCESS_TOKEN = 'header.payload.signature';
const REFRESHED_ACCESS_TOKEN = 'refreshed.payload.signature';

function makeDetailedError(
  message: string,
  causingError: Error | null = null,
  originalResponse: { getStatus: () => number } | null = null,
): DetailedError {
  const err = new DetailedError(message);
  if (causingError) {
    (err as unknown as Record<string, unknown>).causingError = causingError;
  }
  if (originalResponse) {
    (err as unknown as Record<string, unknown>).originalResponse =
      originalResponse;
  }
  return err;
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = MOCK_SUPABASE_URL;
});

describe('tus-upload', () => {
  describe('TUS_CHUNK_SIZE', () => {
    it('is 6 MB', () => {
      expect(TUS_CHUNK_SIZE).toBe(6 * 1024 * 1024);
    });
  });

  describe('buildTusHeaders', () => {
    it('includes x-upsert and not authorization (set per-request by onBeforeRequest)', () => {
      const headers = buildTusHeaders(VALID_ACCESS_TOKEN);
      expect(headers).toEqual({
        'x-upsert': 'true',
      });
    });

    it('throws a session error when the access token is not a compact JWS', () => {
      expect(() => buildTusHeaders('sb_publishable_test-key')).toThrow(
        'Upload session is invalid',
      );
    });
  });

  describe('buildTusMetadata', () => {
    it('returns bucket, object, contentType and cacheControl', () => {
      const meta = buildTusMetadata(
        'contract_docs',
        'user-1/file.pdf',
        'application/pdf',
      );
      expect(meta).toEqual({
        bucketName: 'contract_docs',
        objectName: 'user-1/file.pdf',
        contentType: 'application/pdf',
        cacheControl: '3600',
      });
    });

    it('handles zip content type', () => {
      const meta = buildTusMetadata(
        'documents',
        'org-1/bulk/archive.zip',
        'application/zip',
      );
      expect(meta.bucketName).toBe('documents');
      expect(meta.contentType).toBe('application/zip');
    });
  });

  describe('buildTusOptions', () => {
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    const callbacks = {
      onError: jest.fn(),
      onProgress: jest.fn(),
      onChunkComplete: jest.fn(),
      onSuccess: jest.fn(),
    };

    it('omits authorization from static headers when getToken is omitted', () => {
      const opts = buildTusOptions(
        file,
        'contract_docs',
        'user-1/test.pdf',
        VALID_ACCESS_TOKEN,
        callbacks,
      );
      expect(opts.headers).toEqual(buildTusHeaders(VALID_ACCESS_TOKEN));
      expect(opts.headers).not.toHaveProperty('authorization');
    });

    it('omits authorization from static headers when getToken is provided', () => {
      const getToken = jest.fn().mockResolvedValue(REFRESHED_ACCESS_TOKEN);
      const opts = buildTusOptions(
        file,
        'contract_docs',
        'user-1/test.pdf',
        VALID_ACCESS_TOKEN,
        callbacks,
        getToken,
      );
      expect(opts.headers).toEqual(buildTusHeaders(VALID_ACCESS_TOKEN));
      expect(opts.headers).not.toHaveProperty('authorization');
    });

    it('constructs valid TUS options', () => {
      const opts = buildTusOptions(
        file,
        'contract_docs',
        'user-1/test.pdf',
        VALID_ACCESS_TOKEN,
        callbacks,
      );
      expect(opts.endpoint).toBe(
        `${MOCK_SUPABASE_URL}/storage/v1/upload/resumable`,
      );
      expect(opts.chunkSize).toBe(TUS_CHUNK_SIZE);
      expect(opts.retryDelays).toEqual([0, 3000, 5000, 10000, 30000]);
      expect(opts.uploadDataDuringCreation).toBe(true);
      expect(opts.removeFingerprintOnSuccess).toBe(true);
      expect(opts.metadata).toEqual(
        buildTusMetadata('contract_docs', 'user-1/test.pdf', 'application/pdf'),
      );
    });

    it('delegates onError with humanized message and raw Error', () => {
      const opts = buildTusOptions(
        file,
        'contract_docs',
        'user-1/test.pdf',
        VALID_ACCESS_TOKEN,
        callbacks,
      );
      const raw = new Error('something unexpected');
      opts.onError!(raw);
      expect(callbacks.onError).toHaveBeenCalledWith(
        'Upload failed. Please try again.',
        raw,
      );
    });

    it('delegates onProgress to callback', () => {
      const opts = buildTusOptions(
        file,
        'contract_docs',
        'user-1/test.pdf',
        VALID_ACCESS_TOKEN,
        callbacks,
      );
      opts.onProgress!(500, 1000);
      expect(callbacks.onProgress).toHaveBeenCalledWith(500, 1000);
    });

    it('delegates onChunkComplete to callback', () => {
      const opts = buildTusOptions(
        file,
        'contract_docs',
        'user-1/test.pdf',
        VALID_ACCESS_TOKEN,
        callbacks,
      );
      opts.onChunkComplete!(250, 500, 1000);
      expect(callbacks.onChunkComplete).toHaveBeenCalledWith(250, 500, 1000);
    });

    it('delegates onSuccess to callback', () => {
      const opts = buildTusOptions(
        file,
        'contract_docs',
        'user-1/test.pdf',
        VALID_ACCESS_TOKEN,
        callbacks,
      );
      opts.onSuccess!({ lastResponse: {} as never });
      expect(callbacks.onSuccess).toHaveBeenCalled();
    });

    it('does not set onBeforeRequest when getToken is omitted', () => {
      const opts = buildTusOptions(
        file,
        'contract_docs',
        'user-1/test.pdf',
        VALID_ACCESS_TOKEN,
        callbacks,
      );
      expect(opts.onBeforeRequest).toBeUndefined();
    });

    it('sets onBeforeRequest that refreshes authorization header', async () => {
      const getToken = jest.fn().mockResolvedValue(REFRESHED_ACCESS_TOKEN);
      const opts = buildTusOptions(
        file,
        'contract_docs',
        'user-1/test.pdf',
        VALID_ACCESS_TOKEN,
        callbacks,
        getToken,
      );
      expect(opts.onBeforeRequest).toBeDefined();
      const mockReq = { setHeader: jest.fn() };
      await opts.onBeforeRequest!(mockReq as any);
      expect(getToken).toHaveBeenCalled();
      expect(mockReq.setHeader).toHaveBeenCalledWith(
        'authorization',
        `Bearer ${REFRESHED_ACCESS_TOKEN}`,
      );
    });

    it('throws SessionExpiredError before refreshing with a malformed access token', async () => {
      const getToken = jest.fn().mockResolvedValue('sb_publishable_bad');
      const opts = buildTusOptions(
        file,
        'contract_docs',
        'user-1/test.pdf',
        VALID_ACCESS_TOKEN,
        callbacks,
        getToken,
      );
      const mockReq = { setHeader: jest.fn() };
      await expect(opts.onBeforeRequest!(mockReq as any)).rejects.toThrow(
        'Upload session is invalid',
      );
      expect(mockReq.setHeader).not.toHaveBeenCalled();
    });

    it('throws SessionExpiredError when getToken returns null', async () => {
      const getToken = jest.fn().mockResolvedValue(null);
      const opts = buildTusOptions(
        file,
        'contract_docs',
        'user-1/test.pdf',
        VALID_ACCESS_TOKEN,
        callbacks,
        getToken,
      );
      const mockReq = { setHeader: jest.fn() };
      await expect(opts.onBeforeRequest!(mockReq as any)).rejects.toThrow(
        'session expired',
      );
      expect(mockReq.setHeader).not.toHaveBeenCalled();
    });

    describe('error humanization', () => {
      function makeOpts() {
        return buildTusOptions(
          file,
          'contract_docs',
          'user-1/test.pdf',
          VALID_ACCESS_TOKEN,
          callbacks,
        );
      }

      function mockResponse(status: number) {
        return { getStatus: () => status } as never;
      }

      beforeEach(() => callbacks.onError.mockClear());

      it('returns offline message when navigator.onLine is false', () => {
        const original = navigator.onLine;
        Object.defineProperty(navigator, 'onLine', {
          value: false,
          configurable: true,
        });
        try {
          makeOpts().onError!(new Error('anything'));
          expect(callbacks.onError).toHaveBeenCalledWith(
            expect.stringContaining('offline'),
            expect.any(Error),
          );
        } finally {
          Object.defineProperty(navigator, 'onLine', {
            value: original,
            configurable: true,
          });
        }
      });

      it('returns session expired for 403 DetailedError', () => {
        const err = makeDetailedError(
          'tus: unexpected response',
          null,
          mockResponse(403),
        );
        makeOpts().onError!(err);
        expect(callbacks.onError).toHaveBeenCalledWith(
          expect.stringContaining('session expired'),
          expect.any(Error),
        );
      });

      it('returns session expired for 401 DetailedError', () => {
        const err = makeDetailedError(
          'tus: unexpected response',
          null,
          mockResponse(401),
        );
        makeOpts().onError!(err);
        expect(callbacks.onError).toHaveBeenCalledWith(
          expect.stringContaining('session expired'),
          expect.any(Error),
        );
      });

      it('returns server error for 500+ status', () => {
        const err = makeDetailedError(
          'tus: server error',
          null,
          mockResponse(502),
        );
        makeOpts().onError!(err);
        expect(callbacks.onError).toHaveBeenCalledWith(
          expect.stringContaining('server error'),
          err,
        );
      });

      it('returns file too large for 413 status', () => {
        const err = makeDetailedError(
          'tus: too large',
          null,
          mockResponse(413),
        );
        makeOpts().onError!(err);
        expect(callbacks.onError).toHaveBeenCalledWith(
          expect.stringContaining('too large'),
          err,
        );
      });

      it('returns network message for failed to fetch in causingError', () => {
        const cause = new Error('Failed to fetch');
        const err = makeDetailedError('tus: error', cause);
        makeOpts().onError!(err);
        expect(callbacks.onError).toHaveBeenCalledWith(
          expect.stringContaining('network connection was lost'),
          err,
        );
      });

      it('returns network message for failed to fetch in plain Error', () => {
        const err = new Error('Failed to fetch');
        makeOpts().onError!(err);
        expect(callbacks.onError).toHaveBeenCalledWith(
          expect.stringContaining('network connection was lost'),
          err,
        );
      });

      it('returns generic message for unknown errors', () => {
        const err = new Error('something weird');
        makeOpts().onError!(err);
        expect(callbacks.onError).toHaveBeenCalledWith(
          'Upload failed. Please try again.',
          err,
        );
      });

      it('returns generic failure for JWT/JWS errors without status', () => {
        const err = new Error('tus: unexpected response - Invalid Compact JWS');
        makeOpts().onError!(err);
        expect(callbacks.onError).toHaveBeenCalledWith(
          expect.stringContaining('Upload failed'),
          err,
        );
      });

      it('returns session-expired message for SessionExpiredError', () => {
        makeOpts().onError!(new SessionExpiredError());
        expect(callbacks.onError).toHaveBeenCalledWith(
          expect.stringContaining('session expired'),
          expect.any(Error),
        );
      });

      it('returns session-expired message when DetailedError wraps SessionExpiredError', () => {
        const err = makeDetailedError('wrapped', new SessionExpiredError());
        makeOpts().onError!(err);
        expect(callbacks.onError).toHaveBeenCalledWith(
          expect.stringContaining('session expired'),
          expect.any(Error),
        );
      });

      it('does not report offline for SessionExpiredError when offline', () => {
        Object.defineProperty(navigator, 'onLine', {
          value: false,
          configurable: true,
        });
        try {
          makeOpts().onError!(new SessionExpiredError());
          expect(callbacks.onError).toHaveBeenCalledWith(
            expect.stringContaining('session expired'),
            expect.any(Error),
          );
        } finally {
          Object.defineProperty(navigator, 'onLine', {
            value: true,
            configurable: true,
          });
        }
      });
    });

    describe('onShouldRetry', () => {
      function makeOpts() {
        return buildTusOptions(
          file,
          'contract_docs',
          'user-1/test.pdf',
          VALID_ACCESS_TOKEN,
          callbacks,
        );
      }

      function mockResponse(status: number) {
        return { getStatus: () => status } as never;
      }

      it('is defined in options', () => {
        expect(makeOpts().onShouldRetry).toBeDefined();
      });

      it('retries 400 with JWS in message', () => {
        const err = makeDetailedError(
          'Invalid Compact JWS',
          null,
          mockResponse(400),
        );
        expect(makeOpts().onShouldRetry!(err, 0, makeOpts())).toBe(true);
      });

      it('retries 400 with JWT in message', () => {
        const err = makeDetailedError('JWT expired', null, mockResponse(400));
        expect(makeOpts().onShouldRetry!(err, 0, makeOpts())).toBe(true);
      });

      it('retries 5xx errors', () => {
        const err = makeDetailedError('server error', null, mockResponse(502));
        expect(makeOpts().onShouldRetry!(err, 0, makeOpts())).toBe(true);
      });

      it('retries 409 conflict', () => {
        const err = makeDetailedError('conflict', null, mockResponse(409));
        expect(makeOpts().onShouldRetry!(err, 0, makeOpts())).toBe(true);
      });

      it('does not retry generic 400 without auth keywords', () => {
        const err = makeDetailedError('bad request', null, mockResponse(400));
        expect(makeOpts().onShouldRetry!(err, 0, makeOpts())).toBe(false);
      });

      it('does NOT retry when offline — upload manager handles reconnect', () => {
        Object.defineProperty(navigator, 'onLine', {
          value: false,
          configurable: true,
        });
        try {
          const err = makeDetailedError('bad request', null, mockResponse(400));
          expect(makeOpts().onShouldRetry!(err, 0, makeOpts())).toBe(false);
        } finally {
          Object.defineProperty(navigator, 'onLine', {
            value: true,
            configurable: true,
          });
        }
      });

      it('does NOT retry SessionExpiredError so tus does not restart from 0', () => {
        const err = makeDetailedError('wrapped', new SessionExpiredError());
        expect(makeOpts().onShouldRetry!(err, 0, makeOpts())).toBe(false);
      });

      it('does NOT retry SessionExpiredError even when offline', () => {
        Object.defineProperty(navigator, 'onLine', {
          value: false,
          configurable: true,
        });
        try {
          const err = makeDetailedError('wrapped', new SessionExpiredError());
          expect(makeOpts().onShouldRetry!(err, 0, makeOpts())).toBe(false);
        } finally {
          Object.defineProperty(navigator, 'onLine', {
            value: true,
            configurable: true,
          });
        }
      });

      it('resets the auth retry budget after a successful response', async () => {
        const opts = makeOpts();
        const authErr = makeDetailedError(
          'JWT expired',
          null,
          mockResponse(401),
        );

        expect(opts.onShouldRetry!(authErr, 0, opts)).toBe(true);
        expect(opts.onShouldRetry!(authErr, 1, opts)).toBe(true);

        await opts.onAfterResponse!(
          {} as never,
          { getStatus: () => 204 } as never,
        );

        expect(opts.onShouldRetry!(authErr, 0, opts)).toBe(true);
        expect(opts.onShouldRetry!(authErr, 1, opts)).toBe(true);
      });
    });
  });

  describe('isNetworkError', () => {
    it('returns false for JWS errors', () => {
      expect(isNetworkError(new Error('Invalid Compact JWS'))).toBe(false);
    });

    it('returns false for JWT errors', () => {
      expect(isNetworkError(new Error('JWT claim is expired'))).toBe(false);
    });

    it('returns false for token expired', () => {
      expect(isNetworkError(new Error('token expired'))).toBe(false);
    });

    it('returns false for generic errors', () => {
      expect(isNetworkError(new Error('something else'))).toBe(false);
    });

    it('returns true when offline', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });
      try {
        expect(isNetworkError(new Error('anything'))).toBe(true);
      } finally {
        Object.defineProperty(navigator, 'onLine', {
          value: true,
          configurable: true,
        });
      }
    });
  });

  describe('isSessionExpired', () => {
    it('returns true for SessionExpiredError', () => {
      expect(isSessionExpired(new SessionExpiredError())).toBe(true);
    });

    it('returns true when DetailedError wraps a SessionExpiredError', () => {
      const err = new DetailedError('wrapped');
      (err as unknown as Record<string, unknown>).causingError =
        new SessionExpiredError();
      expect(isSessionExpired(err)).toBe(true);
    });

    it('returns false for plain network errors', () => {
      expect(isSessionExpired(new Error('Failed to fetch'))).toBe(false);
    });

    it('returns false for 401 DetailedError without SessionExpiredError cause', () => {
      const err = new DetailedError('tus: unexpected response');
      (err as unknown as Record<string, unknown>).originalResponse = {
        getStatus: () => 401,
      };
      expect(isSessionExpired(err)).toBe(false);
    });
  });

  describe('active upload registry', () => {
    function makeFakeUpload(): Upload {
      return { abort: jest.fn() } as unknown as Upload;
    }

    afterEach(() => {
      abortAllActiveUploads();
    });

    it('tracks and untracks uploads', () => {
      const u = makeFakeUpload();
      expect(isActiveUpload(u)).toBe(false);
      registerActiveUpload(u);
      expect(isActiveUpload(u)).toBe(true);
      unregisterActiveUpload(u);
      expect(isActiveUpload(u)).toBe(false);
    });

    it('aborts every registered upload and clears the registry', () => {
      const u1 = makeFakeUpload();
      const u2 = makeFakeUpload();
      registerActiveUpload(u1);
      registerActiveUpload(u2);

      abortAllActiveUploads();

      expect(u1.abort).toHaveBeenCalled();
      expect(u2.abort).toHaveBeenCalled();
      expect(isActiveUpload(u1)).toBe(false);
      expect(isActiveUpload(u2)).toBe(false);
    });

    it('swallows abort exceptions so one failing upload does not stop others', () => {
      const u1 = {
        abort: () => {
          throw new Error('boom');
        },
      } as unknown as Upload;
      const u2 = makeFakeUpload();
      registerActiveUpload(u1);
      registerActiveUpload(u2);

      expect(() => abortAllActiveUploads()).not.toThrow();
      expect(u2.abort).toHaveBeenCalled();
    });
  });
});
