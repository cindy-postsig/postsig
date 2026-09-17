import { createClient } from '@/utils/supabase/service_server';
import {
  GoogleGenerativeAI,
  SchemaType,
  ArraySchema,
} from '@google/generative-ai';
import {
  generalAssistantInstructions,
  ContractBasicsResponse,
  geminiModelConfig,
} from '@/app/lib/constants';
import _ from 'lodash';
import { baseQueries, dateQueries, otherQueries } from '@/constants/prompts';
import { buildSafePath, PathTraversalError } from '@/utils/helpers';

export function createResponseSchema(queries: any[]): ArraySchema {
  return {
    description: 'AI Extraction Schema',
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: _.reduce(
        queries,
        (acc: any, cur: any) => {
          acc[cur.dbName] = {
            type: cur.type || SchemaType.STRING,
            description: cur?.description ?? cur?.query,
            nullable: true,
          };
          if (cur.required) {
            acc[cur.dbName].required = cur.required;
          }
          if (cur.type === SchemaType.ARRAY) {
            acc[cur.dbName].items = {
              ...cur.items,
            };
          }
          if (cur.type === SchemaType.OBJECT) {
            acc[cur.dbName].properties = {
              ...cur.properties,
            };
          }
          return acc;
        },
        {},
      ),
      required: _.map(queries, 'dbName'),
    },
  };
}

export async function getContractBasicsWithGoogle(
  filePath: string,
  queries?: any,
  excludeSpecs?: boolean,
): Promise<ContractBasicsResponse> {
  const segments = filePath.split('/').filter(Boolean);
  let safePath: string;
  try {
    safePath = buildSafePath(segments);
  } catch (error) {
    if (error instanceof PathTraversalError) {
      throw new Error('Invalid file path');
    }
    throw error;
  }

  let prompts = [];
  if (queries) {
    prompts = queries;
  } else {
    prompts = [...dateQueries, ...otherQueries];
    if (!excludeSpecs) {
      prompts = [...baseQueries, ...prompts];
    }
  }
  const supabase = createClient();
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const schema = createResponseSchema(prompts);
  const model = genAI.getGenerativeModel({
    model: geminiModelConfig.model,
    generationConfig: {
      ...geminiModelConfig.generationConfig,
      responseSchema: schema,
    },
  });
  const { data: pdfBuffer, error: downloadError } = await supabase.storage
    .from('contract_docs')
    .download(safePath);
  if (downloadError) {
    throw new Error(`Error downloading PDF: ${downloadError.message}`);
  }
  const pdfBase64 = Buffer.from(await pdfBuffer.arrayBuffer()).toString(
    'base64',
  );
  try {
    const result = await model.generateContent([
      {
        inlineData: {
          data: pdfBase64,
          mimeType: 'application/pdf',
        },
      },
      generalAssistantInstructions,
    ]);
    const response = await result.response;
    const analysis = JSON.parse(response.text());

    const usage = {
      total_tokens: _.get(response, 'usageMetadata.totalTokenCount', 0),
      prompt_tokens: _.get(response, 'usageMetadata.promptTokenCount', 0),
      completion_tokens: _.get(
        response,
        'usageMetadata.candidatesTokenCount',
        0,
      ),
    };
    return {
      data: _.get(analysis, '[0]', null),
      usage,
    };
  } catch (error) {
    throw error;
  }
}

export async function processWithGemini(
  filePath?: string,
  queries?: any,
  systemPrompt?: string,
): Promise<ContractBasicsResponse> {
  const supabase = createClient();
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const schema = createResponseSchema(queries);
  const model = genAI.getGenerativeModel({
    model: geminiModelConfig.model,
    generationConfig: {
      ...geminiModelConfig.generationConfig,
      responseSchema: schema,
    },
    systemInstruction: systemPrompt ? systemPrompt : undefined,
  });
  let pdfBase64 = null;
  if (filePath) {
    const segments = filePath.split('/').filter(Boolean);
    let safePath: string;
    try {
      safePath = buildSafePath(segments);
    } catch (error) {
      if (error instanceof PathTraversalError) {
        throw new Error('Invalid file path');
      }
      throw error;
    }

    const { data: pdfBuffer, error: downloadError } = await supabase.storage
      .from('contract_docs')
      .download(safePath);
    if (downloadError) {
      throw new Error(`Error downloading PDF: ${downloadError.message}`);
    }
    pdfBase64 = Buffer.from(await pdfBuffer.arrayBuffer()).toString('base64');
  }
  const inlineData = pdfBase64
    ? {
        data: pdfBase64,
        mimeType: 'application/pdf',
      }
    : null;
  const configuration: any = {};
  const options = [];
  if (inlineData) {
    configuration.inlineData = inlineData;
    options.push(configuration);
  }
  options.push(
    'You are a helpful assistant that can answer questions about the contract.',
  );
  try {
    const result = await model.generateContent(options);
    const response = await result.response;
    const analysis = JSON.parse(response.text());

    const usage = {
      total_tokens: _.get(response, 'usageMetadata.totalTokenCount', 0),
      prompt_tokens: _.get(response, 'usageMetadata.promptTokenCount', 0),
      completion_tokens: _.get(
        response,
        'usageMetadata.candidatesTokenCount',
        0,
      ),
    };
    return {
      data: _.get(analysis, '[0]', null),
      usage,
    };
  } catch (error) {
    throw error;
  }
}
