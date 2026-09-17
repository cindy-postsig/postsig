import {
  GoogleGenerativeAI,
  SchemaType,
  ArraySchema,
} from '@google/generative-ai';
import _ from 'lodash';
import {
  allQueries,
  fieldAnalysisInstructions,
} from '@/constants/prompts/utils';
import { fieldsToCite } from '@/constants/prompts/utils';
import { geminiCitationModelConfig } from '@/app/lib/constants';
import { citationv2Instructions } from '@/constants/prompts/utils';

export function getFieldAnalysisSchema(): ArraySchema {
  return {
    description: 'Field Analysis Schema',
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: {
        fieldName: {
          type: SchemaType.STRING,
          description:
            'The field name from the input, used to identify the field.',
        },
        parentValue: {
          type: SchemaType.STRING,
          description: 'The field value from the parent contract.',
        },
        childValue: {
          type: SchemaType.STRING,
          description: 'The field value from the child contract.',
        },
        action: {
          type: SchemaType.STRING,
          description: 'The action that was taken on the field.',
        },
      },
      required: ['fieldName', 'parentValue', 'childValue', 'action'],
    },
  };
}

function createFieldAnalysisPrompt(fieldsWithValues: any[]) {
  return `
    <EXTRACTED_PARENT_CONTRACT_DATA>
      ${fieldsWithValues.map((field) => {
        return `<${field.fieldName}>${field.parentValue}</${field.fieldName}>`;
      })}
    </EXTRACTED_PARENT_CONTRACT_DATA>
    <EXTRACTED_CHILD_CONTRACT_DATA>
      ${fieldsWithValues.map((field) => {
        return `<${field.fieldName}>${
          typeof field.childValue === 'object'
            ? JSON.stringify(field.childValue)
            : field.childValue
        }</${field.fieldName}>`;
      })}
    </EXTRACTED_CHILD_CONTRACT_DATA>
    `;
}

export async function getFieldAnalysis({
  parentContract,
  childContract,
  fieldsWithValues,
  parentContractDoc,
  childContractDoc,
}: {
  parentContract: any;
  childContract: any;
  fieldsWithValues: any[];
  parentContractDoc: any;
  childContractDoc: any;
}) {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const prompt = createFieldAnalysisPrompt(fieldsWithValues);
  const model = genAI.getGenerativeModel({
    model: geminiCitationModelConfig.model,
    generationConfig: {
      ...geminiCitationModelConfig.generationConfig,
      responseSchema: getFieldAnalysisSchema(),
    },
    systemInstruction: fieldAnalysisInstructions,
  });
  const parentPdfBase64 = Buffer.from(
    await parentContractDoc.arrayBuffer(),
  ).toString('base64');
  const childPdfBase64 = Buffer.from(
    await childContractDoc.arrayBuffer(),
  ).toString('base64');
  const result = await model.generateContent([
    {
      inlineData: {
        data: parentPdfBase64,
        mimeType: 'application/pdf',
      },
    },
    {
      inlineData: {
        data: childPdfBase64,
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
