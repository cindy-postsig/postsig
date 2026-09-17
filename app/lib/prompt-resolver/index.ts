'use server';

import { z } from 'zod';
import logger from '@/utils/pino';
import { getActivePromptByFieldName } from '@/data/prompts';
import { getMfdFieldsWithPrompts } from '@/data/mfd';
import { buildSchemaFromMfdFields } from '@/lib/mfd-schema/builder';
import {
  PromptResolverOptions,
  PromptResolutionResult,
  PromptQuery,
  PromptSource,
  DatabasePromptResult,
} from './types';
import { allQueries } from '@/constants/prompts';
import _ from 'lodash';
import { getCacheService } from '@/app/lib/redis/cache-service';

class PromptResolver {
  private allowedFields: string[];
  constructor() {
    this.allowedFields = [
      'multi_year',
      'subscription_term',
      'cancel_by_date',
      'all_parties_signed',
      'marketing_rights',
      'activities',
      'end_users',
      'internal_external_users',
      'exclusivity_terms',
      'geo_restrictions',
      'suspension_of_service',
      'term_start_date',
      'cpi',
      'billing_frequency',
      'payment_terms',
      'data_disposal_tnc',
      'audit_requirements',
      'annual_increase',
      'discount',
      'currency',
      'cancellation_process',
      'distribution_rights',
      'number_of_users',
      'market_data_types',
      'derivative_works',
      'renewal_period',
      'auto_renewal',
      'ai_training_restrictions',
    ];
  }
  async resolvePrompt(
    options: PromptResolverOptions,
  ): Promise<PromptResolutionResult> {
    const {
      fieldName,
      fallbackPrompt,
      context,
      moduleId,
      cacheTTL = 3600,
    } = options;

    const effectiveModuleId = moduleId ?? context?.moduleId;

    logger.debug(
      { fieldName, moduleId: effectiveModuleId, context },
      'Starting prompt resolution for field',
    );

    try {
      if (!this.allowedFields.includes(fieldName)) {
        logger.warn(
          { fieldName },
          'Field is not allowed, falling back to fallback',
        );
        throw new Error(`Field ${fieldName} is not allowed`);
      }

      const cacheService = await getCacheService();
      const cachedPrompt = await cacheService.getPrompt(
        fieldName,
        effectiveModuleId,
      );

      if (cachedPrompt) {
        logger.info(
          { fieldName, moduleId: effectiveModuleId, source: 'cache' },
          'Resolved prompt from cache',
        );
        return this.buildPromptResult(cachedPrompt, fieldName);
      }

      const dbPrompt = await getActivePromptByFieldName(
        fieldName,
        effectiveModuleId,
      );

      if (dbPrompt) {
        logger.info(
          {
            fieldName,
            templateId: dbPrompt.id,
            version: dbPrompt.version,
            versionDisplay: dbPrompt.version_display,
            moduleId: dbPrompt.module_id,
          },
          'Resolved prompt from database',
        );

        await cacheService.cachePrompt(
          fieldName,
          dbPrompt,
          cacheTTL,
          effectiveModuleId,
        );

        return this.buildPromptResult(dbPrompt, fieldName);
      }
    } catch (error) {
      logger.warn(
        { error, fieldName },
        'Database lookup failed, falling back to constants',
      );
    }

    const fallback = this.resolveFallback(fieldName, fallbackPrompt);

    if (fallback) {
      logger.info(
        { fieldName, source: 'fallback' },
        'Resolved prompt from fallback constants',
      );

      return {
        content: fallback.query,
        source: 'fallback' as PromptSource,
        promptQuery: fallback,
      };
    }

    logger.error({ fieldName }, 'No prompt found in database or fallback');
    throw new Error(`No prompt found for field: ${fieldName}`);
  }

  async resolveBulkPrompts(
    fieldNames: string[],
    fallbackPrompts?: Map<string, string | PromptQuery>,
    moduleId?: number,
  ): Promise<Map<string, PromptResolutionResult>> {
    logger.debug(
      { fieldCount: fieldNames.length, moduleId },
      'Starting bulk prompt resolution',
    );

    const results = new Map<string, PromptResolutionResult>();

    await Promise.all(
      fieldNames.map(async (fieldName) => {
        try {
          const fallback = fallbackPrompts?.get(fieldName);
          const result = await this.resolvePrompt({
            fieldName,
            fallbackPrompt: fallback,
            moduleId,
          });
          results.set(fieldName, result);
        } catch (error) {
          logger.error(
            { error, fieldName },
            'Failed to resolve prompt in bulk operation',
          );
        }
      }),
    );

    logger.info(
      {
        requested: fieldNames.length,
        resolved: results.size,
        failed: fieldNames.length - results.size,
      },
      'Bulk prompt resolution completed',
    );

    return results;
  }

