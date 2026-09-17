/**
 * One-off script to generate a CSV of all AI extraction prompts.
 *
 * Field names come from glossaryExtractionSchema — the canonical keys
 * that end up in module_document_extractions.raw_extraction.
 *
 * Grouped by document type. Fields used by multiple doc types are
 * duplicated into each section so every type is self-contained.
 *
 * Usage: npx tsx scripts/generate-prompt-csv.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

import { glossaryExtractionSchema } from '../constants/prompts/glossaryExtractionSchema';
import { glossaryPrompts } from '../constants/prompts/glossaryPrompts';
import {
  investorBasicsQuery,
  investorExtractionFundDescribe,
} from '../constants/prompts/investorFieldSchemas/systemPrompts';

const OUTPUT_PATH = path.resolve(
  __dirname,
  '../investor-extraction-prompts.csv',
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Row {
  documentType: string;
  fieldName: string;
  zodType: string;
  prompt: string;
}

// ---------------------------------------------------------------------------
// Friendly document type names
// ---------------------------------------------------------------------------
const DOC_TYPE_LABELS: Record<string, string> = {
  spa: 'SPA',
  coi: 'COI / Charter',
  ira: 'IRA',
  voting: 'Voting Agreement',
  rofr_cosale: 'ROFR / Co-Sale',
  side_letter: 'Side Letter',
  amendment: 'Amendment',
  safe: 'SAFE',
  cpn: 'CPN',
  warrant: 'Warrant',
  subscription: 'Subscription',
  kiss: 'KISS',
  promissory_note: 'Promissory Note',
  merger_agreement: 'M&A',
  letter_of_transmittal: 'Letter of Transmittal',
  secondary_purchase: 'Secondary Purchase',
  schedule_of_investments: 'Schedule of Investments',
  share_certificate: 'Share Certificate',
  investment_agreement: 'Investment Agreement',
  joinder: 'Joinder',
  term_sheet: 'Term Sheet',
  cap_table: 'Cap Table',
  pitch_deck: 'Pitch Deck',
  due_diligence_package: 'Due Diligence',
  venture_debt: 'Venture Debt',
  lpa: 'LPA',
};

// Document type sort order — SPA first, then alpha, system prompts last
const DOC_TYPE_ORDER: Record<string, number> = {
  SPA: 0,
  'System Prompts': 999,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function zodTypeLabel(schema: z.ZodType): string {
  if (schema instanceof z.ZodNullable)
    return zodTypeLabel(schema.unwrap() as z.ZodType);
  if (schema instanceof z.ZodOptional)
    return zodTypeLabel(schema.unwrap() as z.ZodType);
  if (schema instanceof z.ZodObject) return 'object';
  if (schema instanceof z.ZodArray) return 'array';
  if (schema instanceof z.ZodString) return 'string';
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'boolean';
  if (schema instanceof z.ZodEnum) return 'enum';
  if (schema instanceof z.ZodRecord) return 'record';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Flatten a Zod schema into rows (without category — we add that per doc type)
// ---------------------------------------------------------------------------
interface FlatField {
  fieldName: string;
  zodType: string;
  prompt: string;
}

function flattenSchema(schema: z.ZodType, fieldKey: string): FlatField[] {
  const results: FlatField[] = [];

  let inner: z.ZodType = schema;
  if (inner instanceof z.ZodNullable) inner = inner.unwrap() as z.ZodType;
  if (inner instanceof z.ZodOptional) inner = inner.unwrap() as z.ZodType;

  const topDesc = schema.description ?? inner.description ?? '';

  if (inner instanceof z.ZodObject) {
    if (topDesc) {
      results.push({
        fieldName: fieldKey,
        zodType: 'object',
        prompt: topDesc.trim(),
      });
    }
    const shape = inner.shape as Record<string, z.ZodType>;
    for (const [subKey, subSchema] of Object.entries(shape)) {
      const subDesc = subSchema.description ?? '';
      let unwrapped: z.ZodType = subSchema;
      if (unwrapped instanceof z.ZodNullable)
        unwrapped = unwrapped.unwrap() as z.ZodType;
      if (unwrapped instanceof z.ZodOptional)
        unwrapped = unwrapped.unwrap() as z.ZodType;

      if (unwrapped instanceof z.ZodObject || unwrapped instanceof z.ZodArray) {
        results.push(...flattenSchema(subSchema, `${fieldKey}.${subKey}`));
      } else if (subDesc) {
        results.push({
          fieldName: `${fieldKey}.${subKey}`,
          zodType: zodTypeLabel(subSchema),
          prompt: subDesc.trim(),
        });
      }
    }
  } else if (inner instanceof z.ZodArray) {
    if (topDesc) {
      results.push({
        fieldName: fieldKey,
        zodType: 'array',
        prompt: topDesc.trim(),
      });
    }
    let element = inner.element;
    if (element instanceof z.ZodNullable) element = element.unwrap();
    if (element instanceof z.ZodOptional) element = element.unwrap();

    if (element instanceof z.ZodObject) {
      const shape = element.shape as Record<string, z.ZodType>;
      for (const [subKey, subSchema] of Object.entries(shape)) {
        const subDesc = subSchema.description ?? '';
        if (subDesc) {
          results.push({
            fieldName: `${fieldKey}[].${subKey}`,
            zodType: zodTypeLabel(subSchema),
            prompt: subDesc.trim(),
          });
        }
      }
    }
  } else {
    if (topDesc) {
      results.push({
        fieldName: fieldKey,
        zodType: zodTypeLabel(schema),
        prompt: topDesc.trim(),
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// 1. Pre-flatten all fields from the canonical schema
const refSchema = glossaryExtractionSchema(null, null);
const shape = refSchema.shape as Record<string, z.ZodType>;

// Build: fieldKey → { types, flatFields }
const fieldMap = new Map<string, { types: string[]; flat: FlatField[] }>();

for (const [fieldKey, fieldSchema] of Object.entries(shape)) {
  const entry = glossaryPrompts[fieldKey];
  const types = entry ? [...entry.types] : [];
  const flat = flattenSchema(fieldSchema, fieldKey);
  fieldMap.set(fieldKey, { types, flat });
}

// 2. Group by document type — duplicate shared fields into each type
const docTypeRows = new Map<string, Row[]>();

for (const [, { types, flat }] of fieldMap) {
  if (types.length === 0) continue; // skip unmapped fields

  for (const docType of types) {
    const label = DOC_TYPE_LABELS[docType] ?? docType;
    if (!docTypeRows.has(label)) {
      docTypeRows.set(label, []);
    }
    for (const f of flat) {
      docTypeRows.get(label)!.push({
        documentType: label,
        fieldName: f.fieldName,
        zodType: f.zodType,
        prompt: f.prompt,
      });
    }
  }
}

// 3. Add system prompts at the end
const systemRows: Row[] = [
  {
    documentType: 'System Prompts',
    fieldName: 'investor_basics_query.company_name',
    zodType: 'string',
    prompt: investorBasicsQuery.company_name.trim(),
  },
  {
    documentType: 'System Prompts',
    fieldName: 'investor_basics_query.document_type',
    zodType: 'string',
    prompt: investorBasicsQuery.document_type.trim(),
  },
  {
    documentType: 'System Prompts',
    fieldName: 'investor_basics_query.fund_name',
    zodType: 'string',
    prompt: investorBasicsQuery.fund_name.trim(),
  },
  {
    documentType: 'System Prompts',
    fieldName: 'investor_extraction_fund_describe',
    zodType: 'string',
    prompt: investorExtractionFundDescribe.trim(),
  },
];
docTypeRows.set('System Prompts', systemRows);

// 4. Sort document types: SPA first, then alpha, System Prompts last
const sortedTypes = [...docTypeRows.keys()].sort((a, b) => {
  const aOrder = DOC_TYPE_ORDER[a] ?? 1;
  const bOrder = DOC_TYPE_ORDER[b] ?? 1;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.localeCompare(b);
});

// 5. Assemble all rows in order
const allRows: Row[] = [];
for (const docType of sortedTypes) {
  allRows.push(...docTypeRows.get(docType)!);
}

// 6. Build CSV
const header = 'Document Type,Field Name,Zod Type,Prompt';
const csvRows = allRows.map(
  (r) =>
    `${escapeCSV(r.documentType)},${escapeCSV(r.fieldName)},${escapeCSV(r.zodType)},${escapeCSV(r.prompt)}`,
);

const csv = [header, ...csvRows].join('\n');
fs.writeFileSync(OUTPUT_PATH, csv, 'utf-8');

// Stats
console.log(`Generated ${allRows.length} entries → ${OUTPUT_PATH}`);
console.log('Fields per document type:');
for (const docType of sortedTypes) {
  const topLevel = docTypeRows
    .get(docType)!
    .filter((r) => !r.fieldName.includes('.') && !r.fieldName.includes('[]'));
  console.log(
    `  ${docType}: ${topLevel.length} fields (${docTypeRows.get(docType)!.length} rows incl. sub-fields)`,
  );
}
