import { NonRetriableError } from 'inngest';
import { inngest } from '../client';
import { createClient } from '@/utils/supabase/service_server';
import { getHash } from '@/app/lib/utils';
import { buildSafePath, PathTraversalError } from '@/utils/helpers';
import { logAlert } from '@/utils/logging/alert';
import {
  logDocumentTranslated,
  logDocumentTranslationQuotaExceeded,
} from '@/data/superuser/activities';
import { ExternalServiceQuotaError } from '@/lib/errors';
import { detectDocumentLanguage } from '@/lib/translation/detectLanguage';
import {
  uploadDocument,
  getDocumentStatus,
  downloadDocument,
  isSourceEqualsTargetError,
  DocumentHandle,
} from '@/lib/translation/deepl';
import { translatedFileName } from '@/lib/translation/paths';

/**
 * Detects an uploaded contract document's language and, when any of its body
 * text is not English, translates it with DeepL and stores the English
 * rendition alongside the original, recording `language` and
 * `translated_file_path` on the `contract_docs` row. A document whose majority
 * language is English still translates when it carries foreign-language
 * clauses, so `language` on the row is not a reliable signal for whether a
 * translation exists — `translated_file_path` is.
 *
 * This runs in parallel with `contracts/extractcontract`, which always reads
 * the original upload — the translation is stored for later use and never feeds
 * extraction. Failing to translate therefore leaves extraction untouched, so
 * `onFailure` only alerts.
 */

/** DeepL target code. `EN-US` avoids the deprecated bare `EN` target. */
const TARGET_LANGUAGE = 'EN-US';
const POLL_INTERVAL = '15s';
const POLL_ATTEMPTS = 20;

const translateContractDocument = inngest.createFunction(
  {
    id: 'translate-contract-document',
    concurrency: 1,
    retries: 2,
    onFailure: async ({ error, event }) => {
      const originalEvent = event.data.event;
      const { fileName, contractId } = originalEvent.data ?? {};
      const { id: userId, organizationId } = originalEvent.user ?? {};

      logAlert(
        'contract-translation-failure',
        error,
        {
          contractId,
          fileName,
          userId,
          organizationId,
          runId: event.data.run_id,
        },
        'Contract translation failed; extraction of the original document is unaffected',
      );
    },
  },
  { event: 'contracts/translate-document' },
  async ({ event, step, logger }) => {
    const { fileName, contractId } = event.data;
    const { id: userId, organizationId } = event.user;
    const hash = getHash(`${userId}-${organizationId}-${contractId}`);

    let filePath: string;
    try {
      filePath = buildSafePath([userId, fileName]);
    } catch (error) {
      if (error instanceof PathTraversalError) {
        throw new NonRetriableError('Invalid file path');
      }
      throw error;
    }

    const detected = await step.run(`detect-language:${hash}`, async () => {
      const result = await detectDocumentLanguage(filePath);

      const supabase = createClient();
      const { error, count } = await supabase
        .from('contract_docs')
        .update({ language: result.languageCode }, { count: 'exact' })
        .eq('contract_id', contractId)
        .eq('file_path', filePath);
      if (error) {
        throw error;
      }
      if (!count) {
        throw new NonRetriableError(
          `No contract_docs row matched contract ${contractId} at ${filePath}`,
        );
      }
      return result;
    });

    if (!detected.needsTranslation) {
      logger.info(
        { contractId, fileName, language: detected.languageCode },
        'Document needs no translation',
      );
      return { contractId, language: detected.languageCode, translated: false };
    }

    const handle: DocumentHandle = await step.run(
      `upload-to-deepl:${hash}`,
      async () => {
        const supabase = createClient();
        const { data, error } = await supabase.storage
          .from('contract_docs')
          .download(filePath);
        if (error) {
          throw error;
        }
        try {
          return await uploadDocument(
            Buffer.from(await data.arrayBuffer()),
            fileName,
            TARGET_LANGUAGE,
            detected.sourceLanguage,
          );
        } catch (uploadError) {
          if (uploadError instanceof ExternalServiceQuotaError) {
            logAlert(
              'contract-translation-quota-exceeded',
              uploadError,
              {
                contractId,
                fileName,
                userId,
                organizationId,
                service: 'deepl',
              },
              'Translation service character allowance is exhausted; contracts will stay untranslated until it is raised or resets',
            );
            await logDocumentTranslationQuotaExceeded({
              contractId,
              fileName,
              language: detected.languageCode,
              service: uploadError.service,
              reason: uploadError.message,
              userId,
            });
            throw new NonRetriableError(
              `Translation service rejected the upload because its character allowance is exhausted: ${uploadError.message}`,
            );
          }
          throw uploadError;
        }
      },
    );

    let translated = false;
    // DeepL bills the document by characters and reports the count only on the
    // final `done` poll; recording it is what makes future cap sizing possible.
    let billedCharacters: number | undefined;
    for (
      let attempt = 0;
      attempt < POLL_ATTEMPTS && !translated;
      attempt += 1
    ) {
      await step.sleep(`await-translation-${attempt}:${hash}`, POLL_INTERVAL);
      const status = await step.run(
        `translation-status-${attempt}:${hash}`,
        async () => getDocumentStatus(handle),
      );
      if (status.status === 'error') {
        if (isSourceEqualsTargetError(status.errorMessage)) {
          logger.info(
            { contractId, fileName, language: detected.languageCode },
            'Translation service found nothing to translate; it read the document as already English',
          );
          return {
            contractId,
            language: detected.languageCode,
            translated: false,
          };
        }
        throw new NonRetriableError(
          `Translation service failed to translate the document: ${
            status.errorMessage ?? 'no reason given'
          }`,
        );
      }
      translated = status.status === 'done';
      if (translated) {
        billedCharacters = status.billedCharacters;
      }
    }

    if (!translated) {
      throw new NonRetriableError(
        `Translation service did not finish translating within ${POLL_ATTEMPTS} polls`,
      );
    }

    const translatedName = translatedFileName(fileName);
    const translatedPath = await step.run(
      `store-translation:${hash}`,
      async () => {
        const safePath = buildSafePath([userId, translatedName]);
        const file = await downloadDocument(handle);

        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from('contract_docs')
          .upload(safePath, file, {
            contentType: 'application/pdf',
            upsert: true,
          });
        if (uploadError) {
          throw uploadError;
        }

        const { error: updateError, count } = await supabase
          .from('contract_docs')
          .update({ translated_file_path: safePath }, { count: 'exact' })
          .eq('contract_id', contractId)
          .eq('file_path', filePath);
        if (updateError) {
          throw updateError;
        }
        if (!count) {
          throw new NonRetriableError(
            `No contract_docs row matched contract ${contractId} at ${filePath}`,
          );
        }
        return safePath;
      },
    );

    await step.run(`log-document-translated:${hash}`, async () =>
      logDocumentTranslated({
        contractId,
        fileName,
        language: detected.languageCode,
        translatedPath,
        billedCharacters,
        userId,
      }),
    );

    logger.info(
      {
        contractId,
        fileName,
        language: detected.languageCode,
        translatedPath,
        billedCharacters,
      },
      'Document translated and stored',
    );

    return { contractId, language: detected.languageCode, translated: true };
  },
);

export default translateContractDocument;
