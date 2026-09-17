import { inngest } from '../client';
import { getHash, calculateResults } from '@/app/lib/utils';
import { handleContractProcessingFailure } from '@/utils/inngest/helpers';
import {
  processAdditionalContractData,
  processContractSpecs,
  processExchangeAgreementProducts,
  processTechnical,
} from '@/app/lib/actions/contract-processing';
import { logProcessingStatusChange } from '@/data/superuser/activities';
import { contractStatuses } from '@/app/lib/constants';
import { isExchangeAgreementType } from '@/app/lib/constants';
import { getFieldsToExtractByContractType } from '@/constants/data';

const extractContract = inngest.createFunction(
  {
    id: 'extract-contract',
    concurrency: 1,
    retries: 3,
    onFailure: async ({ error, event }) => {
      await handleContractProcessingFailure({ error, event });
    },
  },
  { event: 'contracts/extractcontract' },
  async ({ event, step, logger }) => {
    const { fileName, fileId, contractId, modelProvider } = event.data;
    const { id: userId, organizationId } = event.user;
    try {
      const hash = getHash(`${userId}-${organizationId}-${contractId}`);
      const filePath = `${userId}/${fileName}`;
      const technicalResult = await step.run(
        `process-technical:${hash}`,
        async () => {
          return await processTechnical({
            filePath,
            fileId,
            contractId,
            userId,
            logger,
            organizationId,
            processor: modelProvider,
          });
        },
      );
      const contractSpecsResult = await step.run(
        `process-contract-specs:${hash}`,
        async () => {
          return await processContractSpecs({
            filePath,
            fileId,
            contractId,
            columns: [
              'vendor_name',
              'vendor_location',
              'contract_summary',
              'contract_type',
            ],
            userId,
            organizationId,
            logger,
            processor: modelProvider,
          });
        },
      );
      await step.run(`log-contract-activity:${hash}`, async () => {
        return logProcessingStatusChange({
          contractId,
          oldStatusId: contractStatuses.uploaded,
          newStatusId: contractStatuses.new,
          changedBy: userId,
        });
      });
      const contractTypeId = contractSpecsResult.data?.type_id;
      const columnsToExtract = getFieldsToExtractByContractType(contractTypeId);
      const additionalDataResult = await step.run(
        `process-contract-additional-data:${hash}`,
        async () => {
          return await processAdditionalContractData({
            filePath,
            fileId,
            contractId,
            userId,
            logger,
            organizationId,
            columns: columnsToExtract,
            processor: modelProvider,
            contractTypeId,
          });
        },
      );
      // Must land before process-vendor-products, which reads products_list off
      // ai_extraction to link products.
      const exchangeAgreementResult = await step.run(
        `process-exchange-agreement-products:${hash}`,
        async () => {
          if (!isExchangeAgreementType(contractTypeId)) {
            return;
          }
          return await processExchangeAgreementProducts({
            filePath,
            contractId,
            userId,
            logger,
            organizationId,
          });
        },
      );
      const body = {
        userId,
        organizationId,
        fileId,
        contractId,
        ...calculateResults(
          [
            contractSpecsResult,
            additionalDataResult,
            technicalResult,
            exchangeAgreementResult,
          ].filter((result) => result !== undefined && result !== null),
        ),
      };
      logger.info(body);
      await step.sendEvent(`contracts/finalize-extraction:${hash}`, {
        name: 'contracts/finalize-extraction',
        data: {
          fileName,
          fileId,
          contractId,
          modelProvider,
          contractTypeId,
        },
        user: {
          id: userId,
          organizationId,
        },
      });
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

export default extractContract;
