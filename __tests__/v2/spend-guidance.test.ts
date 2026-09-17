import { describe, expect, it } from '@jest/globals';

import {
  buildCalculateSpendCapability,
  buildCalculateSpendToolDescription,
  buildSpendSynthesisInstruction,
  buildSpendTableMarkdownHeader,
  SPEND_QUERY_EXAMPLES,
  SPEND_TOTAL_ROW_LABEL,
} from '@/lib/v2/chat/guidance/spend-guidance';

describe('spend guidance', () => {
  it('reuses the shared spend question examples across tool and synthesis prompts', () => {
    const toolDescription = buildCalculateSpendToolDescription();
    const capabilityPrompt = buildCalculateSpendCapability();
    const synthesisInstruction = buildSpendSynthesisInstruction();

    for (const example of SPEND_QUERY_EXAMPLES) {
      expect(toolDescription).toContain(example);
      expect(synthesisInstruction).toContain(example);
    }

    expect(capabilityPrompt).toContain('calculate_spend(vendorName="MSCI")');
    expect(capabilityPrompt).toContain('calculate_spend(tagName="ESG")');
    expect(capabilityPrompt).toContain('calculate_spend(contractId=123)');
    expect(capabilityPrompt).toContain('calculate_spend()');
  });

  it('uses the shared canonical spend table shape in synthesis guidance', () => {
    const synthesisInstruction = buildSpendSynthesisInstruction();

    expect(synthesisInstruction).toContain(buildSpendTableMarkdownHeader());
    expect(synthesisInstruction).toContain(`\`${SPEND_TOTAL_ROW_LABEL}\``);
  });
});
