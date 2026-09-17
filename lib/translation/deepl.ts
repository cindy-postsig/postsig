import { ExternalServiceError, ExternalServiceQuotaError } from '@/lib/errors';

const SERVICE = 'deepl';
const DEFAULT_API_HOST = 'https://api.deepl.com';
const REQUEST_TIMEOUT_MS = 60_000;

/** DeepL's non-standard code for "character allowance for this period is spent". */
const QUOTA_EXCEEDED_STATUS = 456;

export interface DocumentHandle {
  documentId: string;
  documentKey: string;
}

export type DocumentTranslationStatus =
  | 'queued'
  | 'translating'
  | 'done'
  | 'error';

export interface DocumentStatus {
  status: DocumentTranslationStatus;
  billedCharacters?: number;
  secondsRemaining?: number;
  errorMessage?: string;
}

const apiHost = (): string => process.env.DEEPL_API_HOST || DEFAULT_API_HOST;

const authHeader = (): string => {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    throw new ExternalServiceError(SERVICE, 'DEEPL_API_KEY is not configured');
  }
  return `DeepL-Auth-Key ${apiKey}`;
};

const DOCUMENT_STATUSES: DocumentTranslationStatus[] = [
  'queued',
  'translating',
  'done',
  'error',
];

/**
 * A status outside the documented set cannot be reasoned about: treating it as
 * "not done yet" would burn the whole polling budget before failing.
 */
const assertKnownStatus = (status: unknown): DocumentTranslationStatus => {
  if (
    typeof status === 'string' &&
    (DOCUMENT_STATUSES as string[]).includes(status)
  ) {
    return status as DocumentTranslationStatus;
  }
  throw new ExternalServiceError(
    SERVICE,
    `Unrecognised DeepL document status: ${JSON.stringify(status)}`,
  );
};

/**
 * A spent allowance is terminal for the billing period, so it is raised as a
 * distinct type: callers convert it into a non-retriable failure instead of
 * burning retries on a call that cannot succeed.
 */
const assertOk = async (response: Response, action: string): Promise<void> => {
  if (response.ok) {
    return;
  }
  const body = await response.text().catch(() => '');
  const ErrorClass =
    response.status === QUOTA_EXCEEDED_STATUS
      ? ExternalServiceQuotaError
      : ExternalServiceError;
  throw new ErrorClass(
    SERVICE,
    `Failed to ${action}: ${response.status} ${response.statusText}${
      body ? ` - ${body}` : ''
    }`,
  );
};

/**
 * Uploads a document for translation. `targetLanguage` uses DeepL's target
 * codes (e.g. `EN-US`).
 *
 * `sourceLanguage` is optional and auto-detected when omitted, but omitting it
 * on a document that carries any English at all is what makes DeepL read the
 * file as English and refuse the job. Pass the foreign language whenever it is
 * known.
 */
export const uploadDocument = async (
  file: Buffer,
  fileName: string,
  targetLanguage: string,
  sourceLanguage?: string | null,
): Promise<DocumentHandle> => {
  const form = new FormData();
  form.append('target_lang', targetLanguage);
  if (sourceLanguage) {
    form.append('source_lang', sourceLanguage.toUpperCase());
  }
  form.append('file', new Blob([new Uint8Array(file)]), fileName);

  const response = await fetch(`${apiHost()}/v2/document`, {
    method: 'POST',
    headers: { Authorization: authHeader() },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  await assertOk(response, 'upload document to DeepL');

  const data = await response.json();
  if (!data?.document_id || !data?.document_key) {
    throw new ExternalServiceError(
      SERVICE,
      'DeepL upload response is missing document_id or document_key',
    );
  }
  return { documentId: data.document_id, documentKey: data.document_key };
};

/**
 * DeepL rejects a document whose own detected source language already matches
 * the target instead of returning it unchanged. That is a verdict about the
 * document — there is nothing to translate — rather than a service failure, and
 * its detection can disagree with ours: it reads one source language for the
 * whole file, so a document of mostly-English body text lands here even when
 * ours flagged foreign clauses inside it. The status carries no structured
 * code, so the message is the only signal available.
 */
const SOURCE_EQUALS_TARGET = /source and target language are equal/i;

export const isSourceEqualsTargetError = (message?: string): boolean =>
  typeof message === 'string' && SOURCE_EQUALS_TARGET.test(message);

/** Polls translation progress for an uploaded document. */
export const getDocumentStatus = async (
  handle: DocumentHandle,
): Promise<DocumentStatus> => {
  const response = await fetch(
    `${apiHost()}/v2/document/${handle.documentId}`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ document_key: handle.documentKey }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  await assertOk(response, 'read DeepL document status');

  const data = await response.json();
  return {
    status: assertKnownStatus(data.status),
    billedCharacters: data.billed_characters,
    secondsRemaining: data.seconds_remaining,
    errorMessage: data.error_message,
  };
};

/**
 * Downloads a completed translation. Only valid once the status is `done`;
 * DeepL discards the result after the first successful download.
 */
export const downloadDocument = async (
  handle: DocumentHandle,
): Promise<Buffer> => {
  const response = await fetch(
    `${apiHost()}/v2/document/${handle.documentId}/result`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ document_key: handle.documentKey }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  await assertOk(response, 'download translated document from DeepL');

  return Buffer.from(await response.arrayBuffer());
};
