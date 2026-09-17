import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { createPromptResolver } from '../index';

jest.mock('@/data/prompts', () => ({
  getActivePromptByFieldName: jest.fn(),
}));

const mockCacheService: any = {
  getPrompt: jest.fn(),
  cachePrompt: jest.fn(),
  invalidatePrompt: jest.fn(),
  invalidateAllPrompts: jest.fn(),
};

jest.mock('@/app/lib/redis/cache-service', () => {
  const mockService: any = {
    getPrompt: jest.fn(),
    cachePrompt: jest.fn(),
    invalidatePrompt: jest.fn(),
    invalidateAllPrompts: jest.fn(),
  };
  return {
    // @ts-expect-error - Mock type complexity
    getCacheService: jest.fn().mockResolvedValue(mockService),
  };
});

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@/constants/prompts', () => ({
  allQueries: [
    {
      dbName: 'multi_year',
      query: 'The subscription is for multiple years.',
    },
    {
      dbName: 'subscription_term',
      query: 'Subscription term : {subscription_term} months.',
    },
  ],
}));

const mockGetActivePromptByFieldName =
  require('@/data/prompts').getActivePromptByFieldName;
const { getCacheService } = require('@/app/lib/redis/cache-service');

beforeEach(async () => {
  jest.clearAllMocks();
  const cacheService = await getCacheService();
  cacheService.getPrompt.mockResolvedValue(null);
  cacheService.cachePrompt.mockResolvedValue(true);
});

