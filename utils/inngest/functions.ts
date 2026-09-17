import _ from 'lodash';
import { inngest } from './client';
import {
  getContractBasics,
  saveToDb,
  saveContractColumns,
  getContractSpecifics,
  getVendorId,
  removeDups,
  uploadToOpenAi,
  saveAiExtractionStatus,
} from '@/app/lib/actions/openai';
import {
  contractTypes,
  contractStatuses,
  AI_FAILED,
} from '@/app/lib/constants';
import {
  additionalContractDataColumns,
  lineageColumns,
  baseQueries,
} from '@/constants/prompts';
import {
  findLinkedContract,
  insertContract,
  insertContractDoc,
} from '@/data/superuser/contracts';
import {
  getDurationMins,
  getHash,
  getDurationSeconds,
  calculateResults,
} from '@/app/lib/utils';
import { ModelProvider } from '@/constants/types';
import {
  processAdditionalContractData,
  processContractBasics,
  processContractSpecs,
  processContractLineage,
} from '@/app/lib/actions/contract-processing';
import { logAlert } from '@/utils/logging/alert';

export const getContractData = inngest.createFunction(
  {
    id: 'contract-basics',
    concurrency: 2,
    retries: 5,
  },
  { event: 'contracts/basics' },
  async ({ event, logger }) => {
    const { fileId, contractId, userId } = event.data;
    try {
      const startTime = performance.now();
      const { data, usage } = await getContractBasics(fileId);
      const endTime = performance.now();
      const durationMins = getDurationMins(startTime, endTime);
      logger.info({
        userId,
        contractId,
        fileId,
        durationMins,
        nTotalTokens: usage?.total_tokens,
        nPromptTokens: usage?.prompt_tokens,
        nCompletionTokens: usage?.completion_tokens,
      });
      const body = await saveToDb(data, contractId);
      return { event, body };
    } catch (error) {
      await saveAiExtractionStatus(AI_FAILED, contractId);
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        contractId,
        fileId,
      });
      throw error;
    }
  },
);

export const getContractSpecs = inngest.createFunction(
  {
    id: 'contract-specs',
    concurrency: 5,
    retries: 5,
  },
  { event: 'contracts/specs' },
  async ({ event, logger }) => {
    const { fileId, contractId, columns, userId, organizationId } = event.data;
    try {
      const startTime = performance.now();
      const filePath = `${userId}/${fileId}`;
      const { data, usage } = await getContractSpecifics(
        filePath,
        fileId,
        columns,
        ModelProvider.google,
      );
      if (data && data.contract_type) {
        if (
          data.contract_type &&
          typeof data.contract_type === 'string' &&
          data.contract_type in contractTypes
        ) {
          data.type_id =
            contractTypes[data.contract_type as keyof typeof contractTypes];
        } else {
          data.type_id = contractTypes.Other;
        }
        delete data.contract_type;
      } else {
        data.type_id = contractTypes.Other;
        delete data.contract_type;
      }
      if (data && data.vendor_name && data.vendor_name !== 'NO_DATA_FOUND') {
        const vendorId = await getVendorId(data.vendor_name, organizationId);
        data.vendor_id = vendorId;
        delete data.vendor_name;
      }
      if (data && data.contract_summary) {
        data.summary = data.contract_summary;
        delete data.contract_summary;
      }
      if (data && data.products_list) {
        data.products_fees = [
          {
            summary: { products_list: data.products_list },
          },
        ];
        delete data.products_list;
      }
      if (data) {
        data.status_id = contractStatuses.new;
      }
      const endTime = performance.now();
      const durationMins = getDurationMins(startTime, endTime);
      logger.info({
        userId,
        contractId,
        fileId,
        columns,
        durationMins,
        nTotalTokens: usage?.total_tokens,
        nPromptTokens: usage?.prompt_tokens,
        nCompletionTokens: usage?.completion_tokens,
      });
      const body = await saveContractColumns(data, contractId);
      return { event, body };
    } catch (error) {
      logger.error({
        userId,
        contractId,
        fileId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  },
);

export const processOpenAiFile = inngest.createFunction(
  {
    id: 'process-openai-file',
    concurrency: 2,
    retries: 10,
    onFailure: async ({ error, event }) => {
      const originalEvent = event.data.event;
      const { fileName } = originalEvent.data;
      const { id: userId, organizationId } = originalEvent.user;
      logAlert(
        'openai-file-processing-failure',
        error,
        {
          processName: 'contracts/processopenai',
          fileName,
          userId,
          organizationId,
          runId: event.data.run_id,
        },
        'OpenAI file processing failed',
      );
    },
  },
  { event: 'contracts/processopenai' },
  async ({ event, step, logger }) => {
    const { fileName, modelProvider, processType } = event.data;
    const { id: userId, organizationId } = event.user;
    try {
      const hash = getHash(
        `${userId}-${organizationId}-${fileName}-${modelProvider}-${processType}`,
      );
      const filePath = `${userId}/${fileName}`;
      const openAiFile = await step.run(
        `upload-to-openai:${hash}`,
        async () => {
          return uploadToOpenAi(filePath);
        },
      );
      const insertContractData = await step.run(
        `insert-contract:${hash}`,
        async () => {
          return insertContract({
            updated_at: new Date().toISOString(),
            open_ai_file_id: openAiFile.id,
            status_id: contractStatuses.uploaded,
            user_id: userId,
          });
        },
      );
      await step.run(`insert-contract-document:${hash}`, async () => {
        return insertContractDoc({
          file_path: filePath,
          updated_at: new Date().toISOString(),
          contract_id: insertContractData[0].id,
          user_id: userId,
        });
      });
      const contractSpecsResult = await step.run(
        `process-contract-specs:${hash}`,
        async () => {
          return await processContractSpecs({
            filePath,
            fileId: openAiFile.id,
            contractId: insertContractData[0].id,
            columns: [
              'vendor_name',
              'vendor_location',
              'contract_summary',
              'contract_type',
              'products_list',
            ],
            userId,
            organizationId,
            logger,
            processor: modelProvider,
          });
        },
      );
      const contractBasicsResult = await step.run(
        `process-contract-basics:${hash}`,
        async () => {
          return await processContractBasics({
            filePath,
            fileId: openAiFile.id,
            contractId: insertContractData[0].id,
            userId,
            logger,
            organizationId,
            processor: modelProvider,
          });
        },
      );
      const additionalDataResult = await step.run(
        `process-contract-additional-data:${hash}`,
        async () => {
          return await processAdditionalContractData({
            filePath,
            fileId: openAiFile.id,
            contractId: insertContractData[0].id,
            userId,
            logger,
            organizationId,
            columns: additionalContractDataColumns,
            processor: modelProvider,
          });
        },
      );
      await step.sendEvent('contracts/checkcontractlineage', {
        name: 'contracts/checkcontractlineage',
        data: {
          fileName,
          fileId: openAiFile.id,
          contractId: insertContractData[0].id,
          vendorId: _.get(contractSpecsResult, ['data', 'vendor_id']),
          modelProvider,
        },
        user: {
          id: userId,
          organizationId,
        },
      });
      const body = {
        userId,
        organizationId,
        fileName,
        ...calculateResults([
          contractSpecsResult,
          contractBasicsResult,
          additionalDataResult,
        ]),
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
