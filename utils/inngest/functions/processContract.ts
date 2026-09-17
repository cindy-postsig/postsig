import { NonRetriableError } from 'inngest';
import { inngest } from '../client';
import { createClient } from '@/utils/supabase/service_server';
import { validateDocumentContent } from '@/lib/utils/document-content-validation';
import { getHash } from '@/app/lib/utils';
import { contractStatuses, isLocal } from '@/app/lib/constants';
import { ModelProvider } from '@/constants/types';
import { uploadToOpenAi } from '@/app/lib/actions/openai';
import { insertContract, insertContractDoc } from '@/data/superuser/contracts';
import { handleContractProcessingFailure } from '@/utils/inngest/helpers';
import {
  logProcessingStatusChange,
  logContractUploaded,
} from '@/data/superuser/activities';
import { getCacheService } from '@/app/lib/redis/cache-service';

const processContract = inngest.createFunction(
  {
    id: 'process-contract',
    concurrency: 1,
    retries: 10,
    onFailure: async ({ error, event }) => {
      await handleContractProcessingFailure({ error, event });
    },
    throttle: {
      limit: 1,
      period: isLocal ? '1s' : '2m',
    },
  },
  { event: 'contracts/processcontract' },
  async ({ event, step, logger }) => {
    const {
      fileName,
      modelProvider,
      processType,
      contractId: existingContractId,
    } = event.data;
    const { id: userId, organizationId } = event.user;
    try {
      const cacheService = await getCacheService();
      const hash = getHash(
        `${userId}-${organizationId}-${fileName}-${modelProvider}-${processType}`,
      );
      const filePath = `${userId}/${fileName}`;

      // The contracts pipeline treats every uploaded file as a PDF. Confirm the
      // bytes back that before a contract record exists for the file or it is
      // handed to the model - the declared type comes from the upload request,
      // so it is a claim rather than a fact.
      //
      // Files arriving from the ZIP flow carry a contractId and were already
      // validated during extraction, so they are not re-downloaded here.
      if (!existingContractId) {
        await step.run(`check-file-content:${hash}`, async () => {
          const supabase = createClient();
          const { data, error } = await supabase.storage
            .from('contract_docs')
            .download(filePath);
          if (error || !data) {
            throw new Error(`Failed to download ${filePath} for validation`);
          }

          const bytes = new Uint8Array(await data.arrayBuffer());
          const validation = await validateDocumentContent(
            'application/pdf',
            bytes,
          );
          if (!validation.accepted) {
            logger.warn(
              {
                fileName,
                filePath,
                sniffedFileType: validation.sniffedMimeType,
              },
              'Rejecting contract whose content is not a PDF',
            );
            throw new NonRetriableError(
              `Unsupported file type: ${validation.sniffedMimeType ?? 'unknown'}`,
            );
          }
          return true;
        });
      }

      const openAiFile = await step.run(
        `upload-to-openai:${hash}`,
        async () => {
          if (modelProvider === ModelProvider.openai) {
            return uploadToOpenAi(filePath);
          }
          return { id: null };
        },
      );

      // If contractId was provided (from ZIP flow), skip record creation steps
      let contractId: number;

      if (existingContractId) {
        contractId = existingContractId;
      } else {
        const insertContractData = await step.run(
          `insert-contract:${hash}`,
          async () => {
            return insertContract({
              updated_at: new Date().toISOString(),
              open_ai_file_id: openAiFile.id,
              status_id: contractStatuses.uploaded,
              user_id: userId,
              organization_id: organizationId,
            });
          },
        );
        contractId = insertContractData[0].id;
        await step.run(`log-contract-uploaded:${hash}`, async () => {
          return logContractUploaded({
            contractId,
            fileName: fileName,
            changedBy: userId,
            userId,
          });
        });
        await step.run(`log-contract-status:${hash}`, async () => {
          return logProcessingStatusChange({
            contractId,
            newStatusId: contractStatuses.uploaded,
            changedBy: userId,
          });
        });
        await step.run(`insert-contract-document:${hash}`, async () => {
          return insertContractDoc({
            file_path: filePath,
            updated_at: new Date().toISOString(),
            contract_id: contractId,
            user_id: userId,
          });
        });
      }

      // await step.sendEvent(`contracts/extractcontracttext:${hash}`, {
      //   name: 'contracts/extractcontracttext',
      //   data: {
      //     fileName,
      //     modelProvider,
      //     contractId,
      //   },
      //   user: {
      //     id: userId,
      //     organizationId,
      //   },
      // });
      // Translation and extraction run in parallel: extraction always reads the
      // original upload, so it never waits on language detection or DeepL.
      await step.sendEvent(`contracts/translate-document:${hash}`, {
        name: 'contracts/translate-document',
        data: {
          fileName,
          contractId,
        },
        user: {
          id: userId,
          organizationId,
        },
      });
      await step.sendEvent(`contracts/extractcontract:${hash}`, {
        name: 'contracts/extractcontract',
        data: {
          fileName,
          fileId: openAiFile.id,
          contractId,
          modelProvider,
        },
        user: {
          id: userId,
          organizationId,
        },
      });
      await cacheService.invalidateOrganizationData({
        organizationId,
      });
      await cacheService.invalidateVendorList({
        userId,
        organizationId,
      });
      const body = {
        userId,
        organizationId,
        fileName,
      };
      logger.info(body);
      return { event, body };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        organizationId,
        fileName,
      });
      throw error;
    }
  },
);

export default processContract;
