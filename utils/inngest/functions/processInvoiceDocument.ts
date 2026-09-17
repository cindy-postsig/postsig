import { inngest } from '../client';
import { getHash } from '@/app/lib/utils';
import { handleContractProcessingFailure } from '@/utils/inngest/helpers';
import { getCacheService } from '@/app/lib/redis/cache-service';

const processInvoiceDocument = inngest.createFunction(
  {
    id: 'process-invoice-document',
    concurrency: 3,
    retries: 5,
    onFailure: async ({ error, event }) => {
      await handleContractProcessingFailure({ error, event });
    },
  },
  { event: 'integrations/process-invoice-document' },
  async ({ event, step, logger }) => {
    const { fileName, modelProvider, contractId } = event.data;
    const { id: userId, organizationId } = event.user;

    try {
      const hash = getHash(`${userId}-${organizationId}-${contractId}-invoice`);

      await step.sendEvent(`contracts/extractcontract:${hash}`, {
        name: 'contracts/extractcontract',
        data: {
          fileName,
          fileId: null,
          contractId,
          modelProvider,
        },
        user: {
          id: userId,
          organizationId,
        },
      });

      const cacheService = await getCacheService();
      await cacheService.invalidateOrganizationData({ organizationId });
      await cacheService.invalidateVendorList({ userId, organizationId });

      const body = { userId, organizationId, fileName, contractId };
      logger.info(body);
      return { event, body };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        organizationId,
        fileName,
        contractId,
      });
      throw error;
    }
  },
);

export default processInvoiceDocument;
