import { describe, expect, it } from '@jest/globals';
import productsListQuery from '@/constants/prompts/productsListQuery';

/**
 * This local copy is the fallback the OpenAI provider resolves for
 * products_list, so its wording is what decides whether a fee reaches
 * `vendor_products_details.fees` with its cents. An instruction to round is a
 * silent data loss: the extraction succeeds and the figure is simply wrong.
 */
describe('productsListQuery', () => {
  it('does not ask for a rounded or integer cost', () => {
    expect(productsListQuery.query).not.toMatch(
      /nearest integer|should be an integer|round/i,
    );
  });

  it('asks for the decimal part to be kept exactly as written', () => {
    expect(productsListQuery.query).toMatch(
      /keep the decimal part exactly as written/i,
    );
  });

  it('asks for a period decimal separator on comma-decimal amounts', () => {
    expect(productsListQuery.query).toMatch(
      /use a period as the decimal separator/i,
    );
    expect(productsListQuery.query).toContain(
      '"€2.681,80" also becomes "2681.80"',
    );
  });
});
