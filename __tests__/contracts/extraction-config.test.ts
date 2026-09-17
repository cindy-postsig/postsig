import { describe, expect, it } from '@jest/globals';
import {
  contractTypes,
  generalAssistantInstructions,
  geminiModelConfig,
} from '@/app/lib/constants';
import { baseQueries } from '@/constants/prompts/baseQueries';
import { getFieldsToExtractByContractType } from '@/constants/data';

// Extraction fidelity for non-ASCII names depends entirely on these two
// values. Raising the temperature or dropping the verbatim rule silently
// reintroduces "BØRS" -> "B rs", which no downstream matching can recover.
describe('extraction configuration', () => {
  it('extracts deterministically', () => {
    expect(geminiModelConfig.generationConfig?.temperature).toBe(0);
  });

  it('instructs the model to reproduce names verbatim', () => {
    expect(generalAssistantInstructions).toMatch(/verbatim/i);
  });

  it('exempts list fields from the per-field character cap', () => {
    expect(generalAssistantInstructions).toMatch(/untruncated/i);
  });
});

/**
 * processContractSpecs resolves the model's answer with
 * `data.contract_type in contractTypes`, so an option the prompt offers but
 * `contractTypes` has no key for silently classifies as Other.
 */
describe('contract_type classification prompt', () => {
  /**
   * Pre-existing mismatches, deliberately not fixed here: the prompt offers
   * these but `contractTypes` keys them `Trial` and `Operational`, so both
   * already fall through to Other. Listed so the gap is visible rather than
   * hidden, and so new options cannot join them unnoticed.
   */
  const KNOWN_UNRESOLVABLE = ['Trial Agreement', 'OA'];

  const promptAbbreviations = (): string[] => {
    const query = baseQueries.find((q) => q.dbName === 'contract_type')?.query;
    expect(query).toBeDefined();
    return Array.from(query!.matchAll(/^\s*-\s*\*\*(.+?)\*\*:/gm)).map(
      (match) => match[1],
    );
  };

  it('offers every contract type option', () => {
    expect(promptAbbreviations().length).toBeGreaterThan(0);
  });

  it('offers only abbreviations that resolve to a contract type', () => {
    const unresolvable = promptAbbreviations().filter(
      (abbreviation) => !(abbreviation in contractTypes),
    );
    expect(unresolvable.sort()).toEqual([...KNOWN_UNRESOLVABLE].sort());
  });

  it('offers the Exchange Agreement types', () => {
    const abbreviations = promptAbbreviations();
    expect(abbreviations).toContain('EASO');
    expect(abbreviations).toContain('EAINV');
    expect(contractTypes.EASO).toBe(12);
    expect(contractTypes.EAINV).toBe(13);
  });

  it('offers EAFeeSchedule alongside EAINV', () => {
    expect(promptAbbreviations()).toContain('EAFeeSchedule');
    expect(contractTypes.EAFeeSchedule).toBe(10);
  });

  it('separates EAINV from EAFeeSchedule on billing evidence, not formatting', () => {
    const query = baseQueries.find((q) => q.dbName === 'contract_type')?.query;
    expect(query).toMatch(/shared formatting does not distinguish them/i);
    expect(query).toMatch(/invoice number/i);
    expect(query).toMatch(/amount payable/i);
    expect(query).toMatch(/tariff/i);
  });
});

describe('order_number extraction coverage', () => {
  it.each([
    ['a standard contract', contractTypes.MSA],
    ['an addendum', contractTypes.Addendum],
    ['a service order', contractTypes.SO],
    ['an invoice', contractTypes.Invoice],
    ['an Exchange Agreement service order', contractTypes.EASO],
    ['an Exchange Agreement invoice', contractTypes.EAINV],
    ['an Exchange Agreement fee schedule', contractTypes.EAFeeSchedule],
  ])('requests the document number for %s', (_label, typeId) => {
    expect(getFieldsToExtractByContractType(typeId)).toContain('order_number');
  });

  it('does not request it for an NDA', () => {
    expect(getFieldsToExtractByContractType(contractTypes.NDA)).not.toContain(
      'order_number',
    );
  });

  it('requests it once, not per field group', () => {
    const fields = getFieldsToExtractByContractType(contractTypes.MSA);
    expect(fields.filter((field) => field === 'order_number')).toHaveLength(1);
  });
});
