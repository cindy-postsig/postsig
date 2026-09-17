import { inngest } from '@/utils/inngest/client';
import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { getHash } from '@/app/lib/utils';
import { handleContractProcessingFailure } from '@/utils/inngest/helpers';
import { processZipFiles } from '@/lib/utils/zip';
import { downloadFile } from '@/lib/v2/storage/service';
import { ModelProvider } from '@/constants/types';
import { getAllOrgUsers } from '@/data/superuser/users';
import {
  findDuplicateDocInUsers,
  insertContract,
  insertContractDoc,
} from '@/data/superuser/contracts';
import { sanitizeFileName } from '@/utils/helpers';
import { contractStatuses } from '@/app/lib/constants';
import { INVESTOR_DOCUMENT_ERROR_CODES } from '@/constants/investorDocumentErrors';
import { getCacheService } from '@/app/lib/redis/cache-service';
import {
  logContractUploaded,
  logProcessingStatusChange,
} from '@/data/superuser/activities';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const processContractZip = inngest.createFunction(
  {
    id: 'process-contract-zip',
    concurrency: 1,
    retries: 3,
    idempotency: 'event.data.filePath',
    onFailure: async ({ error, event }) => {
      await handleContractProcessingFailure({ error, event });
    },
  },
  { event: 'contracts/process-zip' },
  async ({ event, step }) => {
    const { filePath, fileName } = event.data;
    const { id: userId, organizationId } = event.user;
    const supabase = createClient();

    const downloadResult = await downloadFile(
      supabase,
      'contract_docs',
      filePath,
    );
    const fileBuffer = new Uint8Array(downloadResult);

    const extractedFiles = await processZipFiles(
      fileBuffer,
      fileName,
      filePath,
    );

    const pdfFiles = extractedFiles.filter(
      (f) => f.fileType === 'application/pdf',
    );
    const nonPdfFiles = extractedFiles.filter(
      (f) => f.fileType !== 'application/pdf',
    );

    if (nonPdfFiles.length > 0) {
      logger.info(
        {
          zipFileName: fileName,
          nonPdfCount: nonPdfFiles.length,
          discardedFiles: nonPdfFiles.map((f) => sanitizeFileName(f.fileName)),
        },
        'Non-PDF files found in ZIP',
      );
    }

    const orgUserIds = await getAllOrgUsers(organizationId);

    // Create contract records upfront for valid PDFs so they appear in the pending list immediately
    const contractIdMap = await step.run(
      'create-contract-records',
      async () => {
        const mapping: Record<string, number> = {};

        for (const pdfFile of pdfFiles) {
          const sanitizedName = sanitizeFileName(pdfFile.fileName);

          // Skip files that will fail validation (oversized, duplicates)
          if (pdfFile.fileSize > MAX_FILE_SIZE) {
            continue;
          }

          const duplicates = await findDuplicateDocInUsers(
            orgUserIds,
            sanitizedName,
          );
          if (duplicates.length > 0) {
            continue;
          }

          const now = new Date().toISOString();
          const contractData = await insertContract({
            updated_at: now,
            status_id: contractStatuses.uploaded,
            user_id: userId,
            organization_id: organizationId,
          });
          await insertContractDoc({
            file_path: `${userId}/${sanitizedName}`,
            updated_at: now,
            contract_id: contractData[0].id,
            user_id: userId,
          });
          await logContractUploaded({
            contractId: contractData[0].id,
            fileName: sanitizedName,
            changedBy: userId,
            userId,
          });
          await logProcessingStatusChange({
            contractId: contractData[0].id,
            newStatusId: contractStatuses.uploaded,
            changedBy: userId,
          });

          mapping[sanitizedName] = contractData[0].id;
          logger.info(
            { fileName: sanitizedName, contractId: contractData[0].id },
            'Created upfront contract record for PDF from ZIP',
          );
        }

        return mapping;
      },
    );

    // Invalidate cache so new records appear in the pending list immediately
    try {
      const cacheService = await getCacheService();
      await cacheService.invalidateOrganizationData({ organizationId });
    } catch (cacheError) {
      logger.warn(
        { error: cacheError, organizationId },
        'Failed to invalidate organization cache after upfront record creation',
      );
    }

    // Create failed records for non-PDF files
    await step.run('create-unsupported-file-records', async () => {
      for (const file of nonPdfFiles) {
        const sanitizedName = sanitizeFileName(file.fileName);

        const now = new Date().toISOString();
        const contractData = await insertContract({
          updated_at: now,
          status_id: contractStatuses.uploaded,
          ai_extraction_status: 'ai_failed',
          user_id: userId,
          organization_id: organizationId,
          metadata: {
            original_filename: file.fileName,
            failure: {
              error: {
                code: INVESTOR_DOCUMENT_ERROR_CODES.UNSUPPORTED_FILE_TYPE,
                message: `Unsupported file type: ${file.fileType}`,
              },
              stage: 'document_creation',
              step_id: 'check-file-type',
              function_id: 'process-contract-zip',
              occurred_at: now,
            },
          },
        });
        await insertContractDoc({
          file_path: `${userId}/${sanitizedName}`,
          updated_at: now,
          contract_id: contractData[0].id,
          user_id: userId,
        });
        await logContractUploaded({
          contractId: contractData[0].id,
          fileName: sanitizedName,
          changedBy: userId,
          userId,
        });
        await logProcessingStatusChange({
          contractId: contractData[0].id,
          newStatusId: contractStatuses.uploaded,
          changedBy: userId,
        });
        logger.info(
          { fileName: sanitizedName, contractId: contractData[0].id },
          'Created failed record for non-PDF file from ZIP',
        );
      }
    });

    const uploadResults = await step.run('upload-extracted-pdfs', async () => {
      const results: {
        uploaded: { fileName: string; uploadPath: string }[];
        skipped: string[];
      } = { uploaded: [], skipped: [] };

      for (const pdfFile of pdfFiles) {
        const sanitizedName = sanitizeFileName(pdfFile.fileName);

        // Files with upfront contract records already passed validation — skip to upload
        if (!contractIdMap[sanitizedName]) {
          if (pdfFile.fileSize > MAX_FILE_SIZE) {
            const now = new Date().toISOString();
            const contractData = await insertContract({
              updated_at: now,
              status_id: contractStatuses.uploaded,
              ai_extraction_status: 'ai_failed',
              user_id: userId,
              organization_id: organizationId,
              metadata: {
                original_filename: pdfFile.fileName,
                failure: {
                  error: {
                    code: INVESTOR_DOCUMENT_ERROR_CODES.FILE_SIZE_EXCEEDED,
                    message: `File exceeds the 50MB size limit (${(pdfFile.fileSize / (1024 * 1024)).toFixed(1)}MB)`,
                  },
                  stage: 'document_creation',
                  step_id: 'check-file-size',
                  function_id: 'process-contract-zip',
                  occurred_at: now,
                },
              },
            });
            await insertContractDoc({
              file_path: `${userId}/${sanitizedName}`,
              updated_at: now,
              contract_id: contractData[0].id,
              user_id: userId,
            });
            await logContractUploaded({
              contractId: contractData[0].id,
              fileName: sanitizedName,
              changedBy: userId,
              userId,
            });
            await logProcessingStatusChange({
              contractId: contractData[0].id,
              newStatusId: contractStatuses.uploaded,
              changedBy: userId,
            });
            logger.info(
              {
                fileName: sanitizedName,
                contractId: contractData[0].id,
                fileSize: pdfFile.fileSize,
                zipFileName: fileName,
              },
              'Created failed record for oversized PDF from ZIP',
            );
            results.skipped.push(sanitizedName);
            continue;
          }

          const duplicates = await findDuplicateDocInUsers(
            orgUserIds,
            sanitizedName,
          );
          if (duplicates.length > 0) {
            const now = new Date().toISOString();
            const contractData = await insertContract({
              updated_at: now,
              status_id: contractStatuses.uploaded,
              ai_extraction_status: 'ai_failed',
              user_id: userId,
              organization_id: organizationId,
              metadata: {
                original_filename: pdfFile.fileName,
                failure: {
                  error: {
                    code: INVESTOR_DOCUMENT_ERROR_CODES.DUPLICATE_FILE,
                    message: `This file has already been uploaded as "${sanitizedName}"`,
                  },
                  stage: 'document_creation',
                  step_id: 'check-duplicate',
                  function_id: 'process-contract-zip',
                  occurred_at: now,
                },
              },
            });
            await insertContractDoc({
              file_path: `${userId}/${sanitizedName}`,
              updated_at: now,
              contract_id: contractData[0].id,
              user_id: userId,
            });
            await logContractUploaded({
              contractId: contractData[0].id,
              fileName: sanitizedName,
              changedBy: userId,
              userId,
            });
            await logProcessingStatusChange({
              contractId: contractData[0].id,
              newStatusId: contractStatuses.uploaded,
              changedBy: userId,
            });
            logger.info(
              {
                fileName: sanitizedName,
                contractId: contractData[0].id,
                zipFileName: fileName,
              },
              'Created failed record for duplicate contract from ZIP',
            );
            results.skipped.push(sanitizedName);
            continue;
          }
        }

        // Sanitization is handled downstream by contracts/processcontract
        const uploadPath = `${userId}/${sanitizedName}`;
        const { error } = await supabase.storage.from('contract_docs').upload(
          uploadPath,
          new Blob([Buffer.from(pdfFile.content)], {
            type: 'application/pdf',
          }),
          { upsert: true },
        );

        if (error) {
          logger.error(
            { error, uploadPath, fileName: sanitizedName },
            'Failed to upload extracted PDF',
          );
          continue;
        }

        logger.info(
          { fileName: sanitizedName, uploadPath },
          'Extracted PDF uploaded to contract_docs',
        );
        results.uploaded.push({ fileName: sanitizedName, uploadPath });
      }

      return results;
    });

    const processContractEvents = uploadResults.uploaded.map((uploaded) => ({
      name: 'contracts/processcontract' as const,
      data: {
        fileName: uploaded.fileName,
        modelProvider: ModelProvider.google,
        processType: 'initial',
        contractId: contractIdMap[uploaded.fileName],
      },
      user: {
        id: userId,
        organizationId,
      },
    }));

    if (processContractEvents.length > 0) {
      await step.sendEvent('process-contracts', processContractEvents);
    }

    try {
      const cacheService = await getCacheService();
      await cacheService.invalidateOrganizationData({ organizationId });
    } catch (cacheError) {
      logger.warn(
        { error: cacheError, organizationId },
        'Failed to invalidate organization cache after ZIP processing',
      );
    }

    const summary = {
      success: true,
      fileName,
      filePath,
      totalFiles: extractedFiles.length,
      pdfsFound: pdfFiles.length,
      nonPdfsDiscarded: nonPdfFiles.length,
      duplicatesSkipped: uploadResults.skipped.length,
      pdfsProcessed: uploadResults.uploaded.length,
    };

    logger.info(summary, 'Contract ZIP processing complete');

    return summary;
  },
);

export default processContractZip;