  private resolveFallback(
    fieldName: string,
    fallbackPrompt?: string | PromptQuery,
  ): PromptQuery | null {
    if (fallbackPrompt) {
      if (typeof fallbackPrompt === 'string') {
        return {
          dbName: fieldName,
          query: fallbackPrompt,
        };
      }
      return fallbackPrompt;
    }

    const constantPrompt = _.find(allQueries, { dbName: fieldName });

    if (constantPrompt) {
      return constantPrompt as PromptQuery;
    }

    return null;
  }

  private buildPromptResult(
    dbPrompt: DatabasePromptResult,
    fieldName: string,
  ): PromptResolutionResult {
    const promptQuery: PromptQuery = {
      dbName: fieldName,
      query: dbPrompt.template_content,
    };

    if (dbPrompt.llm_parameters) {
      if (dbPrompt.llm_parameters.type) {
        promptQuery.type = dbPrompt.llm_parameters.type as any;
      }
      if (dbPrompt.llm_parameters.items) {
        promptQuery.items = dbPrompt.llm_parameters.items as any;
      }
      if (dbPrompt.llm_parameters.properties) {
        promptQuery.properties = dbPrompt.llm_parameters.properties as any;
      }
    }

    return {
      content: dbPrompt.template_content,
      source: 'database' as PromptSource,
      version: dbPrompt.version_display || `v${dbPrompt.version}`,
      metadata: {
        templateId: dbPrompt.id,
        groupId: dbPrompt.prompt_group_id,
        version: dbPrompt.version,
        versionDisplay: dbPrompt.version_display || undefined,
        llmParameters: dbPrompt.llm_parameters || undefined,
        moduleId: dbPrompt.module_id ?? undefined,
      },
      promptQuery,
    };
  }

  async invalidateCache(fieldName?: string, moduleId?: number): Promise<void> {
    const cacheService = await getCacheService();

    if (fieldName) {
      await cacheService.invalidatePrompt(fieldName, moduleId);
      logger.info(
        { fieldName, moduleId },
        'Invalidated prompt cache for field',
      );
    } else {
      await cacheService.invalidateAllPrompts();
      logger.info('Invalidated all prompt caches');
    }
  }
}

export async function createPromptResolver(): Promise<PromptResolver> {
  return new PromptResolver();
}

export async function resolvePromptForField(
  fieldName: string,
  fallbackPrompt?: string | PromptQuery,
  moduleId?: number,
): Promise<PromptResolutionResult> {
  const resolver = new PromptResolver();
  return resolver.resolvePrompt({ fieldName, fallbackPrompt, moduleId });
}

export async function resolvePromptsForFields(
  fieldNames: string[],
  moduleId?: number,
): Promise<Map<string, PromptResolutionResult>> {
  const resolver = new PromptResolver();
  return resolver.resolveBulkPrompts(fieldNames, undefined, moduleId);
}

/**
 * Resolve a Zod schema from MFD field_keys
 */
export async function resolveSchemaFromMfd(
  fieldKeys: string[],
  options?: {
    fallbackSchema?: z.ZodObject<Record<string, z.ZodTypeAny>>;
  },
): Promise<z.ZodObject<Record<string, z.ZodTypeAny>>> {
  try {
    const mfdFields = await getMfdFieldsWithPrompts(fieldKeys);

    if (mfdFields.length === 0) {
      logger.warn({ fieldKeys }, 'No MFD fields found, using fallback schema');
      if (options?.fallbackSchema) {
        return options.fallbackSchema;
      }
      throw new Error(`No MFD fields found for keys: ${fieldKeys.join(', ')}`);
    }

    if (mfdFields.length < fieldKeys.length) {
      const foundKeys = mfdFields.map((f) => f.field_key);
      const missingKeys = fieldKeys.filter((k) => !foundKeys.includes(k));
      throw new Error(
        `Missing MFD field_keys in database: ${missingKeys.join(', ')}`,
      );
    }

    const schema = buildSchemaFromMfdFields(mfdFields);

    logger.info(
      {
        fieldKeys,
        resolvedCount: mfdFields.length,
        promptSources: mfdFields.map((f) => ({
          field: f.field_key,
          hasPrompt: !!f.prompt_template_content,
        })),
      },
      'Resolved MFD schema',
    );

    return schema;
  } catch (error) {
    logger.warn(
      { error, fieldKeys },
      'Failed to resolve MFD schema, using fallback',
    );
    if (options?.fallbackSchema) {
      return options.fallbackSchema;
    }
    throw error;
  }
}
