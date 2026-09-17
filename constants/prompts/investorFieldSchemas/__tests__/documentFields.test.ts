import { preferredStockSchema } from '@/constants/prompts/investorFieldSchemas/documentFields';

describe('preferredStockSchema', () => {
  it('parses a valid object with all fields including round_name and is_current_transaction', () => {
    const input = [
      {
        series_name: 'Series A Preferred Stock',
        original_issue_price: 1.5,
        par_value: 0.00001,
        authorized_shares: 10000000,
        is_valuation_reference: true,
        round_name: 'Series A',
        is_current_transaction: true,
      },
    ];

    const result = preferredStockSchema.parse(input);
    expect(result).toEqual(input);
  });

  it('accepts null values for round_name and is_current_transaction', () => {
    const input = [
      {
        series_name: 'Series Seed-1',
        original_issue_price: 0.3337,
        par_value: 0.00001,
        authorized_shares: 5000000,
        is_valuation_reference: false,
        round_name: null,
        is_current_transaction: null,
      },
    ];

    const result = preferredStockSchema.parse(input);
    expect(result![0]!.round_name).toBeNull();
    expect(result![0]!.is_current_transaction).toBeNull();
  });

  it('rejects wrong type for round_name', () => {
    const input = [
      {
        series_name: 'Series A',
        original_issue_price: 1.0,
        par_value: 0.00001,
        authorized_shares: 1000000,
        is_valuation_reference: true,
        round_name: 123,
        is_current_transaction: true,
      },
    ];

    expect(() => preferredStockSchema.parse(input)).toThrow();
  });

  it('rejects wrong type for is_current_transaction', () => {
    const input = [
      {
        series_name: 'Series A',
        original_issue_price: 1.0,
        par_value: 0.00001,
        authorized_shares: 1000000,
        is_valuation_reference: true,
        round_name: 'Series A',
        is_current_transaction: 'yes',
      },
    ];

    expect(() => preferredStockSchema.parse(input)).toThrow();
  });

  it('accepts null for the entire schema', () => {
    const result = preferredStockSchema.parse(null);
    expect(result).toBeNull();
  });
});