describe('PromptResolver', () => {
  describe('resolvePrompt', () => {
    it('should resolve prompt from database when available', async () => {
      const mockDbPrompt = {
        id: 'template-123',
        template_content: 'Database prompt content',
        version: 2,
        llm_parameters: { type: 'STRING' },
        version_display: '2025.01.15.1000',
        group_key: 'multi_year',
        prompt_group_id: 'group-123',
      };

      mockGetActivePromptByFieldName.mockResolvedValue(mockDbPrompt);

      const resolver = await createPromptResolver();
      const result = await resolver.resolvePrompt({ fieldName: 'multi_year' });

      expect(result).toEqual({
        content: 'Database prompt content',
        source: 'database',
        version: '2025.01.15.1000',
        metadata: {
          templateId: 'template-123',
          groupId: 'group-123',
          version: 2,
          versionDisplay: '2025.01.15.1000',
          llmParameters: { type: 'STRING' },
          moduleId: undefined,
        },
        promptQuery: {
          dbName: 'multi_year',
          query: 'Database prompt content',
          type: 'STRING',
        },
      });
      expect(mockGetActivePromptByFieldName).toHaveBeenCalledWith(
        'multi_year',
        undefined,
      );
      const cacheService = await getCacheService();
      expect(cacheService.cachePrompt).toHaveBeenCalled();
    });

    it('should resolve prompt from cache when available', async () => {
      const mockCachedPrompt = {
        id: 'template-cached',
        template_content: 'Cached prompt content',
        version: 1,
        llm_parameters: null,
        version_display: '2025.01.10.1000',
        group_key: 'multi_year',
        prompt_group_id: 'group-cached',
      };

      const cacheService = await getCacheService();
      cacheService.getPrompt.mockResolvedValue(mockCachedPrompt);

      const resolver = await createPromptResolver();
      const result = await resolver.resolvePrompt({ fieldName: 'multi_year' });

      expect(result.content).toBe('Cached prompt content');
      expect(result.source).toBe('database');
      expect(cacheService.getPrompt).toHaveBeenCalledWith(
        'multi_year',
        undefined,
      );
      expect(mockGetActivePromptByFieldName).not.toHaveBeenCalled();
    });

    it('should fall back to constants when database returns null', async () => {
      mockGetActivePromptByFieldName.mockResolvedValue(null);

      const resolver = await createPromptResolver();
      const result = await resolver.resolvePrompt({ fieldName: 'multi_year' });

      expect(result).toEqual({
        content: 'The subscription is for multiple years.',
        source: 'fallback',
        promptQuery: {
          dbName: 'multi_year',
          query: 'The subscription is for multiple years.',
        },
      });
    });

    it('should fall back to constants when database throws error', async () => {
      mockGetActivePromptByFieldName.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const resolver = await createPromptResolver();
      const result = await resolver.resolvePrompt({ fieldName: 'multi_year' });

      expect(result).toEqual({
        content: 'The subscription is for multiple years.',
        source: 'fallback',
        promptQuery: {
          dbName: 'multi_year',
          query: 'The subscription is for multiple years.',
        },
      });
    });

    it('should use explicit fallback prompt when provided', async () => {
      mockGetActivePromptByFieldName.mockResolvedValue(null);

      const resolver = await createPromptResolver();
      const result = await resolver.resolvePrompt({
        fieldName: 'custom_field',
        fallbackPrompt: 'Custom fallback prompt',
      });

      expect(result).toEqual({
        content: 'Custom fallback prompt',
        source: 'fallback',
        promptQuery: {
          dbName: 'custom_field',
          query: 'Custom fallback prompt',
        },
      });
    });

    it('should use explicit fallback PromptQuery object when provided', async () => {
      mockGetActivePromptByFieldName.mockResolvedValue(null);

      const fallbackQuery = {
        dbName: 'custom_field',
        query: 'Custom query',
        type: 'ARRAY' as any,
      };

      const resolver = await createPromptResolver();
      const result = await resolver.resolvePrompt({
        fieldName: 'custom_field',
        fallbackPrompt: fallbackQuery,
      });

      expect(result).toEqual({
        content: 'Custom query',
        source: 'fallback',
        promptQuery: fallbackQuery,
      });
    });

    it('should throw error when no prompt found anywhere', async () => {
      mockGetActivePromptByFieldName.mockResolvedValue(null);

      const resolver = await createPromptResolver();

      await expect(
        resolver.resolvePrompt({ fieldName: 'nonexistent_field' }),
      ).rejects.toThrow('No prompt found for field: nonexistent_field');
    });

    it('should handle llm_parameters with items and properties', async () => {
      const mockDbPrompt = {
        id: 'template-123',
        template_content: 'Extract structured data',
        version: 1,
        llm_parameters: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              field1: { type: 'STRING' },
              field2: { type: 'NUMBER' },
            },
          },
        },
        version_display: '2025.01.15.1000',
        group_key: 'multi_year',
        prompt_group_id: 'group-456',
      };

      mockGetActivePromptByFieldName.mockResolvedValue(mockDbPrompt);

      const resolver = await createPromptResolver();
      const result = await resolver.resolvePrompt({
        fieldName: 'multi_year',
      });

      expect(result.promptQuery).toEqual({
        dbName: 'multi_year',
        query: 'Extract structured data',
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            field1: { type: 'STRING' },
            field2: { type: 'NUMBER' },
          },
        },
      });
    });

    it('should resolve module-specific prompt when moduleId is provided', async () => {
      const mockModulePrompt = {
        id: 'template-cpm',
        template_content: 'CPM-specific prompt content',
        version: 1,
        llm_parameters: null,
        version_display: '2025.03.01.1000',
        group_key: 'multi_year',
        prompt_group_id: 'group-cpm',
        module_id: 1,
      };

      mockGetActivePromptByFieldName.mockResolvedValue(mockModulePrompt);

      const resolver = await createPromptResolver();
      const result = await resolver.resolvePrompt({
        fieldName: 'multi_year',
        moduleId: 1,
      });

      expect(result.content).toBe('CPM-specific prompt content');
      expect(result.source).toBe('database');
      expect(result.metadata?.moduleId).toBe(1);
      expect(mockGetActivePromptByFieldName).toHaveBeenCalledWith(
        'multi_year',
        1,
      );
    });

    it('should pass moduleId from context when not set directly', async () => {
      const mockModulePrompt = {
        id: 'template-cpm-ctx',
        template_content: 'CPM context prompt',
        version: 1,
        llm_parameters: null,
        version_display: '2025.03.01.2000',
        group_key: 'multi_year',
        prompt_group_id: 'group-cpm-ctx',
        module_id: 1,
      };

      mockGetActivePromptByFieldName.mockResolvedValue(mockModulePrompt);

      const resolver = await createPromptResolver();
      const result = await resolver.resolvePrompt({
        fieldName: 'multi_year',
        context: { moduleId: 1 },
      });

      expect(result.content).toBe('CPM context prompt');
      expect(mockGetActivePromptByFieldName).toHaveBeenCalledWith(
        'multi_year',
        1,
      );
    });

    it('should use module-scoped cache key when moduleId is provided', async () => {
      const mockCachedModulePrompt = {
        id: 'template-cached-cpm',
        template_content: 'Cached CPM prompt',
        version: 1,
        llm_parameters: null,
        version_display: '2025.03.01.3000',
        group_key: 'multi_year',
        prompt_group_id: 'group-cached-cpm',
        module_id: 1,
      };

      const cacheService = await getCacheService();
      cacheService.getPrompt.mockResolvedValue(mockCachedModulePrompt);

      const resolver = await createPromptResolver();
      await resolver.resolvePrompt({
        fieldName: 'multi_year',
        moduleId: 1,
      });

      expect(cacheService.getPrompt).toHaveBeenCalledWith('multi_year', 1);
      expect(mockGetActivePromptByFieldName).not.toHaveBeenCalled();
    });
  });

  describe('resolveBulkPrompts', () => {
    it('should resolve multiple prompts in parallel', async () => {
      const mockDbPrompt1 = {
        id: 'template-1',
        template_content: 'Prompt 1',
        version: 1,
        llm_parameters: null,
        version_display: '2025.01.15.1000',
        group_key: 'multi_year',
        prompt_group_id: 'group-1',
      };

      const mockDbPrompt2 = {
        id: 'template-2',
        template_content: 'Prompt 2',
        version: 1,
        llm_parameters: null,
        version_display: '2025.01.15.1001',
        group_key: 'subscription_term',
        prompt_group_id: 'group-2',
      };

      mockGetActivePromptByFieldName
        .mockResolvedValueOnce(mockDbPrompt1)
        .mockResolvedValueOnce(mockDbPrompt2);

      const resolver = await createPromptResolver();
      const results = await resolver.resolveBulkPrompts([
        'multi_year',
        'subscription_term',
      ]);

      expect(results.size).toBe(2);
      expect(results.get('multi_year')?.content).toBe('Prompt 1');
      expect(results.get('subscription_term')?.content).toBe('Prompt 2');
      expect(results.get('multi_year')?.source).toBe('database');
      expect(results.get('subscription_term')?.source).toBe('database');
    });

    it('should handle mixed database and fallback results', async () => {
      const mockDbPrompt = {
        id: 'template-1',
        template_content: 'Database prompt',
        version: 1,
        llm_parameters: null,
        version_display: '2025.01.15.1000',
        group_key: 'multi_year',
        prompt_group_id: 'group-1',
      };

      mockGetActivePromptByFieldName
        .mockResolvedValueOnce(mockDbPrompt)
        .mockResolvedValueOnce(null);

      const resolver = await createPromptResolver();
      const results = await resolver.resolveBulkPrompts([
        'multi_year',
        'subscription_term',
      ]);

      expect(results.size).toBe(2);
      expect(results.get('multi_year')?.source).toBe('database');
      expect(results.get('subscription_term')?.source).toBe('fallback');
    });

    it('should skip fields that fail resolution', async () => {
      mockGetActivePromptByFieldName
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const resolver = await createPromptResolver();
      const results = await resolver.resolveBulkPrompts([
        'multi_year',
        'nonexistent_field',
      ]);

      expect(results.size).toBe(1);
      expect(results.has('multi_year')).toBe(true);
      expect(results.has('nonexistent_field')).toBe(false);
    });
  });
});
