import { inngest } from '../client';
import { getHash, calculateResults } from '@/app/lib/utils';
import { handleContractProcessingFailure } from '@/utils/inngest/helpers';
import { processMetadata } from '@/app/lib/actions/contract-processing';
import { ModelProvider } from '@/constants/types';

const processContractMetadata = inngest.createFunction(
  {
    id: 'process-contract-metadata',
    concurrency: 1,
    priority: { run: '30' },
    retries: 10,
    onFailure: async ({ error, event }) => {
      await handleContractProcessingFailure({ error, event });
    },
  },
  { event: 'contracts/processcontractmetadata' },
  async ({ event, step, logger }) => {
    const {
      fileName,
      fileId,
      contractId,
      modelProvider,
      columns,
      parentJsonField,
    } = event.data;
    const { id: userId, organizationId } = event.user;
    const filePath = `${userId}/${fileName}`;
    try {
      if ((modelProvider === ModelProvider.openai && !fileId) || !contractId) {
        logger.error({
          userId,
          organizationId,
          fileId,
          contractId,
        });
        return { event, body: {} };
      }
      const hash = getHash(
        `${userId}-${organizationId}-${fileId}-${contractId}`,
      );
      const metadataResult = await step.run(
        `process-contract-metadata:${hash}`,
        async () => {
          return await processMetadata({
            filePath,
            fileId,
            contractId,
            userId,
            logger,
            organizationId,
            columns,
            parentJsonField,
            processor: modelProvider,
          });
        },
      );
      const body = {
        userId,
        organizationId,
        fileId,
        contractId,
        ...calculateResults([metadataResult]),
      };
      logger.info(body);
      return { event, body };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        organizationId,
        fileId,
        contractId,
      });
      throw error;
    }
  },
);

export default processContractMetadata;
