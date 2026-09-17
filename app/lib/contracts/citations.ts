'use server';

import { createClient } from '@/utils/supabase/service_server';
import _ from 'lodash';
import logger from '@/utils/pino';

export type Citation = {
  id: string;
  content: [
    {
      pageNumber: string;
      citationText: string;
    },
  ];
};

export async function fetchContractCitations(
  contractId: number,
): Promise<Citation[]> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from('contract_citations')
      .select<string, { citation_text: unknown }>('citation_text')
      .eq('contract_id', contractId)
      .single();
    if (error) {
      console.error('Error fetching citations:', error);
      return [];
    }
    if (!data?.citation_text) {
      return [];
    }
    const citationData = data.citation_text as Array<{
      id: string;
      content: {
        pageNumber: string;
        citationText: string;
      }[];
    }>;
    return _.reduce(
      citationData,
      (acc: Citation[], item: any) => {
        if (item.content && item.content !== '' && item.content.length > 0) {
          acc.push({
            id: item.id,
            content: item.content,
          });
        }
        return acc;
      },
      [] as Citation[],
    );
  } catch (error) {
    logger.error({ error }, 'Error in fetchContractCitations');
    return [];
  }
}
