import { Context } from 'hono';
import { z } from 'zod';

import { glossaryExtractionSchema } from '@/constants/prompts/glossaryExtractionSchema';
import {
  DOCUMENT_TYPES,
  createSchemaForType,
} from '@/constants/prompts/investorQueries';
import type { DocumentType } from '@/constants/prompts/investorQueries';

function schemaToFieldDetails(
  schema: ReturnType<typeof glossaryExtractionSchema>,
) {
  const jsonSchema = z.toJSONSchema(schema);
  const properties =
    'properties' in jsonSchema ? jsonSchema.properties : undefined;

  const fields: Record<string, unknown> = {};
  for (const [key, fieldSchema] of Object.entries(properties ?? {})) {
    fields[key] = fieldSchema;
  }
  return fields;
}

/**
 * GET /api/v2/investor/extraction-fields
 * Returns extraction field keys and their schemas.
 *
 * Query params:
 *   - docType: filter to fields for a specific document type
 *   - grouped: if "true", return a map of docType → field keys
 *   - detailed: if "true", include full JSON Schema for each field (subfield keys, types, descriptions)
 *
 * No params → returns all field keys.
 */
export function listExtractionFields(c: Context) {
  const docType = c.req.query('docType');
  const grouped = c.req.query('grouped');
  const detailed = c.req.query('detailed') === 'true';

  // Single doc type
  if (docType) {
    if (!DOCUMENT_TYPES.includes(docType as DocumentType)) {
      return c.json(
        {
          error: `Invalid docType: ${docType}`,
          validTypes: DOCUMENT_TYPES,
        },
        400,
      );
    }

    const schema = createSchemaForType(docType as DocumentType, null, null);
    if (detailed) {
      return c.json({ docType, fields: schemaToFieldDetails(schema) });
    }
    const fields = Object.keys(schema.shape);
    return c.json({ docType, fields, count: fields.length });
  }

  // All doc types grouped
  if (grouped === 'true') {
    const fieldsByDocType: Record<string, string[] | Record<string, unknown>> =
      {};
    for (const dt of DOCUMENT_TYPES) {
      const schema = createSchemaForType(dt, null, null);
      fieldsByDocType[dt] = detailed
        ? schemaToFieldDetails(schema)
        : Object.keys(schema.shape);
    }
    return c.json({ fieldsByDocType });
  }

  // Default: all fields across all doc types
  const schema = glossaryExtractionSchema(null, null);
  if (detailed) {
    return c.json({ fields: schemaToFieldDetails(schema) });
  }
  const fields = Object.keys(schema.shape);
  return c.json({ fields, count: fields.length });
}
