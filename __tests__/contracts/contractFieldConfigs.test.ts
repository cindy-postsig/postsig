import { describe, expect, it } from '@jest/globals';
import {
  CONTRACT_CONFIGS,
  DEFAULT_CONTRACT_CONFIG,
  FIELD_DEFINITIONS,
  getContractConfig,
  getFieldValue,
} from '@/app/ui/contracts/contractFieldConfigs';
import { contractTypes } from '@/app/lib/constants';

const orderNumber = FIELD_DEFINITIONS.order_number;
const invoiceNumber = FIELD_DEFINITIONS.invoice_number;
const salesTaxPercent = FIELD_DEFINITIONS.sales_tax_percent;
const salesTaxAmount = FIELD_DEFINITIONS.sales_tax_amount;

const withOrderNumber = (value: unknown) => ({
  metadata: { lineage: { order_number: value } },
});

const withSalesTaxDetails = (
  details: Array<{ sales_tax: string | number; sales_tax_percent?: number }>,
  currency?: string,
) => ({
  currency,
  other_attributes: { invoice_fields: { sales_tax_details: details } },
});

describe('sales_tax_percent field', () => {
  it('reports the percent belonging to the entry that actually has a tax amount', () => {
    const contract = withSalesTaxDetails([
      { sales_tax: 0, sales_tax_percent: 0 },
      { sales_tax: 24, sales_tax_percent: 8 },
    ]);
    expect(getFieldValue(contract, salesTaxPercent)).toBe('8%');
  });

  it('falls back to N/A when no entry has a real tax amount', () => {
    const contract = withSalesTaxDetails([
      { sales_tax: 0, sales_tax_percent: 0 },
    ]);
    expect(getFieldValue(contract, salesTaxPercent)).toBe('N/A');
  });
});

describe('sales_tax_amount field', () => {
  it('formats the total as currency instead of a raw number', () => {
    const contract = withSalesTaxDetails([{ sales_tax: 4258.68 }], 'USD');
    expect(getFieldValue(contract, salesTaxAmount)).toBe('$4,258.68');
  });

  it('sums multiple tax line items before formatting', () => {
    const contract = withSalesTaxDetails(
      [{ sales_tax: 100 }, { sales_tax: 50.5 }],
      'USD',
    );
    expect(getFieldValue(contract, salesTaxAmount)).toBe('$150.50');
  });
});

describe('order/invoice number field definitions', () => {
  it('defines both fields with the shared lineage dataKey', () => {
    expect(orderNumber).toBeDefined();
    expect(orderNumber.title).toBe('Contract No.');
    expect(orderNumber.dataKey).toBe('metadata.lineage.order_number');

    expect(invoiceNumber).toBeDefined();
    expect(invoiceNumber.title).toBe('Invoice No.');
    expect(invoiceNumber.dataKey).toBe('metadata.lineage.order_number');
  });

  it('renders like every other overview field instead of hiding when empty', () => {
    expect(orderNumber).not.toHaveProperty('hideWhenEmpty');
    expect(invoiceNumber).not.toHaveProperty('hideWhenEmpty');
  });

  it('resolves the nested metadata.lineage.order_number value', () => {
    const contract = withOrderNumber('PO-123');
    expect(getFieldValue(contract, orderNumber)).toBe('PO-123');
    expect(getFieldValue(contract, invoiceNumber)).toBe('PO-123');
  });

  it('trims surrounding whitespace from the display value', () => {
    expect(getFieldValue(withOrderNumber('  PO-123  '), orderNumber)).toBe(
      'PO-123',
    );
  });

  it('converts numeric identifiers to trimmed strings', () => {
    const contract = withOrderNumber(12345);
    expect(getFieldValue(contract, orderNumber)).toBe('12345');
    expect(getFieldValue(contract, invoiceNumber)).toBe('12345');
  });

  const emptyCases: Array<[string, unknown]> = [
    ['null', withOrderNumber(null)],
    ['undefined', withOrderNumber(undefined)],
    ['empty string', withOrderNumber('')],
    ['whitespace only', withOrderNumber('   ')],
    ['NO_DATA sentinel', withOrderNumber('NO_DATA')],
    ['missing lineage', { metadata: {} }],
    ['missing metadata', {}],
  ];

  it.each(emptyCases)('returns a falsy value for %s', (_label, contract) => {
    expect(getFieldValue(contract, orderNumber)).toBeFalsy();
    expect(getFieldValue(contract, invoiceNumber)).toBeFalsy();
  });
});

