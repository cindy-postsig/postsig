const mockDetectDocumentLanguage = jest.fn();
const mockUploadDocument = jest.fn();
const mockGetDocumentStatus = jest.fn();
const mockDownloadDocument = jest.fn();
const mockCreateServiceClient = jest.fn();
const mockLogAlert = jest.fn();
const mockLogDocumentTranslated = jest.fn();
const mockLogDocumentTranslationQuotaExceeded = jest.fn();

jest.mock('@/lib/translation/detectLanguage', () => ({
  detectDocumentLanguage: (...args: unknown[]) =>
    mockDetectDocumentLanguage(...args),
}));

jest.mock('@/lib/translation/deepl', () => ({
  uploadDocument: (...args: unknown[]) => mockUploadDocument(...args),
  getDocumentStatus: (...args: unknown[]) => mockGetDocumentStatus(...args),
  downloadDocument: (...args: unknown[]) => mockDownloadDocument(...args),
  isSourceEqualsTargetError: jest.requireActual('@/lib/translation/deepl')
    .isSourceEqualsTargetError,
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => mockCreateServiceClient(),
}));

jest.mock('@/utils/logging/alert', () => ({
  logAlert: (...args: unknown[]) => mockLogAlert(...args),
}));

jest.mock('@/data/superuser/activities', () => ({
  logDocumentTranslated: (...args: unknown[]) =>
    mockLogDocumentTranslated(...args),
  logDocumentTranslationQuotaExceeded: (...args: unknown[]) =>
    mockLogDocumentTranslationQuotaExceeded(...args),
}));

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

let capturedHandler: any;
let capturedConfig: any;

jest.mock('../../client', () => ({
  inngest: {
    createFunction: jest.fn((config: any, _trigger: any, handler: any) => {
      capturedConfig = config;
      capturedHandler = handler;
      return { handler };
    }),
  },
}));

require('../translateContractDocument');

import { ExternalServiceQuotaError } from '@/lib/errors';
import { NonRetriableError } from 'inngest';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ORG_ID = 'org-1';

function createSupabaseMock({
  matchedRows = 1,
}: { matchedRows?: number } = {}) {
  const updates: Record<string, unknown>[] = [];
  const uploads: { path: string; options: unknown }[] = [];

  const docsQuery: any = {
    update: jest.fn((payload: Record<string, unknown>) => {
      updates.push(payload);
      return docsQuery;
    }),
    eq: jest.fn(() => docsQuery),
    then: (resolve: (value: { error: null; count: number }) => unknown) =>
      resolve({ error: null, count: matchedRows }),
  };

  const client = {
    from: jest.fn((table: string) => {
      if (table === 'contract_docs') return docsQuery;
      throw new Error(`Unexpected table ${table}`);
    }),
    storage: {
      from: jest.fn(() => ({
        download: jest.fn(async () => ({
          data: { arrayBuffer: async () => new TextEncoder().encode('pdf') },
          error: null,
        })),
        upload: jest.fn(
          async (path: string, _file: Buffer, options: unknown) => {
            uploads.push({ path, options });
            return { error: null };
          },
        ),
      })),
    },
  };

  return { client, updates, uploads };
}

function createStep() {
  return {
    run: jest.fn(async (_id: string, fn: () => Promise<unknown>) => {
      // Inngest memoises step output as JSON: a step returning nothing reads back
      // as null on replay.
      const result = await fn();
      return result === undefined ? null : result;
    }),
    sleep: jest.fn(async () => undefined),
    sendEvent: jest.fn(async () => undefined),
  };
}

const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };

const event = {
  data: {
    fileName: 'berenberg.pdf',
    contractId: 42,
  },
  user: { id: USER_ID, organizationId: ORG_ID },
};

