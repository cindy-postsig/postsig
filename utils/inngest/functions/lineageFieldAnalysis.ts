import { inngest } from '../client';
import { getHash, calculateResults } from '@/app/lib/utils';
import { handleContractProcessingFailure } from '@/utils/inngest/helpers';
// import { processLineageFieldAnalysis } from '@/app/lib/actions/contract-processing';
import { processLineageFieldAnalysis } from '@postsig/toolkit';
import { createClient } from '@/utils/supabase/service_server';

const lineageFieldAnalysis = inngest.createFunction(
  {
    id: 'lineage-field-analysis',
    concurrency: 1,
    priority: { run: '30' },
    retries: 10,
    onFailure: async ({ error, event }) => {
      await handleContractProcessingFailure({ error, event });
    },
  },
  { event: 'contracts/lineagefieldanalysis' },
  async ({ event, step, logger }) => {
    const { parentContractId, childContractId, contractRelationshipId } =
      event.data;
    const { id: userId, organizationId } = event.user;
    try {
      if (!parentContractId || !childContractId) {
        logger.error({
          userId,
          organizationId,
          parentContractId,
          childContractId,
          contractRelationshipId,
        });
        return { event, body: {} };
      }

      const hash = getHash(
        `${userId}-${organizationId}-${parentContractId}-${childContractId}-${contractRelationshipId}`,
      );
      const fieldAnalysisResult = await step.run(
        `process-lineage-field-analysis:${hash}`,
        async () => {
          return await processLineageFieldAnalysis({
            parentContractId,
            childContractId,
            contractRelationshipId,
            logger,
          });
        },
      );
      await step.run(
        `update-contract-relationship-metadata:${hash}`,
        async () => {
          const supabase = createClient();

          const { data: currentRow, error: fetchError } = await supabase
            .from('contract_relationships')
            .select<string, { metadata: unknown }>('metadata')
            .eq('id', contractRelationshipId)
            .single();

          if (fetchError) {
            throw fetchError;
          }

          const existingMetadata: any = currentRow?.metadata || {};
          const mergedMetadata = {
            ...existingMetadata,
            ...fieldAnalysisResult?.data,
          };

          const { error: updateError } = await supabase
            .from('contract_relationships')
            // @ts-ignore - Supabase type inference issue with update
            .update({ metadata: mergedMetadata } as any)
            .eq('id', contractRelationshipId);

          if (updateError) {
            throw updateError;
          }
        },
      );
      const body = {
        userId,
        organizationId,
        parentContractId,
        childContractId,
        contractRelationshipId,
        ...calculateResults([fieldAnalysisResult]),
      };
      logger.info(body);
      return { event, body };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        organizationId,
        parentContractId,
        childContractId,
        contractRelationshipId,
      });
      throw error;
    }
  },
);

export default lineageFieldAnalysis;