describe('billing period end date field definition', () => {
  const billingPeriodEndDate = FIELD_DEFINITIONS.billing_period_end_date;

  it('defines the field with the term_end_date dataKey and citation', () => {
    expect(billingPeriodEndDate).toBeDefined();
    expect(billingPeriodEndDate.title).toBe('Billing Period End Date');
    expect(billingPeriodEndDate.dataKey).toBe('term_end_date');
    expect(billingPeriodEndDate.citationId).toBe('term_end_date');
    expect(billingPeriodEndDate.isDate).toBe(true);
  });

  it('uses billing_period_end_date instead of term_end_date in the Invoice overview', () => {
    expect(CONTRACT_CONFIGS[contractTypes.Invoice].overview).toContain(
      'billing_period_end_date',
    );
    expect(CONTRACT_CONFIGS[contractTypes.Invoice].overview).not.toContain(
      'term_end_date',
    );
  });
});

describe('invoice date field definitions', () => {
  const billingPeriodStartDate = FIELD_DEFINITIONS.billing_period_start_date;
  const invoiceDate = FIELD_DEFINITIONS.invoice_date;

  it('defines billing_period_start_date with the term_start_date dataKey and citation', () => {
    expect(billingPeriodStartDate).toBeDefined();
    expect(billingPeriodStartDate.title).toBe('Billing Period Start Date');
    expect(billingPeriodStartDate.dataKey).toBe('term_start_date');
    expect(billingPeriodStartDate.citationId).toBe('term_start_date');
    expect(billingPeriodStartDate.isDate).toBe(true);
  });

  it('defines invoice_date with the execution_date dataKey and citation', () => {
    expect(invoiceDate).toBeDefined();
    expect(invoiceDate.title).toBe('Invoice Date');
    expect(invoiceDate.dataKey).toBe('execution_date');
    expect(invoiceDate.citationId).toBe('execution_date');
    expect(invoiceDate.isDate).toBe(true);
  });

  it('uses the invoice-labeled fields instead of term_start_date/execution_date in the Invoice overview', () => {
    const overview = CONTRACT_CONFIGS[contractTypes.Invoice].overview;
    expect(overview).toContain('billing_period_start_date');
    expect(overview).toContain('invoice_date');
    expect(overview).not.toContain('term_start_date');
    expect(overview).not.toContain('execution_date');
  });
});

describe('order/invoice number config wiring', () => {
  it('appends invoice_number to the Invoice overview', () => {
    expect(CONTRACT_CONFIGS[contractTypes.Invoice].overview).toContain(
      'invoice_number',
    );
  });

  it('appends order_number to the NDA overview', () => {
    expect(CONTRACT_CONFIGS[contractTypes.NDA].overview).toContain(
      'order_number',
    );
  });

  it('appends order_number to the default overview', () => {
    expect(DEFAULT_CONTRACT_CONFIG.overview).toContain('order_number');
  });
});

describe('Product Credits section wiring', () => {
  const creditsSection = (typeId: number) =>
    getContractConfig(typeId).contractDetails.find((section) =>
      section.fields.includes('product_credits'),
    );

  it.each([
    ['Invoice', contractTypes.Invoice],
    ['Exchange Agreement Invoice', contractTypes.EAINV],
  ])('gives %s a Product Credits section', (_label, typeId) => {
    expect(creditsSection(typeId)?.title).toBe('Product Credits');
  });

  it('places it directly below the charges section', () => {
    const sections = getContractConfig(
      contractTypes.Invoice,
    ).contractDetails.map((section) => section.title);
    expect(sections.indexOf('Product Credits')).toBe(
      sections.indexOf('Summary of Charges') + 1,
    );
  });

  it.each([
    ['MSA', contractTypes.MSA],
    ['NDA', contractTypes.NDA],
    ['Service Order', contractTypes.SO],
  ])('leaves %s without one', (_label, typeId) => {
    expect(creditsSection(typeId)).toBeUndefined();
  });

  it('does not appear on the default config', () => {
    expect(
      DEFAULT_CONTRACT_CONFIG.contractDetails.some((section) =>
        section.fields.includes('product_credits'),
      ),
    ).toBe(false);
  });

  it('is titled so the export builder does not read it as a products section', () => {
    expect(creditsSection(contractTypes.Invoice)?.title).not.toContain(
      'Products',
    );
  });
});