describe('translateContractDocument', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records the language without translating when the document is English', async () => {
    const { client, updates } = createSupabaseMock();
    mockCreateServiceClient.mockReturnValue(client);
    mockDetectDocumentLanguage.mockResolvedValue({
      languageCode: 'en',
      confidence: 'high',
      needsTranslation: false,
    });
    const step = createStep();

    const result = await capturedHandler({ event, step, logger });

    expect(updates).toEqual([{ language: 'en' }]);
    expect(mockUploadDocument).not.toHaveBeenCalled();
    expect(result).toEqual({
      contractId: 42,
      language: 'en',
      translated: false,
    });
  });

  it('translates an English-majority document carrying foreign clauses', async () => {
    const { client, updates } = createSupabaseMock();
    mockCreateServiceClient.mockReturnValue(client);
    // Detection records the majority language but still asks for a run; the
    // handler must obey `needsTranslation` rather than re-reading the code.
    mockDetectDocumentLanguage.mockResolvedValue({
      languageCode: 'en',
      confidence: 'high',
      needsTranslation: true,
      sourceLanguage: 'de',
    });
    mockUploadDocument.mockResolvedValue({
      documentId: 'doc-1',
      documentKey: 'key-1',
    });
    mockGetDocumentStatus.mockResolvedValue({
      status: 'done',
      billedCharacters: 5000,
    });
    mockDownloadDocument.mockResolvedValue(Buffer.from('translated'));
    const step = createStep();

    const result = await capturedHandler({ event, step, logger });

    // The row keeps the majority language while DeepL is told to read the file
    // as German; auto-detection would see English and reject it.
    expect(mockUploadDocument).toHaveBeenCalledWith(
      expect.any(Buffer),
      'berenberg.pdf',
      'EN-US',
      'de',
    );
    expect(updates).toEqual([
      { language: 'en' },
      { translated_file_path: `${USER_ID}/berenberg.en.pdf` },
    ]);
    expect(result).toEqual({
      contractId: 42,
      language: 'en',
      translated: true,
    });
  });

  it('translates when the language could not be determined', async () => {
    const { client } = createSupabaseMock();
    mockCreateServiceClient.mockReturnValue(client);
    mockDetectDocumentLanguage.mockResolvedValue({
      languageCode: 'und',
      confidence: 'low',
      needsTranslation: true,
    });
    mockUploadDocument.mockResolvedValue({
      documentId: 'doc-1',
      documentKey: 'key-1',
    });
    mockGetDocumentStatus.mockResolvedValue({
      status: 'done',
      billedCharacters: 5000,
    });
    mockDownloadDocument.mockResolvedValue(Buffer.from('translated'));
    const step = createStep();

    await capturedHandler({ event, step, logger });

    expect(mockUploadDocument).toHaveBeenCalled();
  });

  it('translates a German document and stores the rendition', async () => {
    const { client, updates, uploads } = createSupabaseMock();
    mockCreateServiceClient.mockReturnValue(client);
    mockDetectDocumentLanguage.mockResolvedValue({
      languageCode: 'de',
      confidence: 'high',
      needsTranslation: true,
      sourceLanguage: 'de',
    });
    mockUploadDocument.mockResolvedValue({
      documentId: 'doc-1',
      documentKey: 'key-1',
    });
    mockGetDocumentStatus
      .mockResolvedValueOnce({ status: 'translating' })
      .mockResolvedValueOnce({ status: 'done', billedCharacters: 5000 });
    mockDownloadDocument.mockResolvedValue(Buffer.from('translated'));
    const step = createStep();

    const result = await capturedHandler({ event, step, logger });

    expect(updates).toEqual([
      { language: 'de' },
      { translated_file_path: `${USER_ID}/berenberg.en.pdf` },
    ]);
    expect(uploads).toEqual([
      {
        path: `${USER_ID}/berenberg.en.pdf`,
        options: { contentType: 'application/pdf', upsert: true },
      },
    ]);
    // Leaving DeepL to auto-detect is what made it read mixed files as English
    // and refuse the job, so the detected source has to reach the upload.
    expect(mockUploadDocument).toHaveBeenCalledWith(
      expect.any(Buffer),
      'berenberg.pdf',
      'EN-US',
      'de',
    );
    // Polled until done rather than assuming the first poll succeeds.
    expect(mockGetDocumentStatus).toHaveBeenCalledTimes(2);
    // Extraction runs in parallel off the original upload; translating must not
    // feed or re-trigger it.
    expect(step.sendEvent).not.toHaveBeenCalled();
    expect(result).toEqual({
      contractId: 42,
      language: 'de',
      translated: true,
    });
    // The billed character count only ever appears on the final `done` poll;
    // without it there is no data to size the DeepL cap from.
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 42, billedCharacters: 5000 }),
      'Document translated and stored',
    );
    // The log line is for monitors; the activities row is what the contract
    // timeline shows and what the cap can be sized from in SQL.
    expect(mockLogDocumentTranslated).toHaveBeenCalledWith({
      contractId: 42,
      fileName: 'berenberg.pdf',
      language: 'de',
      translatedPath: `${USER_ID}/berenberg.en.pdf`,
      billedCharacters: 5000,
      userId: USER_ID,
    });
  });

  it('fails without retrying and alerts when the DeepL allowance is spent', async () => {
    const { client } = createSupabaseMock();
    mockCreateServiceClient.mockReturnValue(client);
    mockDetectDocumentLanguage.mockResolvedValue({
      languageCode: 'de',
      confidence: 'high',
      needsTranslation: true,
    });
    mockUploadDocument.mockRejectedValue(
      new ExternalServiceQuotaError(
        'deepl',
        'Failed to upload document to DeepL: 456 Bad Request - Quota for this billing period has been exceeded',
      ),
    );
    const step = createStep();

    await expect(capturedHandler({ event, step, logger })).rejects.toThrow(
      NonRetriableError,
    );

    expect(mockLogAlert).toHaveBeenCalledWith(
      'contract-translation-quota-exceeded',
      expect.any(ExternalServiceQuotaError),
      expect.objectContaining({
        contractId: 42,
        fileName: 'berenberg.pdf',
        userId: USER_ID,
        organizationId: ORG_ID,
      }),
      expect.any(String),
    );
    expect(mockLogDocumentTranslationQuotaExceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: 42,
        fileName: 'berenberg.pdf',
        language: 'de',
        service: 'deepl',
        userId: USER_ID,
      }),
    );
    // Nothing was uploaded, so there is no document to poll for or download.
    expect(mockGetDocumentStatus).not.toHaveBeenCalled();
    expect(mockDownloadDocument).not.toHaveBeenCalled();
  });

  it('leaves a transient upload failure retriable', async () => {
    const { client } = createSupabaseMock();
    mockCreateServiceClient.mockReturnValue(client);
    mockDetectDocumentLanguage.mockResolvedValue({
      languageCode: 'de',
      confidence: 'high',
      needsTranslation: true,
    });
    mockUploadDocument.mockRejectedValue(new Error('DeepL is unavailable'));
    const step = createStep();

    const error = await capturedHandler({ event, step, logger }).catch(
      (caught: unknown) => caught,
    );

    // Converting this would spend the function's retries on a failure that a
    // retry could clear.
    expect(error).not.toBeInstanceOf(NonRetriableError);
    expect(error).toEqual(new Error('DeepL is unavailable'));
    expect(mockLogAlert).not.toHaveBeenCalled();
    expect(mockLogDocumentTranslationQuotaExceeded).not.toHaveBeenCalled();
  });

  it('fails without retrying when DeepL reports a translation error', async () => {
    const { client } = createSupabaseMock();
    mockCreateServiceClient.mockReturnValue(client);
    mockDetectDocumentLanguage.mockResolvedValue({
      languageCode: 'de',
      confidence: 'high',
      needsTranslation: true,
    });
    mockUploadDocument.mockResolvedValue({
      documentId: 'doc-1',
      documentKey: 'key-1',
    });
    mockGetDocumentStatus.mockResolvedValue({
      status: 'error',
      errorMessage: 'Unsupported file type',
    });
    const step = createStep();

    await expect(capturedHandler({ event, step, logger })).rejects.toThrow(
      /Unsupported file type/,
    );
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it('finishes cleanly when DeepL reads the document as already English', async () => {
    const { client, updates, uploads } = createSupabaseMock();
    mockCreateServiceClient.mockReturnValue(client);
    // Our detection said translate; DeepL reads one source language for the
    // whole file and disagrees. Its verdict is not a failure.
    mockDetectDocumentLanguage.mockResolvedValue({
      languageCode: 'en',
      confidence: 'high',
      needsTranslation: true,
    });
    mockUploadDocument.mockResolvedValue({
      documentId: 'doc-1',
      documentKey: 'key-1',
    });
    mockGetDocumentStatus.mockResolvedValue({
      status: 'error',
      errorMessage: 'Source and target language are equal.',
    });
    const step = createStep();

    const result = await capturedHandler({ event, step, logger });

    expect(result).toEqual({
      contractId: 42,
      language: 'en',
      translated: false,
    });
    // Nothing was produced, so nothing may be recorded as a translation.
    expect(mockDownloadDocument).not.toHaveBeenCalled();
    expect(uploads).toEqual([]);
    expect(updates).toEqual([{ language: 'en' }]);
    expect(mockLogDocumentTranslated).not.toHaveBeenCalled();
    expect(mockLogAlert).not.toHaveBeenCalled();
  });

  it('fails when the translation never finishes within the poll budget', async () => {
    const { client } = createSupabaseMock();
    mockCreateServiceClient.mockReturnValue(client);
    mockDetectDocumentLanguage.mockResolvedValue({
      languageCode: 'de',
      confidence: 'high',
      needsTranslation: true,
    });
    mockUploadDocument.mockResolvedValue({
      documentId: 'doc-1',
      documentKey: 'key-1',
    });
    mockGetDocumentStatus.mockResolvedValue({ status: 'translating' });
    const step = createStep();

    await expect(capturedHandler({ event, step, logger })).rejects.toThrow(
      /did not finish translating/,
    );
    expect(mockDownloadDocument).not.toHaveBeenCalled();
  });

  it('fails loudly when no contract_docs row matches', async () => {
    // PostgREST reports no error for a filter that matches nothing, so without
    // the row-count check the language would silently never be written.
    const { client } = createSupabaseMock({ matchedRows: 0 });
    mockCreateServiceClient.mockReturnValue(client);
    mockDetectDocumentLanguage.mockResolvedValue({
      languageCode: 'de',
      confidence: 'high',
      needsTranslation: true,
    });
    const step = createStep();

    await expect(capturedHandler({ event, step, logger })).rejects.toThrow(
      /No contract_docs row matched contract 42/,
    );
    expect(mockUploadDocument).not.toHaveBeenCalled();
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it('rejects a traversing file name without calling out to Gemini', async () => {
    const step = createStep();

    await expect(
      capturedHandler({
        event: { ...event, data: { ...event.data, fileName: '../escape.pdf' } },
        step,
        logger,
      }),
    ).rejects.toThrow('Invalid file path');
    expect(mockDetectDocumentLanguage).not.toHaveBeenCalled();
  });

  describe('onFailure', () => {
    const failureEvent = {
      data: {
        event: {
          name: 'contracts/translate-document',
          data: {
            fileName: 'berenberg.pdf',
            contractId: 42,
          },
          user: { id: USER_ID, organizationId: ORG_ID },
        },
        run_id: 'run-1',
      },
    };

    it('alerts without touching the contract or the extraction pipeline', async () => {
      // Extraction reads the original document independently, so a translation
      // failure must not be recorded as a contract processing failure.
      await capturedConfig.onFailure({
        error: new Error('DeepL down'),
        event: failureEvent,
      });

      expect(mockLogAlert).toHaveBeenCalledWith(
        'contract-translation-failure',
        expect.any(Error),
        expect.objectContaining({
          contractId: 42,
          fileName: 'berenberg.pdf',
          userId: USER_ID,
          organizationId: ORG_ID,
          runId: 'run-1',
        }),
        expect.any(String),
      );
    });

    it('still alerts when a replayed event carries no actor context', async () => {
      await capturedConfig.onFailure({
        error: new Error('DeepL down'),
        event: {
          data: {
            event: {
              name: 'contracts/translate-document',
              data: { fileName: 'berenberg.pdf', contractId: 42 },
            },
            run_id: 'run-2',
          },
        },
      });

      expect(mockLogAlert).toHaveBeenCalledWith(
        'contract-translation-failure',
        expect.any(Error),
        expect.objectContaining({ contractId: 42, userId: undefined }),
        expect.any(String),
      );
    });
  });
});

export {};
