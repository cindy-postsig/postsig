import { describe, expect, it } from '@jest/globals';

import {
  buildPaymentTermsSynthesisInstruction,
  buildPaymentTermsTableMarkdownHeader,
  buildSummarizePaymentTermsCapability,
  buildSummarizePaymentTermsToolDescription,
  PAYMENT_TERMS_QUERY_EXAMPLES,
} from '@/lib/v2/chat/guidance/payment-terms-guidance';

describe('payment terms guidance', () => {
  it('reuses the shared payment terms examples across tool and synthesis prompts', () => {
    const toolDescription = buildSummarizePaymentTermsToolDescription();
    const capabilityPrompt = buildSummarizePaymentTermsCapability();
    const synthesisInstruction = buildPaymentTermsSynthesisInstruction();

    for (const example of PAYMENT_TERMS_QUERY_EXAMPLES) {
      expect(toolDescription).toContain(example);
      expect(synthesisInstruction).toContain(example);
    }

    expect(capabilityPrompt).toContain(
      'summarize_payment_terms(vendorName="MSCI")',
    );
  });

  it('uses the shared payment terms table shape in synthesis guidance', () => {
    const synthesisInstruction = buildPaymentTermsSynthesisInstruction();

    expect(synthesisInstruction).toContain(
      buildPaymentTermsTableMarkdownHeader(),
    );
    expect(synthesisInstruction).toContain('Billing');
  });
});
