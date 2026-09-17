/**
 * Chat Tools - Vendor Intelligence Synthesis Tool
 *
 * Aggregates outputs from multiple tools already called in the conversation
 * and generates a unified intelligence report using LLM synthesis.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import type { UserMetadata } from '@/constants/types';
import logger from '@/utils/pino';
import type {
  SynthesisToolOutput,
  VendorSynthesisInput,
  VendorSynthesisResult,
  SpendToolOutput,
  PaymentTermsToolOutput,
  TagsToolOutput,
  GroupsToolOutput,
  SynthesisSection,
  ContractReference,
} from '../types';
import { isToolError } from '../types';

// =============================================================================
// TYPES
// =============================================================================

interface ExtractedToolOutputs {
  spend?: SpendToolOutput;
  paymentTerms?: PaymentTermsToolOutput;
  tags?: TagsToolOutput;
  groups?: GroupsToolOutput;
}

interface ModelMessage {
  role: string;
  content: unknown;
  toolName?: string;
}

// =============================================================================
// VENDOR NAME MATCHING
// =============================================================================

function normalizeVendorName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fuzzyMatchVendor(
  targetVendor: string,
  candidateVendor: string,
): boolean {
  const normalized1 = normalizeVendorName(targetVendor);
  const normalized2 = normalizeVendorName(candidateVendor);

  return normalized1.includes(normalized2) || normalized2.includes(normalized1);
}

function isRelevantToVendor(output: unknown, vendorName: string): boolean {
  if (!output || typeof output !== 'object') return false;

  if ('vendorName' in output && typeof output.vendorName === 'string') {
    return fuzzyMatchVendor(vendorName, output.vendorName);
  }

  if (
    'type' in output &&
    output.type === 'vendor_total' &&
    'vendorName' in output
  ) {
    return fuzzyMatchVendor(vendorName, output.vendorName as string);
  }

  return false;
}

// =============================================================================
// MESSAGE HISTORY EXTRACTION
// =============================================================================

function extractToolOutputsFromMessages(
  messages: ModelMessage[],
  vendorName: string,
  options: VendorSynthesisInput,
): ExtractedToolOutputs {
  const outputs: ExtractedToolOutputs = {};

  const recentMessages = messages.slice(-10);

  for (const msg of recentMessages) {
    if (msg.role !== 'tool') continue;

    if (
      msg.toolName === 'calculate_spend' &&
      options.includeFinancials !== false
    ) {
      const output = msg.content as SpendToolOutput;
      if (!isToolError(output) && isRelevantToVendor(output, vendorName)) {
        outputs.spend = output;
      }
    }

    if (
      msg.toolName === 'summarize_payment_terms' &&
      options.includePaymentTerms !== false
    ) {
      const output = msg.content as PaymentTermsToolOutput;
      if (!isToolError(output) && isRelevantToVendor(output, vendorName)) {
        outputs.paymentTerms = output;
      }
    }

    if (msg.toolName === 'query_tags' && options.includeTags !== false) {
      const output = msg.content as TagsToolOutput;
      if (!isToolError(output)) {
        outputs.tags = output;
      }
    }

    if (msg.toolName === 'get_groups' && options.includeGroups !== false) {
      const output = msg.content as GroupsToolOutput;
      if (!isToolError(output) && isRelevantToVendor(output, vendorName)) {
        outputs.groups = output;
      }
    }
  }

  return outputs;
}

// =============================================================================
// CONTRACT REFERENCE EXTRACTION
// =============================================================================

function extractContractReferences(
  outputs: ExtractedToolOutputs,
): ContractReference[] {
  const refs = new Map<number, ContractReference>();

  if (outputs.spend && !isToolError(outputs.spend)) {
    if (outputs.spend.type === 'single_contract') {
      const contract = outputs.spend.contract;
      refs.set(contract.contractId, {
        contractId: contract.contractId,
        vendorName: contract.vendorName,
      });
    } else if (outputs.spend.type === 'vendor_total') {
      for (const contract of outputs.spend.contracts) {
        refs.set(contract.contractId, {
          contractId: contract.contractId,
          vendorName: contract.vendorName,
        });
      }
    }
  }

  if (outputs.paymentTerms && !isToolError(outputs.paymentTerms)) {
    for (const contract of outputs.paymentTerms.contracts) {
      if (!refs.has(contract.id)) {
        refs.set(contract.id, {
          contractId: contract.id,
          vendorName: outputs.paymentTerms.vendorName,
        });
      }
    }
  }

  if (outputs.tags && !isToolError(outputs.tags)) {
    if (outputs.tags.type === 'contract_tags') {
      for (const contract of outputs.tags.contracts) {
        if (!refs.has(contract.contractId)) {
          refs.set(contract.contractId, {
            contractId: contract.contractId,
            vendorName: contract.vendorName,
          });
        }
      }
    } else if (outputs.tags.type === 'contracts_by_tag') {
      for (const contract of outputs.tags.contracts) {
        if (!refs.has(contract.contractId)) {
          refs.set(contract.contractId, {
            contractId: contract.contractId,
            vendorName: contract.vendorName,
          });
        }
      }
    } else if (outputs.tags.type === 'untagged_contracts') {
      for (const contract of outputs.tags.contracts) {
        if (!refs.has(contract.contractId)) {
          refs.set(contract.contractId, {
            contractId: contract.contractId,
            vendorName: contract.vendorName,
          });
        }
      }
    }
  }

  if (outputs.groups && !isToolError(outputs.groups)) {
    if (outputs.groups.type === 'group_contracts') {
      for (const contract of outputs.groups.contracts) {
        if (!refs.has(contract.contractId)) {
          refs.set(contract.contractId, {
            contractId: contract.contractId,
            vendorName: contract.vendorName,
          });
        }
      }
    }
  }

  return Array.from(refs.values());
}

// =============================================================================
// SYNTHESIS PROMPT BUILDING
// =============================================================================

function buildSynthesisPrompt(
  vendorName: string,
  outputs: ExtractedToolOutputs,
  availableData: string[],
  contractReferences: ContractReference[],
): string {
  let prompt = `You are analyzing contract intelligence data for vendor: "${vendorName}".\n\n`;
  prompt += `Generate a comprehensive synthesis that connects insights across all available data sources.\n\n`;

  if (contractReferences.length > 0) {
    prompt += `=== CONTRACT REFERENCES ===\n\n`;
    prompt += `The following contracts are available for reference. When mentioning specific contracts, use the format [Contract #ID] (e.g., [Contract #123]):\n`;
    for (const ref of contractReferences) {
      prompt += `- Contract #${ref.contractId}${ref.vendorName ? ` (${ref.vendorName})` : ''}\n`;
    }
    prompt += `\n`;
  }

  prompt += `=== AVAILABLE DATA ===\n\n`;

  if (outputs.spend) {
    availableData.push('spend');
    prompt += `FINANCIAL DATA (source: calculate_spend):\n`;
    prompt += `${JSON.stringify(outputs.spend, null, 2)}\n\n`;
  }

  if (outputs.paymentTerms) {
    availableData.push('payment_terms');
    prompt += `PAYMENT TERMS DATA (source: summarize_payment_terms):\n`;
    prompt += `${JSON.stringify(outputs.paymentTerms, null, 2)}\n\n`;
  }

  if (outputs.tags) {
    availableData.push('tags');
    prompt += `TAGS DATA (source: query_tags):\n`;
    prompt += `${JSON.stringify(outputs.tags, null, 2)}\n\n`;
  }

  if (outputs.groups) {
    availableData.push('groups');
    prompt += `GROUPS DATA (source: get_groups):\n`;
    prompt += `${JSON.stringify(outputs.groups, null, 2)}\n\n`;
  }

  prompt += `=== SYNTHESIS REQUIREMENTS ===\n\n`;
  prompt += `Generate a structured synthesis with the following components:\n\n`;
  prompt += `1. **Executive Summary** (3-5 sentences):\n`;
  prompt += `   - Provide a comprehensive overview connecting financial, operational, and organizational dimensions\n`;
  prompt += `   - Cite specific numbers and facts from the data\n`;
  prompt += `   - Identify the most critical insights\n\n`;

  prompt += `2. **Sections** (one per available data source):\n`;
  prompt += `   - Title: Clear section name (e.g., "Financial Profile", "Payment Structure", "Access Control")\n`;
  prompt += `   - Content: 2-5 sentences explaining key findings\n`;
  prompt += `   - Insights: 2-5 bullet points highlighting specific patterns or risks\n`;
  prompt += `   - DataSource: Which tool provided this data (spend, payment_terms, tags, or groups)\n\n`;

  prompt += `3. **Recommendations** (2-3 actionable items):\n`;
  prompt += `   - Specific next steps based on the analysis\n`;
  prompt += `   - Focus on risk mitigation, cost optimization, or compliance\n\n`;

  prompt += `IMPORTANT:\n`;
  prompt += `- Quantify insights wherever possible (cite $ amounts, percentages, counts)\n`;
  prompt += `- Identify cross-cutting patterns (e.g., "high spend + complex payment terms = vendor risk")\n`;
  prompt += `- Be specific and actionable, not generic\n`;
  prompt += `- Base ALL insights on the actual data provided above\n`;
  prompt += `- When referencing specific contracts, ALWAYS use the format [Contract #ID] (e.g., [Contract #123]) so they can be linked\n`;

  return prompt;
}

// =============================================================================
// LLM SYNTHESIS GENERATION
// =============================================================================

async function generateSynthesis(
  vendorName: string,
  toolOutputs: ExtractedToolOutputs,
): Promise<VendorSynthesisResult> {
  const availableData: string[] = [];
  const contractReferences = extractContractReferences(toolOutputs);
  const prompt = buildSynthesisPrompt(
    vendorName,
    toolOutputs,
    availableData,
    contractReferences,
  );

  const synthesisSchema = z.object({
    executiveSummary: z
      .string()
      .min(50)
      .describe(
        '3-5 sentence comprehensive overview connecting all data dimensions',
      ),
    sections: z
      .array(
        z.object({
          title: z.string().describe('Clear section name'),
          content: z
            .string()
            .min(30)
            .describe('2-5 sentences explaining key findings'),
          insights: z
            .array(z.string())
            .min(1)
            .max(5)
            .describe('Bullet points highlighting specific patterns or risks'),
          dataSource: z
            .enum(['spend', 'payment_terms', 'tags', 'groups'])
            .describe('Which tool provided this data'),
        }),
      )
      .min(1),
    recommendations: z
      .array(z.string())
      .optional()
      .describe('2-3 specific, actionable next steps'),
  });

  try {
    const result = await generateObject({
      model: google('gemini-3-flash-preview'),
      schema: synthesisSchema,
      prompt,
      temperature: 0.3,
    });

    const allDataSources: Array<'spend' | 'payment_terms' | 'tags' | 'groups'> =
      ['spend', 'payment_terms', 'tags', 'groups'];
    const missingData = allDataSources.filter(
      (d) => !availableData.includes(d),
    );

    return {
      type: 'vendor_synthesis',
      vendorName,
      executiveSummary: result.object.executiveSummary,
      sections: result.object.sections as SynthesisSection[],
      availableData: availableData as Array<
        'spend' | 'payment_terms' | 'tags' | 'groups'
      >,
      missingData,
      recommendations: result.object.recommendations,
      contractReferences,
      partialResults: availableData.length < 4,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error({ error, vendorName }, 'LLM synthesis generation failed');
    throw error;
  }
}

// =============================================================================
// TOOL FACTORY
// =============================================================================

export function createSynthesisVendorIntelligenceTool(
  user: UserMetadata | null,
) {
  return tool({
    description: `Synthesize vendor intelligence from multiple data sources.
      Analyzes outputs from tools already called in this conversation (calculate_spend, summarize_payment_terms, query_tags, get_groups).
      Generates unified insights connecting financial, operational, and organizational data.
      Use AFTER calling 3+ tools for comprehensive vendor analysis.`,

    inputSchema: z.object({
      vendorName: z
        .string()
        .describe(
          'Vendor name to synthesize (must match vendor from previous tool calls)',
        ),
      includeFinancials: z
        .boolean()
        .optional()
        .describe('Include financial/spend data'),
      includePaymentTerms: z
        .boolean()
        .optional()
        .describe('Include payment terms data'),
      includeTags: z.boolean().optional().describe('Include tags data'),
      includeGroups: z.boolean().optional().describe('Include groups data'),
    }),

    execute: async ({ vendorName }): Promise<SynthesisToolOutput> => {
      if (!user) {
        logger.warn('No user context available for synthesis');
        return { error: 'User context not available' };
      }

      logger.info({ vendorName, userId: user.userId }, 'Synthesis tool called');

      return {
        error: '_NO_RESULTS_',
        noResults: true,
        searchTerm: vendorName,
        suggestion:
          'Synthesis feature requires conversation history access. This will be implemented in a future update.',
      };
    },
  });
}
