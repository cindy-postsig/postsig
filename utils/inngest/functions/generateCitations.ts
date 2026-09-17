import { inngest } from '../client';
import { handleContractProcessingFailure } from '@/utils/inngest/helpers';
import { createClient } from '@/utils/supabase/service_server';
import _ from 'lodash';
import { getHash } from '@/app/lib/utils';
import { filteredContractColumnsForCitations } from '@/constants/prompts/utils';
import { getCitations } from '@/lib/citation';
import { v4 as uuidv4 } from 'uuid';
import { Citation } from '@/constants/types';
import { contractStatuses } from '@postsig/toolkit';
import { getCacheService } from '@/app/lib/redis/cache-service';

const generateCitations = inngest.createFunction(
  {
    id: 'generate-citations',
    concurrency: 1,
    retries: 5,
    onFailure: async ({ error, event }) => {
      await handleContractProcessingFailure({ error, event });
    },
  },
  { event: 'contracts/generatecitations' },
  async ({ event, step, logger }) => {
    const { fileName, contractId } = event.data;
    const { id: userId, organizationId } = event.user;
    const hash = getHash(`${userId}-${organizationId}-${fileName}`);
    const supabase = createClient();
    try {
      const filePath = `${userId}/${fileName}`;
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('contract_docs')
        .download(filePath);
      if (downloadError) {
        throw downloadError;
      }
      const fileBuffer = Buffer.from(await fileData.arrayBuffer());
      const contract = await step.run(`get-contract:${hash}`, async () => {
        const { data, error } = await supabase
          .from('contracts')
          .select(
            `${filteredContractColumnsForCitations.join(
              ',',
            )},vendor_products_details(vendor_products(name, vendors(name)))`,
          )
          .eq('id', contractId)
          .single();
        if (error) {
          throw error;
        }
        return data;
      });

      await step.run(`process-citations:${hash}`, async () => {
        const citations = await getCitations(contract, fileBuffer);
        const processedCitations = _.reduce(
          citations.data,
          (
            acc,
            citation: {
              target_property_tag: string;
              citations: {
                quote: string;
                page_number: number;
              }[];
            },
          ) => {
            const citationObject = {
              id: citation.target_property_tag,
              content: citation.citations.map((citation) => ({
                id: uuidv4(),
                pageNumber: citation.page_number,
                citationText: citation.quote,
              })),
            };
            acc.push(citationObject);
            return acc;
          },
          [] as Citation[],
        );
        const { error: deleteError } = await supabase
          .from('contract_citations')
          .delete()
          .eq('contract_id', contractId)
          .eq('user_id', userId)
          .eq('organization_id', organizationId);
        if (deleteError) {
          throw deleteError;
        }
        const { error: insertError } = await supabase
          .from('contract_citations')
          // @ts-ignore - Supabase type inference issue with insert
          .insert({
            citation_text: processedCitations as any,
            contract_id: contractId,
            user_id: userId,
            organization_id: organizationId,
            status_id: contractStatuses.citationExtractionInProgress,
          });
        // change contract status to 'needs citation review'
        if (insertError) {
          throw insertError;
        }
      });
      // TODO: uncomment this when we are ready to update the contract status
      /* await step.run(`update-contract-status:${hash}`, async () => {
        const { error: updateError } = await supabase
          .from('contracts')
          .update({ status_id: contractStatuses.needsCitationReview })
          .eq('id', contractId)
          .select();
        if (updateError) {
          throw updateError;
        }
      }); */
      await step.sendEvent(`contracts/generatehighlights:${hash}`, {
        name: 'contracts/generatehighlights',
        data: {
          fileName,
          contractId,
        },
        user: {
          id: userId,
          organizationId,
        },
      });
      const cacheService = await getCacheService();
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
