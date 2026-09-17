/**
 * Seed master_field_definitions and document_type_fields from
 * glossaryPrompts + investorFieldSchemas.
 *
 * Usage: npx tsx scripts/seed-master-field-definitions.ts
 *
 * - Reads glossaryPrompts for field_key → document type mappings
 * - Reads glossaryExtractionSchema for Zod types / enum values
 * - Inserts into master_field_definitions (skips existing field_key)
 * - Inserts into document_type_fields (skips existing combos)
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { Database } from '../database.types';
import {
  glossaryPrompts,
  type GlossaryEntry,
} from '../constants/prompts/glossaryPrompts';
import { glossaryExtractionSchema } from '../constants/prompts/glossaryExtractionSchema';

const envFile = process.argv[2] ?? '.env.local';
dotenv.config({ path: envFile });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
  );
}

const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);

type Glossary = Record<string, GlossaryEntry>;
type SchemaShape = Record<string, z.ZodType>;
type InsertResult = { id: string | null; isNew: boolean };

const SKIP_FIELDS = new Set<string>([
  'document_type',
  'fund',
  'portfolio_company',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toLabel(fieldKey: string): string {
  return fieldKey
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function unwrap(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodNullable)
    return unwrap(schema.unwrap() as z.ZodType);
  if (schema instanceof z.ZodOptional)
    return unwrap(schema.unwrap() as z.ZodType);
  return schema;
}

function resolveDataType(schema: z.ZodType): string {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodString) return 'string';
  if (inner instanceof z.ZodNumber) return 'number';
  if (inner instanceof z.ZodBoolean) return 'boolean';
  if (inner instanceof z.ZodEnum) return 'enum';
  if (inner instanceof z.ZodArray) return 'json';
  if (inner instanceof z.ZodObject) return 'json';
  return 'string';
}

function extractEnumValues(schema: z.ZodType): string[] | null {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodEnum) return inner.options as string[];
  return null;
}

// ---------------------------------------------------------------------------
// Settings builder (for json-type fields)
// ---------------------------------------------------------------------------

interface SettingsFieldDef {
  type: string;
  label: string;
  required: boolean;
  tmp_ai_desc?: string;
  options?: { label: string; value: string }[];
  schema?: Record<string, SettingsFieldDef>;
}

interface FieldSettings {
  schema: Record<string, SettingsFieldDef>;
  itemName: string;
  renderType: 'array_object' | 'single_object' | 'array_string';
}

function isRequired(schema: z.ZodType): boolean {
  return !(schema instanceof z.ZodNullable || schema instanceof z.ZodOptional);
}

function getDescription(schema: z.ZodType): string | undefined {
  if (schema.description) return schema.description;
  const inner = unwrap(schema);
  if (inner !== schema && inner.description) return inner.description;
  return undefined;
}

function resolveSettingsType(schema: z.ZodType): string {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodBoolean) return 'checkbox';
  if (inner instanceof z.ZodNumber) return 'number';
  if (inner instanceof z.ZodEnum) return 'select';
  if (inner instanceof z.ZodArray) {
    const element = unwrap(inner.element as z.ZodType);
    if (element instanceof z.ZodObject) return 'array_object';
    return 'text';
  }
  if (inner instanceof z.ZodObject) return 'single_object';
  const desc = getDescription(schema);
  if (desc && (/ISO\s*8601/i.test(desc) || /YYYY-MM-DD/.test(desc)))
    return 'date';
  return 'text';
}

function buildFieldDef(key: string, schema: z.ZodType): SettingsFieldDef {
  const type = resolveSettingsType(schema);
  const desc = getDescription(schema);
  const required = isRequired(schema);
  const inner = unwrap(schema);

  const def: SettingsFieldDef = {
    type,
    label: toLabel(key),
    required,
  };

  if (desc) def.tmp_ai_desc = desc;

  if (type === 'select' && inner instanceof z.ZodEnum) {
    def.options = (inner.options as string[]).map((v: string) => ({
      label: toLabel(v),
      value: v,
    }));
  }

  if (type === 'array_object' && inner instanceof z.ZodArray) {
    const element = unwrap(inner.element as z.ZodType);
    if (element instanceof z.ZodObject) {
      def.schema = buildObjectSchema(element);
    }
  }

  if (type === 'single_object' && inner instanceof z.ZodObject) {
    def.schema = buildObjectSchema(inner);
  }

  return def;
}

function buildObjectSchema(
  objectSchema: z.ZodObject<z.ZodRawShape>,
): Record<string, SettingsFieldDef> {
  const result: Record<string, SettingsFieldDef> = {};
  const shape = objectSchema.shape;
  for (const [key, schema] of Object.entries(shape)) {
    result[key] = buildFieldDef(key, schema as z.ZodType);
  }
  return result;
}

function buildSettings(
  fieldKey: string,
  zodSchema: z.ZodType,
  glossaryEntry?: GlossaryEntry,
): FieldSettings | null {
  const inner = unwrap(zodSchema);
  const itemName = glossaryEntry?.label ?? toLabel(fieldKey);

  if (inner instanceof z.ZodArray) {
    const element = unwrap(inner.element as z.ZodType);
    if (element instanceof z.ZodObject) {
      return {
        schema: buildObjectSchema(element),
        itemName,
        renderType: 'array_object',
      };
    }
    // z.array(z.string()) or similar non-object arrays
    return {
      schema: {
        value: {
          type: 'text',
          label: itemName,
          required: true,
        },
      },
      itemName,
      renderType: 'array_string',
    };
  }

  if (inner instanceof z.ZodObject) {
    return {
      schema: buildObjectSchema(inner),
      itemName,
      renderType: 'single_object',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------

async function loadDocumentTypeMap(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('document_types')
    .select('id, code');

  if (error)
    throw new Error('Failed to fetch document_types: ' + error.message);

  const map = new Map<string, number>();
  for (const dt of data ?? []) map.set(dt.code, dt.id);
  console.log('Found ' + map.size + ' document types');
  return map;
}

async function loadExistingFieldKeys(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('master_field_definitions')
    .select('id, field_key');

  if (error)
    throw new Error(
      'Failed to fetch master_field_definitions: ' + error.message,
    );

  const map = new Map<string, string>();
  for (const f of data ?? []) map.set(f.field_key, f.id);
  console.log('Found ' + map.size + ' existing master_field_definitions');
  return map;
}

async function truncateDocTypeFields(): Promise<void> {
  const { error } = await supabase
    .from('document_type_fields')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (error)
    throw new Error(
      'Failed to truncate document_type_fields: ' + error.message,
    );
  console.log('Truncated document_type_fields');
}

// ---------------------------------------------------------------------------
// Insert logic
// ---------------------------------------------------------------------------

async function refetchFieldId(fieldKey: string): Promise<string | null> {
  const { data } = await supabase
    .from('master_field_definitions')
    .select('id')
    .eq('field_key', fieldKey)
    .single();
  return data?.id ?? null;
}

async function insertFieldDefinition(
  fieldKey: string,
  zodSchema: z.ZodType,
  glossaryEntry: GlossaryEntry,
): Promise<InsertResult> {
  const dataType = resolveDataType(zodSchema);
  const enumValues = extractEnumValues(zodSchema);
  const selectOptions = glossaryEntry.selectOptions?.length
    ? [...glossaryEntry.selectOptions]
    : enumValues;
  const settings = buildSettings(fieldKey, zodSchema, glossaryEntry);

  const required = isRequired(zodSchema);

  const { data, error } = await supabase
    .from('master_field_definitions')
    .insert({
      field_key: fieldKey,
      default_label: glossaryEntry.label || toLabel(fieldKey),
      default_data_type: dataType,
      default_tooltip_text: glossaryEntry.tooltip ?? undefined,
      category: glossaryEntry.category ?? undefined,
      default_select_options: selectOptions ?? undefined,
      required,
      ...(settings && {
        settings:
          settings as unknown as Database['public']['Tables']['master_field_definitions']['Insert']['settings'],
      }),
    })
    .select('id')
    .single();

  if (error?.code === '23505') {
    const id = await refetchFieldId(fieldKey);
    if (id)
      await updateFieldMetadata(fieldKey, glossaryEntry, zodSchema, settings);
    return { id, isNew: false };
  }
  if (error) {
    console.error('Failed to insert ' + fieldKey + ': ' + error.message);
    return { id: null, isNew: false };
  }

  const enumSuffix = selectOptions
    ? ' (enum: ' + selectOptions.length + ' options)'
    : '';
  const settingsSuffix = settings ? ' [' + settings.renderType + ']' : '';
  console.log(
    '  [insert] ' + fieldKey + ' -> ' + dataType + enumSuffix + settingsSuffix,
  );
  return { id: data.id, isNew: true };
}

async function updateFieldMetadata(
  fieldKey: string,
  glossaryEntry: GlossaryEntry,
  zodSchema: z.ZodType,
  settings: FieldSettings | null,
): Promise<void> {
  const enumValues = extractEnumValues(zodSchema);
  const selectOptions = glossaryEntry.selectOptions?.length
    ? [...glossaryEntry.selectOptions]
    : enumValues;

  const required = isRequired(zodSchema);

  const { error } = await supabase
    .from('master_field_definitions')
    .update({
      default_label: glossaryEntry.label || toLabel(fieldKey),
      default_tooltip_text: glossaryEntry.tooltip ?? null,
      category: glossaryEntry.category ?? null,
      default_select_options:
        (selectOptions as Database['public']['Tables']['master_field_definitions']['Update']['default_select_options']) ??
        null,
      required,
      settings: (settings ??
        null) as unknown as Database['public']['Tables']['master_field_definitions']['Update']['settings'],
    })
    .eq('field_key', fieldKey);

  if (error) {
    throw new Error(
      'Failed to update metadata for ' + fieldKey + ': ' + error.message,
    );
  }
  console.log(
    '  [update] ' +
      fieldKey +
      ' -> label=' +
      glossaryEntry.label +
      ', category=' +
      glossaryEntry.category +
      (settings ? ', settings=' + settings.renderType : ''),
  );
}

async function ensureFieldDefinition(
  fieldKey: string,
  zodSchema: z.ZodType,
  fieldKeyToId: Map<string, string>,
  glossaryEntry: GlossaryEntry,
): Promise<InsertResult> {
  const existing = fieldKeyToId.get(fieldKey);
  if (existing) {
    const settings = buildSettings(fieldKey, zodSchema, glossaryEntry);
    await updateFieldMetadata(fieldKey, glossaryEntry, zodSchema, settings);
    return { id: existing, isNew: false };
  }

  const result = await insertFieldDefinition(
    fieldKey,
    zodSchema,
    glossaryEntry,
  );
  if (result.id) fieldKeyToId.set(fieldKey, result.id);
  return result;
}

async function insertDocTypeField(
  docTypeId: number,
  mfdId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('document_type_fields')
    .insert({ document_type_id: docTypeId, master_field_definition_id: mfdId });

  if (error) {
    console.error(
      'Failed to insert dtf ' + docTypeId + ':' + mfdId + ' - ' + error.message,
    );
    return false;
  }
  return true;
}

function resolveDocTypeIds(
  codes: readonly string[],
  docTypeMap: Map<string, number>,
  fieldKey: string,
): number[] {
  const ids: number[] = [];
  for (const code of codes) {
    const id = docTypeMap.get(code);
    if (id !== undefined) ids.push(id);
    else
      console.warn(
        '  No document_type for code "' + code + '" (field: ' + fieldKey + ')',
      );
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Seeders
// ---------------------------------------------------------------------------

async function seedFieldDefinitions(
  glossary: Glossary,
  shape: SchemaShape,
  fieldKeyToId: Map<string, string>,
): Promise<number> {
  let inserted = 0;
  for (const fieldKey of Object.keys(glossary)) {
    if (SKIP_FIELDS.has(fieldKey)) continue;
    const zodSchema = shape[fieldKey];
    if (!zodSchema) {
      console.warn('No schema for ' + fieldKey + ', skipping');
      continue;
    }
    const glossaryEntry = glossary[fieldKey];
    const result = await ensureFieldDefinition(
      fieldKey,
      zodSchema,
      fieldKeyToId,
      glossaryEntry,
    );
    if (result.isNew) inserted++;
  }
  return inserted;
}

async function seedDocTypeFields(
  glossary: Glossary,
  docTypeMap: Map<string, number>,
  fieldKeyToId: Map<string, string>,
): Promise<number> {
  let inserted = 0;
  for (const fieldKey of Object.keys(glossary)) {
    if (SKIP_FIELDS.has(fieldKey)) continue;
    const mfdId = fieldKeyToId.get(fieldKey);
    if (!mfdId) continue;
    const docTypeIds = resolveDocTypeIds(
      glossary[fieldKey].types,
      docTypeMap,
      fieldKey,
    );
    for (const docTypeId of docTypeIds) {
      const ok = await insertDocTypeField(docTypeId, mfdId);
      if (ok) inserted++;
    }
  }
  return inserted;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const shape: SchemaShape = glossaryExtractionSchema(null, null).shape;
  const glossary: Glossary = glossaryPrompts;

  const [docTypeMap, fieldKeyToId] = await Promise.all([
    loadDocumentTypeMap(),
    loadExistingFieldKeys(),
  ]);

  const mfdInserted = await seedFieldDefinitions(glossary, shape, fieldKeyToId);
  await truncateDocTypeFields();
  const dtfInserted = await seedDocTypeFields(
    glossary,
    docTypeMap,
    fieldKeyToId,
  );

  console.log('\n--- Summary ---');
  console.log('master_field_definitions inserted: ' + mfdInserted);
  console.log('document_type_fields inserted: ' + dtfInserted);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
