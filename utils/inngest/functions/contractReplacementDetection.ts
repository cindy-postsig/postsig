import { inngest } from '@/utils/inngest/client';
import { getHash } from '@/app/lib/utils';
import { handleContractProcessingFailure } from '@/utils/inngest/helpers';
import { processContractReplacementDetection } from '@/app/lib/actions/contract-replacement-detection';
import { REPLACEMENT_TYPE_IDS } from '@/lib/contracts/replacementCandidates';

const contractReplacementDetection = inngest.createFunction(
  {
    id: 'contract-replacement-detection',
    concurrency: 1,
    retries: 3,
    onFailure: async ({ error, event }) => {
      await handleContractProcessingFailure({ error, event });
    },
  },
  { event: 'contracts/contract-replacement-detection' },
  async ({ event, step, logger }) => {
    const { contractId, contractTypeId } = event.data;
    const { id: userId, organizationId } = event.user;
    try {
      const hash = getHash(`${userId}-${organizationId}-${contractId}`);
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
      return { contractId, contractTypeId };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        organizationId,
        contractId,
      });
      throw error;
    }
  },
);

export default contractReplacementDetection;
