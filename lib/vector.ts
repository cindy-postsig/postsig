import { createClient } from '@/utils/supabase/service_server';
import { OpenAI } from 'openai';
import { processWithGemini } from './google';
import { citationQueries } from '@/constants/prompts';
import _ from 'lodash';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { CITATION_EXTRACTION_PROMPT_TEMPLATE } from './prompts/citation-extraction-prompt';

const citationSchema = z.object({
  citations: z.array(
    z.object({
      id: z.string(),
      pageNumber: z.number(),
      citationText: z.string(),
    }),
  ),
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: text,
    dimensions: 1536,
  });
  return response.data[0].embedding.slice(0, 1536);
}

export async function queryDocuments(query: string, contractId?: string) {
  const supabase = createClient();
  const queryEmbedding = await getEmbedding(query);

  let matchDocumentsQuery = supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_threshold: 0.2,
    match_count: 5,
    input_contract_id: contractId,
  } as any);

  matchDocumentsQuery = matchDocumentsQuery.order('similarity', {
    ascending: false,
  });

  const { data: documents, error } = await matchDocumentsQuery;

  if (!documents || (documents as any[]).length === 0) {
    return {
      sourceDocs: [],
    };
  }
  if (error) throw error;

  return {
    sourceDocs: documents,
  };
}

export async function getBestCitation(
  query: string,
  sourceDocs: any[] = [],
  modelProvider: string = 'google',
  answer?: string,
) {
  return await getCitationsFromSourceDocs(
    query,
    sourceDocs,
    modelProvider,
    undefined,
    undefined,
    answer,
  );
}

async function getCitationsFromSourceDocs(
  query: string,
  sourceDocs: any[] = [],
  modelProvider: string = 'google',
  temperature: number = 0.2,
  top_p: number = 0.2,
  answer?: string,
) {
  const sourceDocsString = sourceDocs
    .map(
      (doc: any) =>
        `<chunk>id:${doc.id}\npage:${doc.metadata.pageNumber}\ncontent:${doc.content}</chunk>`,
    )
    .join('\n\n');

  const prompt = CITATION_EXTRACTION_PROMPT_TEMPLATE.replace('{query}', query)
    .replace('{answer}', answer || '') // Handle undefined answer
    .replace('{sourceDocs}', sourceDocsString);

  const citationQuery = {
    ..._.find(citationQueries, { dbName: 'citation_text' }),
    query: prompt,
  };
  const completion = await createChatCompletion(
    modelProvider,
    prompt,
    temperature,
    top_p,
    citationQuery,
  );
  return completion;
}

async function createChatCompletion(
  modelProvider: string,
  prompt: string,
  temperature: number,
  top_p: number,
  query: any,
) {
  if (modelProvider === 'google') {
    const systemPrompt = `
        You are an AI assistant specialized in precise information retrieval and citation extraction. 
        Your primary function is to identify and extract verbatim text segments from provided source documents that directly support a given answer to a question. 
        You must strictly adhere to all formatting instructions for the output, especially regarding the number of citations, their separation, 
        and the exclusion of any extraneous text or tags. Prioritize accuracy, relevance, and semantic completeness of the extracted citations. 
        If suitable citations cannot be found, you will return an empty response as instructed.
    `;
    const result = await processWithGemini(undefined, [query], systemPrompt);
    return _.sortBy(result?.data?.citation_text, 'pageNumber');
  } else {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature,
        top_p,
        messages: [{ role: 'user', content: prompt }],
        response_format: zodResponseFormat(citationSchema, 'citations'),
      });
      const content = JSON.parse(
        // @ts-ignore
        _.get(completion, 'choices[0].message.content', null),
      );
      return _.sortBy(content.citations, 'pageNumber');
    } catch (error) {
      console.error(error);
      return [];
    }
  }
}
