import { inngest } from '../client';
import { handleContractProcessingFailure } from '@/utils/inngest/helpers';
import { createClient } from '@/utils/supabase/service_server';
import {
  textractService,
  transformTextractToSimplified,
} from '@/lib/textract/index';
import { citationCoordinateService } from '@/lib/textract/coordinateMatching';
import { getHash } from '@/app/lib/utils';
import { Citation } from '@/constants/types';
import { contractStatuses } from '@postsig/toolkit';
import { getCacheService } from '@/app/lib/redis/cache-service';

const generateCitations = inngest.createFunction(
  {
    id: 'generate-highlights',
    concurrency: 1,
    retries: 5,
    onFailure: async ({ error, event }) => {
      await handleContractProcessingFailure({ error, event });
    },
  },
  { event: 'contracts/generatehighlights' },
  async ({ event, step, logger }) => {
    const { fileName, contractId } = event.data;
    const { id: userId, organizationId } = event.user;
    const hash = getHash(`${userId}-${organizationId}-${fileName}`);
    const supabase = createClient();
    const cacheService = await getCacheService();
    try {
      const filePath = `${userId}/${fileName}`;
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('contract_docs')
        .download(filePath);
      if (downloadError) {
        throw downloadError;
      }
      const fileBuffer = Buffer.from(await fileData.arrayBuffer());
      const citationsData = await step.run(
        `get-citations:${hash}`,
        async () => {
          const { data, error } = await supabase
            .from('contract_citations')
            .select<string, { citation_text: unknown }>('citation_text')
            .eq('contract_id', contractId)
            .single();
          if (error) {
            throw error;
          }
          return data;
        },
      );
      const citations = citationsData.citation_text as Citation[];
      if (!citations || citations.length === 0) {
        logger.error('No citations found:', {
          fileName,
          contractId,
          userId,
          organizationId,
        });
        return { processed: 0, skipped: 0, errors: 0 };
      }

      await step.run(`process-textract-bounding-boxes:${hash}`, async () => {
        try {
          if (citations.length === 0) {
            logger.info('No citations to process for bounding boxes');
            return { processed: 0, skipped: 0, errors: 0 };
          }

          const s3Key = `textract-input/${hash}/${fileName}`;
          try {
            await textractService.uploadDocument(s3Key, fileBuffer);
            const citationGroups = citations;
            if (!Array.isArray(citationGroups)) {
              logger.warn('Citation data is not in expected array format');
              return {
                processed: 0,
                skipped: citations.length,
                errors: 1,
                reason: 'Invalid citation data format',
              };
            }

            let textractResult;
            let simplifiedTextractResult;
            try {
              textractResult = await textractService.processDocument(
                contractId,
                s3Key,
              );
              logger.info(
                `Textract successfully processed document: ${fileName}`,
              );

              simplifiedTextractResult =
                transformTextractToSimplified(textractResult);
              logger.info(
                `Created simplified textract result with ${simplifiedTextractResult.pages.length} pages`,
              );
            } catch (textractError) {
              logger.error('Textract document processing failed:', {
                error:
                  textractError instanceof Error
                    ? textractError.message
                    : textractError,
                fileName,
                contractId,
              });

              if (
                textractError instanceof Error &&
                textractError.message.includes('Textract job timed out')
              ) {
                logger.warn(
                  'Textract job timed out, continuing without bounding boxes',
                );
                throw textractError;
              }

              if (
                textractError instanceof Error &&
                textractError.message.includes('Textract job failed')
              ) {
                logger.warn(
                  'Textract job failed, continuing without bounding boxes',
                );
                throw textractError;
              }

              throw textractError;
            }

            let updatedCitationGroups;
            try {
              updatedCitationGroups =
                await citationCoordinateService.matchCitationsToCoordinates(
                  citationGroups,
                  textractResult,
                  0.75,
                  {
                    minWordCount: 5,
                    wordCountStrategy: 'prefix',
                    wordCountThreshold: 0.9,
                  },
                );

              const counts = citationCoordinateService.countProcessedCitations(
                updatedCitationGroups,
              );
              logger.info(
                `Successfully matched ${counts.processed} out of ${counts.total} citations to bounding boxes`,
              );
            } catch (matchingError) {
              logger.error('Citation coordinate matching failed:', {
                error:
                  matchingError instanceof Error
                    ? matchingError.message
                    : matchingError,
                citationCount: citationGroups.length,
              });
              logger.warn(
                'Continuing without bounding box updates due to matching failure',
              );
              return {
                processed: 0,
                skipped: citations.length,
                errors: 1,
                reason: 'Citation matching failed',
              };
            }

            const counts = citationCoordinateService.countProcessedCitations(
              updatedCitationGroups,
            );
            if (counts.processed === 0) {
              logger.warn('No citations could be matched to bounding boxes');
              return {
                processed: 0,
                skipped: counts.total,
                errors: 0,
                reason: 'No matches found',
              };
            }

            try {
              const { error: updateError } = await supabase
                .from('contract_citations')
                // @ts-ignore - Supabase type inference issue with update
                .update({
                  citation_text: updatedCitationGroups,
                  ai_citation_text: updatedCitationGroups,
                  ocr_blocks: simplifiedTextractResult,
                  status_id: contractStatuses.new,
                } as any)
                .eq('contract_id', contractId)
                .eq('user_id', userId)
                .eq('organization_id', organizationId);

              if (updateError) {
                logger.error(
                  'Failed to update citation text with bounding boxes:',
                  {
                    error: updateError.message,
                    contractId,
                    userId,
                    organizationId,
                  },
                );
                throw updateError;
              }

              logger.info(
                `Bounding box processing completed: ${counts.processed} processed, ${counts.total - counts.processed} skipped`,
              );
              return {
                processed: counts.processed,
                skipped: counts.total - counts.processed,
                errors: 0,
                updatedCitations: updatedCitationGroups,
              };
            } catch (dbError) {
              logger.error('Database update failed for citation text:', {
                error: dbError instanceof Error ? dbError.message : dbError,
                contractId,
              });
              throw dbError;
            }
          } finally {
            await textractService.deleteDocument(s3Key);
          }
        } catch (error) {
          logger.error('Textract processing step failed completely:', {
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined,
            fileName,
            contractId,
            userId,
            organizationId,
          });

          throw error;
        }
      });

      await cacheService.invalidateOrganizationData({
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

export default generateCitations;
