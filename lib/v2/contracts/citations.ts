import { cache } from 'react';
import { createClient } from '@/utils/supabase/service_server';
import { getUserMetadata } from '@/data/users';
import { Citation } from '@/constants/types';
import logger from '@/utils/pino';

// Contract status for published contracts
const PUBLISHED_STATUS_ID = 4;

// Re-export Citation type for consumers
export type { Citation };

export interface CitationsResult {
  citations: Citation[];
  count: number;
}

interface RawCitationContent {
  id: string;
  content: Array<{
    id: string;
    pageNumber: number;
    citationText: string;
    boundingBox?: {
      top: number;
      left: number;
      width: number;
      height: number;
    };
  }>;
}

/**
 * Get citations for a contract.
 * Citations are AI-extracted key terms/clauses from the contract.
 * Cached per request for deduplication.
 */
export const getContractCitations = cache(
  async (contractId: number): Promise<CitationsResult> => {
    const userMetadata = await getUserMetadata();
    if (!userMetadata) {
      return { citations: [], count: 0 };
    }

    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from('contract_citations')
        .select('citation_text')
        .eq('status_id', PUBLISHED_STATUS_ID)
        .eq('contract_id', contractId)
        .single();

      if (error) {
        logger.error(
          { error, contractId },
          'Error fetching contract citations',
        );
        return { citations: [], count: 0 };
      }

      const citationData = data?.citation_text as RawCitationContent[] | null;
      if (!citationData || !Array.isArray(citationData)) {
        return { citations: [], count: 0 };
      }

      const citations: Citation[] = citationData
        .filter((item) => item.content && item.content.length > 0)
        .map((item) => ({
          id: item.id,
          content: item.content.map((c) => ({
            id: c.id,
            pageNumber: c.pageNumber,
            citationText: c.citationText,
            boundingBox: c.boundingBox,
          })),
        }));

      return {
        citations,
        count: citations.length,
      };
    } catch (error) {
      logger.error({ error, contractId }, 'Error fetching contract citations');
      return { citations: [], count: 0 };
    }
  },
);
