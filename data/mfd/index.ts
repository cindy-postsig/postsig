'use server';

import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { DatabaseError } from '@/lib/errors';
import type { Database } from '@/database.types';

type MasterFieldDefinitionRow =
  Database['public']['Tables']['master_field_definitions']['Row'];

export interface MfdWithPrompt extends MasterFieldDefinitionRow {
  prompt_template_content: string | null;
}

/**
 * Fetch MFD rows by field_keys, joined with their linked active prompt template content
 * Returns one MfdWithPrompt per field_key found
 */
export async function getMfdFieldsWithPrompts(
  fieldKeys: string[],
): Promise<MfdWithPrompt[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('master_field_definitions')
    .select(
      `
      *,
      prompt_template_groups!master_field_definitions_prompt_template_group_id_fkey (
        prompt_templates!prompt_templates_prompt_group_id_fkey (
          template_content,
          is_active
        )
      )
    `,
    )
    .in('field_key', fieldKeys);

  if (error) {
    logger.error({ error, fieldKeys }, 'Failed to fetch MFD fields');
    throw new DatabaseError('Failed to fetch MFD fields', error);
  }

  if (!data) {
    return [];
  }

  return data.map((row) => {
    const group = row.prompt_template_groups as unknown as {
      prompt_templates: { template_content: string; is_active: boolean }[];
    } | null;

    const activeTemplate = group?.prompt_templates?.find((t) => t.is_active);

    return {
      id: row.id,
      field_key: row.field_key,
      default_label: row.default_label,
      default_data_type: row.default_data_type,
      default_select_options: row.default_select_options,
      default_ui_component_hint: row.default_ui_component_hint,
      default_validation_rules: row.default_validation_rules,
      default_tooltip_text: row.default_tooltip_text,
      category: row.category,
      settings: row.settings,
      prompt_template_group_id: row.prompt_template_group_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      tmp_ai_prompt: row.tmp_ai_prompt,
      prompt_template_content: activeTemplate?.template_content ?? null,
      required: row.required,
    };
  });
}
