'use server';

import { createClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { DatabaseError } from '@/lib/errors';
import { DatabasePromptResult } from '@/app/lib/prompt-resolver/types';

export async function getActivePromptByFieldName(
  fieldName: string,
  moduleId?: number,
): Promise<DatabasePromptResult | null> {
  const supabase = createClient();

  try {
    let groupQuery = supabase
      .from('prompt_template_groups')
      .select('id, group_key, module_id')
      .eq('group_key', fieldName);

    if (moduleId !== undefined) {
      groupQuery = groupQuery.or(`module_id.eq.${moduleId},module_id.is.null`);
    } else {
      groupQuery = groupQuery.is('module_id', null);
    }

    const { data: groups, error: groupError } = await groupQuery;

    if (groupError) {
      throw new DatabaseError(
        `Failed to fetch prompt group for field: ${fieldName}`,
        groupError,
      );
    }

    if (!groups || groups.length === 0) {
      logger.debug(
        { fieldName, moduleId },
        'No prompt groups found for field name',
      );
      return null;
    }

    // Pick the first matching group
    const selectedGroup = groups[0];

    logger.debug(
      {
        fieldName,
        moduleId,
        selectedModuleId: selectedGroup.module_id,
      },
      'Selected prompt group for field',
    );

    return fetchActiveTemplate(supabase, selectedGroup, fieldName);
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }
    logger.error(
      { error, fieldName },
      'Unexpected error fetching prompt by field name',
    );
    throw new DatabaseError('Unexpected error fetching prompt', error as Error);
  }
}

async function fetchActiveTemplate(
  supabase: ReturnType<typeof createClient>,
  groupData: { id: string; group_key: string; module_id: number | null },
  fieldName: string,
): Promise<DatabasePromptResult | null> {
  try {
    const { data, error } = await supabase
      .from('prompt_templates')
      .select(
        `
          id,
          template_content,
          version,
          llm_parameters,
          version_display,
          prompt_group_id,
          prompt_template_groups!prompt_templates_prompt_group_id_fkey(id, group_key, module_id)
        `,
      )
      .eq('prompt_group_id', groupData.id)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        logger.debug(
          { fieldName },
          'No active prompt found for field name in database',
        );
        return null;
      }
      throw new DatabaseError(
        `Failed to fetch prompt for field: ${fieldName}`,
        error,
      );
    }

    if (!data) {
      logger.debug({ fieldName }, 'No active prompt template found');
      return null;
    }

    const group = data.prompt_template_groups as any;

    return {
      id: data.id,
      template_content: data.template_content,
      version: data.version,
      llm_parameters: data.llm_parameters as Record<string, unknown> | null,
      version_display: data.version_display,
      group_key: group?.group_key,
      prompt_group_id: data.prompt_group_id,
      module_id: group?.module_id ?? null,
    };
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }
    logger.error(
      { error, fieldName },
      'Unexpected error fetching prompt by field name',
    );
    throw new DatabaseError('Unexpected error fetching prompt', error as Error);
  }
}

export async function getPromptTemplatesByGroupId(
  groupId: string,
): Promise<DatabasePromptResult[]> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from('prompt_templates')
      .select(
        `
        id,
        template_content,
        version,
        llm_parameters,
        version_display,
        prompt_group_id,
        is_active,
        prompt_template_groups!inner(group_key)
      `,
      )
      .eq('prompt_group_id', groupId)
      .order('version', { ascending: false });

    if (error) {
      throw new DatabaseError(
        `Failed to fetch prompt templates for group: ${groupId}`,
        error,
      );
    }

    if (!data || data.length === 0) {
      logger.debug({ groupId }, 'No prompt templates found for group');
      return [];
    }

    return data.map((template) => ({
      id: template.id,
      template_content: template.template_content,
      version: template.version,
      llm_parameters: template.llm_parameters as Record<string, unknown> | null,
      version_display: template.version_display,
      group_key: (template.prompt_template_groups as any)?.group_key,
      prompt_group_id: template.prompt_group_id,
    }));
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }
    logger.error(
      { error, groupId },
      'Unexpected error fetching prompt templates by group',
    );
    throw new DatabaseError(
      'Unexpected error fetching prompt templates',
      error as Error,
    );
  }
}

export async function setActivePromptVersion(
  groupId: string,
  templateId: string,
): Promise<void> {
  const supabase = createClient();

  try {
    const { error: deactivateError } = await supabase
      .from('prompt_templates')
      .update({ is_active: false })
      .eq('prompt_group_id', groupId);

    if (deactivateError) {
      throw new DatabaseError(
        `Failed to deactivate existing prompts for group: ${groupId}`,
        deactivateError,
      );
    }

    const { error: activateError } = await supabase
      .from('prompt_templates')
      .update({ is_active: true })
      .eq('id', templateId)
      .eq('prompt_group_id', groupId);

    if (activateError) {
      throw new DatabaseError(
        `Failed to activate prompt template: ${templateId}`,
        activateError,
      );
    }

    const { error: updateGroupError } = await supabase
      .from('prompt_template_groups')
      .update({ active_version_id: templateId })
      .eq('id', groupId);

    if (updateGroupError) {
      throw new DatabaseError(
        `Failed to update active version in group: ${groupId}`,
        updateGroupError,
      );
    }

    logger.info(
      { groupId, templateId },
      'Successfully set active prompt version',
    );
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw error;
    }
    logger.error(
      { error, groupId, templateId },
      'Unexpected error setting active prompt version',
    );
    throw new DatabaseError(
      'Unexpected error setting active prompt version',
      error as Error,
    );
  }
}
