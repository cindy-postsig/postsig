import 'server-only';
import {
  GoogleGenerativeAI,
  SchemaType,
  ArraySchema,
} from '@google/generative-ai';
import _ from 'lodash';
import logger from '@/utils/pino';
import { fieldsToCite } from '@/constants/prompts/utils';
import { geminiCitationModelConfig } from '@/app/lib/constants';
import { citationv2Instructions } from '@/constants/prompts/utils';
import { prompts, fields } from '@postsig/toolkit';
const {
  additionalQueries,
  assetClassQueries,
  baseQueries,
  citationQueries,
  dateQueries,
  lineageQueries,
  ndaQueries,
  otherQueries,
  technicalQueries,
} = prompts;
const allQueries = [
  ...additionalQueries,
  ...assetClassQueries,
  ...baseQueries,
  ...citationQueries,
  ...dateQueries,
  ...lineageQueries,
  ...ndaQueries,
  ...otherQueries,
  ...technicalQueries,
];

export function getCitationSchema(): ArraySchema {
  return {
    description: 'Citation Schema',
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: {
        target_property_tag: {
          type: SchemaType.STRING,
          description:
            'The tag name from the input, used to identify the question.',
        },
        citations: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              quote: {
                type: SchemaType.STRING,
                description:
                  'The exact, verbatim text from the DOCUMENT. The quote must be concise (typically 1-3 sentences) and contain only the text necessary to support the claim.',
              },
              page_number: {
                type: SchemaType.INTEGER,
                description:
                  'The page number where the quote is found. If none is stated, this MUST be null.',
              },
            },
            required: ['quote', 'page_number'],
          },
        },
      },
      required: ['target_property_tag', 'citations'],
    },
  };
}

function createCitationPrompt(
  targetPropertyTag: string,
  query: string,
  answer: string,
) {
  return `
    <${targetPropertyTag}>
      <CONTEXTUAL_QUERY>
          ${query}
      </CONTEXTUAL_QUERY>
      <GIVEN_ANSWER>
          ${answer}
      </GIVEN_ANSWER>
    </${targetPropertyTag}>
    `;
}

export async function getCitations(contract: any, fileBuffer: Buffer) {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const prompt = fieldsToCite
    .map((field: any) => {
      let answer = field.getContractData
        ? field.getContractData(contract)
        : contract[field.fieldName];
      if (typeof answer === 'boolean') {
        answer = answer.toString();
      }
      if (!answer) {
        return '';
      }
      const prompt = _.get(
        _.find(allQueries, { dbName: field.dbName || field.fieldName }),
        'query',
        null,
      );
      if (!prompt) {
        logger.warn(
          { fieldName: field.fieldName },
          `No prompt found for field ${field.fieldName}`,
        );
        return '';
      }
      return createCitationPrompt(field.fieldName, prompt, answer);
    })
    .join('<DOCUMENT>attached inline document</DOCUMENT>\n');
  const model = genAI.getGenerativeModel({
    model: geminiCitationModelConfig.model,
    generationConfig: {
      ...geminiCitationModelConfig.generationConfig,
      responseSchema: getCitationSchema(),
    },
    systemInstruction: citationv2Instructions,
  });
  const pdfBase64 = fileBuffer.toString('base64');
  const result = await model.generateContent([
    {
      inlineData: {
        data: pdfBase64,
        mimeType: 'application/pdf',
      },
    },
    {
      text: prompt,
    },
  ]);
  const response = await result.response;
  const analysis = JSON.parse(response.text());
  const usage = {
    total_tokens: _.get(response, 'usageMetadata.totalTokenCount', 0),
    prompt_tokens: _.get(response, 'usageMetadata.promptTokenCount', 0),
    completion_tokens: _.get(response, 'usageMetadata.candidatesTokenCount', 0),
  };
  return {
    data: analysis,
    usage,
  };
}
