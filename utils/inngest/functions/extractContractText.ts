import { inngest } from '../client';
import { handleContractProcessingFailure } from '@/utils/inngest/helpers';
import { createClient } from '@/utils/supabase/service_server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { geminiModelConfig } from '@/app/lib/constants';
import { OpenAI } from 'openai';
import { Document } from '@/constants/types';
import _ from 'lodash';
import { getHash } from '@/app/lib/utils';
import { extractTextPrompt } from '@/constants/prompts';
import { runPromisesSequentially } from '@/lib/utils';
import { NonRetriableError } from 'inngest';
import { buildSafePath, PathTraversalError } from '@/utils/helpers';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
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

async function storeDocuments(
  documents: Document[],
  hash: string,
  userId: string,
  organizationId: string,
  contractId: number,
) {
  const supabase = createClient();
  const fileName = documents[0]?.metadata?.filename;
  if (fileName) {
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('metadata->>filename', fileName)
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('contract_id', contractId);

    if (deleteError) {
      throw deleteError;
    }
  }
  for (const doc of documents) {
    const embedding = await getEmbedding(doc.content);
    // @ts-ignore
    const { error } = await supabase.from('documents').insert({
      id: `${hash}-${doc.id}`,
      user_id: userId,
      organization_id: organizationId,
      contract_id: contractId,
      content: doc.content,
      metadata: doc.metadata,
      embedding,
    });
    if (error) {
      throw error;
    }
  }
}

function splitTaggedChunks(text: string): string[] {
  const chunks: string[] = [];
  const chunkRegex = /<chunk>([\s\S]*?)<\/chunk>/g;
  const matches = Array.from(text.matchAll(chunkRegex));
  if (matches.length > 0) {
    chunks.push(...matches.map((match) => match[1].trim()));
  }
  const htmlBlockRegex = /```html\s*([\s\S]*?)```/g;
  const htmlMatches = chunks
    .map((chunk) => {
      const matches = Array.from(chunk.matchAll(htmlBlockRegex));
      return matches.map((match) => match[1].trim());
    })
    .filter((match): match is string[] => match.length > 0);
  if (htmlMatches.length > 0) {
    return htmlMatches.flat();
  }
  return chunks.length > 0 ? chunks : [];
}

async function splitPDFIntoChunks(
  arrayBuffer: ArrayBuffer,
  chunkSize: number = 1,
) {
  const PDFDocument = require('pdf-lib').PDFDocument;
  const sourceDoc = await PDFDocument.load(arrayBuffer, {
    ignoreEncryption: true,
  });
  const pageCount = sourceDoc.getPageCount();
  const chunks = [];
  for (let i = 0; i < pageCount; i += chunkSize) {
    const chunkDoc = await PDFDocument.create();
    const pageIndices = Array.from(
      { length: Math.min(chunkSize, pageCount - i) },
      (_, index) => i + index,
    );
    const copiedPages = await chunkDoc.copyPages(sourceDoc, pageIndices);
    copiedPages.forEach((page: any) => chunkDoc.addPage(page));
    const pdfBytes = await chunkDoc.save();
    chunks.push(Buffer.from(pdfBytes));
  }
  return chunks;
}

async function processPDFChunkWithGemini(chunk: Buffer) {
  const systemInstruction = extractTextPrompt;
  const model = genAI.getGenerativeModel({
    ...geminiModelConfig,
    systemInstruction,
    generationConfig: {
      temperature: 0,
      topP: 0.2,
    },
  });
  try {
    const result = await model.generateContent([
      extractTextPrompt,
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: chunk.toString('base64'),
        },
      },
    ]);
    const response = await result.response;
    const text = await response.text();
    const matches = text.match(
      /(?:\-\*\-\*\-|\-\-\-)([\s\S]*?)(?:\-\*\-\*\-|\-\-\-)/,
    );
    const extractedText = matches ? matches[1].trim() : text;

    return extractedText
      .replace(/\\n/g, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (error) {
    throw error;
  }
}

async function uploadMarkdownFile(
  supabase: any,
  userId: string,
  fileName: string,
  content: string,
) {
  const mdFileName = fileName.replace(/\.pdf$/i, '.md');
  let mdFilePath: string;
  try {
    mdFilePath = buildSafePath([userId, mdFileName]);
  } catch (error) {
    if (error instanceof PathTraversalError) {
      throw new Error('Invalid file path');
    }
    throw error;
  }
  const { error } = await supabase.storage
    .from('contract_docs')
    .upload(mdFilePath, content, { upsert: true });
  if (error) {
    throw error;
  }
  return mdFilePath;
}

const extractContractText = inngest.createFunction(
  {
    id: 'extract-contract-text',
    concurrency: 1,
    retries: 5,
    onFailure: async ({ error, event }) => {
      await handleContractProcessingFailure({ error, event });
    },
  },
  { event: 'contracts/extractcontracttext' },
  async ({ event, step, logger }) => {
    const supabase = createClient();
    const { fileName, contractId } = event.data;

    let userId: string;
    let organizationId: string;

    if (event.user?.id && event.user?.organizationId) {
      userId = event.user.id;
      organizationId = event.user.organizationId;
    } else {
      // Fallback for manual reruns where event.user is not preserved
      const { data: contract, error } = await supabase
        .from('contracts')
        .select('user_id, organization_id')
        .eq('id', contractId)
        .single();

      if (error) {
        throw error;
      }

      if (!contract || !contract.user_id || !contract.organization_id) {
        throw new NonRetriableError(
          `Contract ${contractId} not found for user lookup`,
        );
      }
      userId = contract.user_id;
      organizationId = contract.organization_id;
    }

    try {
      let filePath: string;
      try {
        filePath = buildSafePath([userId, fileName]);
      } catch (pathError) {
        if (pathError instanceof PathTraversalError) {
          throw new NonRetriableError('Invalid file path');
        }
        throw pathError;
      }
      const hash = getHash(
        `${userId}-${organizationId}-${fileName}-${contractId}`,
      );
      await step.run(`extract-contract-text:${hash}`, async () => {
        const { data, error } = await supabase.storage
          .from('contract_docs')
          .download(filePath);
        if (error) {
          const errorName =
            error instanceof Error ? error.name : 'Unknown error';
          if (errorName === 'StorageUnknownError') {
            throw new NonRetriableError('Contract document not found');
          }
          throw error;
        }
        const arrayBuffer = await data.arrayBuffer();
        const pdfChunks = await splitPDFIntoChunks(arrayBuffer);
        const textPromises = pdfChunks.map((chunk) =>
          processPDFChunkWithGemini(Buffer.from(chunk)),
        );
        const texts = await runPromisesSequentially(textPromises);
        const strippedTexts = texts.map((text) =>
          splitTaggedChunks(text).join('\n\n'),
        );
        const extractedTexts = strippedTexts.join('\n\n');
        await uploadMarkdownFile(supabase, userId, fileName, extractedTexts);
        // const chunks = await splitTextIntoChunks(data, fileName);
        const chunks = _.flatten(
          texts.map((text, index) => {
            const chunks = splitTaggedChunks(text);
            return chunks.map((chunk, chunkIndex) => ({
              id: `${hash}-${index}-${chunkIndex}`,
              content: chunk,
              metadata: {
                filename: fileName,
                pageNumber: index + 1,
                totalPages: texts.length,
              },
            }));
          }),
        );
        await storeDocuments(chunks, hash, userId, organizationId, contractId);
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

export default extractContractText;
