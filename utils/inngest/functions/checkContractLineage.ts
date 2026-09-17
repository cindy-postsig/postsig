import { inngest } from '../client';
import { getHash, calculateResults } from '@/app/lib/utils';
import { handleContractProcessingFailure } from '@/utils/inngest/helpers';
import { processContractLineage } from '@/app/lib/actions/contract-processing';
import { lineageColumns } from '@/constants/prompts';
import { detectRetroactiveChildren } from '@/app/lib/actions/contract-lineage-strategies';
import { fetchContract } from '@/data/superuser/contracts';

const checkContractLineage = inngest.createFunction(
  {
    id: 'check-contract-lineage',
    concurrency: 1,
    priority: { run: '30' },
    retries: 10,
    onFailure: async ({ error, event }) => {
      await handleContractProcessingFailure({ error, event });
    },
  },
  { event: 'contracts/checkcontractlineage' },
  async ({ event, step, logger }) => {
    const { fileName, fileId, contractId, vendorId, modelProvider } =
      event.data;
    const { id: userId, organizationId } = event.user;
    const filePath = `${userId}/${fileName}`;
    try {
      if (!contractId || !vendorId) {
        logger.error({
          userId,
          organizationId,
          fileId,
          contractId,
          vendorId,
        });
        return { event, body: {} };
      }
      const hash = getHash(`${userId}-${organizationId}-${contractId}`);
      const lineageResult = await step.run(
        `process-contract-lineage:${hash}`,
        async () => {
          return await processContractLineage({
            filePath,
            fileId,
            contractId,
            userId,
            logger,
            organizationId,
            columns: [...lineageColumns],
            vendorId,
            processor: modelProvider,
          });
        },
      );
      // TODO: Check the supabase error & get back to it.
      // if (lineageResult?.data?.parent_contract_id) {
      //   await step.sendEvent(`contracts/lineagefieldanalysis:${hash}`, {
      //     name: 'contracts/lineagefieldanalysis',
      //     data: {
      //       parentContractId: lineageResult?.data?.parent_contract_id,
      //       childContractId: lineageResult?.data?.child_contract_id,
      //       contractRelationshipId:
      //         lineageResult?.data?.contract_relationship_id,
      //     },
      //     user: {
      //       id: userId,
      //       organizationId,
      //     },
      //   });
      // }

      await step.run(`detect-retroactive-children:${hash}`, async () => {
        try {
          const contract = await fetchContract({ id: contractId });
          if (!contract) {
            logger.warn({
              message: 'Contract not found for retroactive detection',
              contractId,
            });
            return;
          }

          const contractProducts = (
            contract?.vendor_products_details || []
          ).map((detail: any) => ({
            product_id: detail.product_id,
            product_name: detail.vendor_products?.name || '',
          }));

          const startDateArray = contract.term_start_date;
          const startDate =
            startDateArray && Array.isArray(startDateArray)
              ? (startDateArray[startDateArray.length - 1] as any)?.date || null
              : null;

          await detectRetroactiveChildren({
            contractId,
            vendorId,
            organizationId,
            contractTypeId: contract.type_id,
            startDate,
            products: contractProducts,
          });

          logger.info({
            message: 'Retroactive children detection completed',
            contractId,
            vendorId,
            organizationId,
          });
        } catch (error) {
          logger.error({
            message: 'Error in retroactive children detection',
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            contractId,
            vendorId,
            organizationId,
          });
        }
      });

      const body = {
        userId,
        organizationId,
        fileId,
        contractId,
        ...calculateResults([lineageResult]),
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

export default checkContractLineage;
