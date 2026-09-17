import { isInvoiceDiscrepant } from '@/lib/v2/invoices/service';
import type { InvoiceValidation } from '@/lib/v2/invoices/validation';

const validation = (
  overrides: Partial<InvoiceValidation> = {},
): InvoiceValidation =>
  ({
    amountMatch: true,
    productsMatch: true,
    ...overrides,
  }) as InvoiceValidation;

describe('isInvoiceDiscrepant', () => {
  it('is true when the invoice was billed more than expected', () => {
    expect(isInvoiceDiscrepant(validation({ amountMatch: false }))).toBe(true);
  });

  it('is true when the invoice was billed less than expected (underbilled)', () => {
    expect(
      isInvoiceDiscrepant(
        validation({ amountMatch: false, amountDifference: -50 }),
      ),
    ).toBe(true);
  });

  it('is true when the amount matches but a product is unmatched', () => {
    expect(
      isInvoiceDiscrepant(
        validation({ amountMatch: true, productsMatch: false }),
      ),
    ).toBe(true);
  });

  it('is false when everything matches', () => {
    expect(
      isInvoiceDiscrepant(
        validation({ amountMatch: true, productsMatch: true }),
      ),
    ).toBe(false);
  });

  it('is false when validation is undefined (no parent to compare against)', () => {
    expect(isInvoiceDiscrepant(undefined)).toBe(false);
  });
});
