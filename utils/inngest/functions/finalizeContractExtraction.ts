import { inngest } from '@/utils/inngest/client';
import { getHash } from '@/app/lib/utils';
import { handleContractProcessingFailure } from '@/utils/inngest/helpers';
import {
  processVendorProducts,
  processContractCredits,
  processProductScheduleAction,
  processAssetClasses,
  processDataDeliveryMethods,
} from '@/app/lib/actions/contract-processing';
import { processContractReplacementDetection } from '@/app/lib/actions/contract-replacement-detection';
import { contractTypes, isInvoiceType } from '@/app/lib/constants';
import { REPLACEMENT_TYPE_IDS } from '@/lib/contracts/replacementCandidates';
import { getCacheService } from '@/app/lib/redis/cache-service';

const finalizeContractExtraction = inngest.createFunction(
  {
    id: 'finalize-contract-extraction',
    concurrency: 1,
    retries: 3,
    onFailure: async ({ error, event }) => {
      await handleContractProcessingFailure({ error, event });
    },
  },
  { event: 'contracts/finalize-extraction' },
  async ({ event, step, logger }) => {
    const { fileName, fileId, contractId, modelProvider, contractTypeId } =
      event.data;
    const { id: userId, organizationId } = event.user;
    try {
      const hash = getHash(`${userId}-${organizationId}-${contractId}`);
      const filePath = `${userId}/${fileName}`;
      await step.run(`process-vendor-products:${hash}`, async () => {
        return await processVendorProducts({
          contractId,
          userId,
          logger,
          organizationId,
        });
      });
      await step.run(`process-contract-credits:${hash}`, async () => {
        if (!isInvoiceType(contractTypeId)) {
          return;
        }
        return await processContractCredits({
          contractId,
          userId,
          logger,
          organizationId,
        });
      });
      // After process-vendor-products on purpose: that step populates the
      // product names the candidate filter compares across contracts.
      await step.run(
        `process-contract-replacement-detection:${hash}`,
        async () => {
          if (!REPLACEMENT_TYPE_IDS.includes(contractTypeId)) {
            return;
          }
          return await processContractReplacementDetection({
            contractId,
            userId,
            logger,
            organizationId,
          });
        },
      );
      await step.run(`process-product-schedule-action:${hash}`, async () => {
        if (contractTypeId !== contractTypes.Addendum) {
          return;
        }
        return await processProductScheduleAction({
          contractId,
          userId,
          logger,
          organizationId,
        });
      });
      await step.run(`process-asset-classes:${hash}`, async () => {
        if (contractTypeId === contractTypes.NDA) {
          return;
        }
        return await processAssetClasses({
          filePath,
          fileId,
          contractId,
          userId,
          logger,
          organizationId,
          columns: ['asset_classes'],
          processor: modelProvider,
        });
      });
      await step.run(`process-data-delivery-methods:${hash}`, async () => {
        if (contractTypeId === contractTypes.NDA) {
          return;
        }
        return await processDataDeliveryMethods({
          contractId,
          userId,
          logger,
          organizationId,
        });
      });
      await step.run(`invalidate-cache:${hash}`, async () => {
        const cacheService = await getCacheService();
        await cacheService.invalidateOrganizationData({
          organizationId,
        });
        await cacheService.invalidateVendorList({
          userId,
          organizationId,
        });
      });
      return { contractId, contractTypeId };
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

export default finalizeContractExtraction;
