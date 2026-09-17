import { Database } from '@/types/database.types';
import { SchemaType } from '@google/generative-ai';

export type PromptTemplateGroupRow =
  Database['public']['Tables']['prompt_template_groups']['Row'];
export type PromptTemplateRow =
  Database['public']['Tables']['prompt_templates']['Row'];

export type PromptSource = 'database' | 'fallback';

export type PromptQueryProperties = Record<
  string,
  { type: SchemaType } | undefined
>;

export interface PromptQuery {
  dbName: string;
  query: string;
  type?: SchemaType;
  items?: {
    type: SchemaType;
    properties?: PromptQueryProperties;
  };
  properties?: PromptQueryProperties;
}

export interface PromptResolutionMetadata {
  templateId?: string;
  groupId?: string;
  version?: number;
  versionDisplay?: string;
  llmParameters?: Record<string, unknown>;
  moduleId?: number;
}

export interface PromptResolutionResult {
  content: string;
  source: PromptSource;
  version?: string;
  metadata?: PromptResolutionMetadata;
  promptQuery?: PromptQuery;
}

export interface PromptResolverContext {
  organizationId?: string;
  contractTypeId?: number;
  moduleId?: number;
}

export interface PromptResolverOptions {
  fieldName: string;
  fallbackPrompt?: string | PromptQuery;
  context?: PromptResolverContext;
  moduleId?: number;
  cacheTTL?: number;
}

export interface DatabasePromptResult {
  id: string;
  template_content: string;
  version: number;
  llm_parameters: Record<string, unknown> | null;
  version_display: string | null;
  group_key: string;
  prompt_group_id: string;
  module_id?: number | null;
}
