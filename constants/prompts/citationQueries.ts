import { SchemaType } from '@google/generative-ai';

export const citationQueries = [
  {
    dbName: 'citation_text',
    query: `Please return the citations for the contract.`,
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: {
        id: { type: SchemaType.STRING },
        pageNumber: { type: SchemaType.NUMBER },
        citationText: { type: SchemaType.STRING },
      },
    },
  },
];
