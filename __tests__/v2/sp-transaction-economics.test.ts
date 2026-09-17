import { spTransactionEconomicsSchema } from '@/constants/prompts/investorFieldSchemas/spSecondaryPurchaseFields';

describe('spTransactionEconomicsSchema', () => {
  it('accepts a share-based transaction with null instrument fields', () => {
    const data = [
      {
        seller: 'Alice',
        buyer: 'Bob',
        share_class: 'Series A',
        shares: 1000,
        price_per_share: 10,
        total_consideration: 10000,
        closing_date: '2024-06-01',
        instrument_type: 'shares',
        instrument_reference: null,
        instrument_issue_date: null,
        principal_amount: null,
      },
    ];
    expect(spTransactionEconomicsSchema.parse(data)).toEqual(data);
  });

  it('accepts a SAFE-based transaction', () => {
    const data = [
      {
        seller: 'Alice',
        buyer: 'Bob',
        share_class: null,
        shares: null,
        price_per_share: null,
        total_consideration: 500000,
        closing_date: '2024-06-01',
        instrument_type: 'safe',
        instrument_reference: 'SAFE dated 2024-01-15',
        instrument_issue_date: '2024-01-15',
        principal_amount: 500000,
      },
    ];
    expect(spTransactionEconomicsSchema.parse(data)).toEqual(data);
  });

  it('accepts a convertible note transaction', () => {
    const data = [
      {
        seller: 'Founder',
        buyer: 'Fund LP',
        share_class: null,
        shares: null,
        price_per_share: null,
        total_consideration: 250000,
        closing_date: '2024-08-01',
        instrument_type: 'convertible_note',
        instrument_reference: 'Series A Convertible Note',
        instrument_issue_date: '2023-07-01',
        principal_amount: 200000,
      },
    ];
    expect(spTransactionEconomicsSchema.parse(data)).toEqual(data);
  });

  it('accepts null for the entire schema', () => {
    expect(spTransactionEconomicsSchema.parse(null)).toBeNull();
  });

  it('rejects invalid instrument_type values', () => {
    const data = [
      {
        seller: 'Alice',
        buyer: 'Bob',
        share_class: null,
        shares: null,
        price_per_share: null,
        total_consideration: 500000,
        closing_date: '2024-06-01',
        instrument_type: 'SAFE',
        instrument_reference: 'SAFE dated 2024-01-15',
        instrument_issue_date: '2024-01-15',
        principal_amount: 500000,
      },
      {
        seller: 'Founder',
        buyer: 'Fund LP',
        share_class: null,
        shares: null,
        price_per_share: null,
        total_consideration: 250000,
        closing_date: '2024-08-01',
        instrument_type: 'note',
        instrument_reference: 'Convertible Note',
        instrument_issue_date: '2023-07-01',
        principal_amount: 200000,
      },
    ];
    const result = spTransactionEconomicsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('accepts warrant and option instrument types', () => {
    const data = [
      {
        seller: 'Alice',
        buyer: 'Bob',
        share_class: null,
        shares: null,
        price_per_share: null,
        total_consideration: 100000,
        closing_date: '2024-06-01',
        instrument_type: 'warrant',
        instrument_reference: 'Warrant Agreement dated 2023-03-01',
        instrument_issue_date: '2023-03-01',
        principal_amount: null,
      },
      {
        seller: 'Carol',
        buyer: 'Dave',
        share_class: null,
        shares: null,
        price_per_share: null,
        total_consideration: 50000,
        closing_date: '2024-07-01',
        instrument_type: 'option',
        instrument_reference: 'Stock Option Grant #42',
        instrument_issue_date: '2022-11-15',
        principal_amount: null,
      },
    ];
    expect(spTransactionEconomicsSchema.parse(data)).toEqual(data);
  });

  it('rejects negative principal_amount', () => {
    const data = [
      {
        seller: 'Alice',
        buyer: 'Bob',
        share_class: null,
        shares: null,
        price_per_share: null,
        total_consideration: 500000,
        closing_date: '2024-06-01',
        instrument_type: 'safe',
        instrument_reference: 'SAFE dated 2024-01-15',
        instrument_issue_date: '2024-01-15',
        principal_amount: -100,
      },
    ];
    const result = spTransactionEconomicsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  // TODO: Add cross-field validation via superRefine to enforce semantic consistency
  // (e.g., non-share instrument with share fields populated, or shares instrument with
  // non-share fields populated). Currently the schema allows these combinations.

  it('rejects missing instrument fields when other fields are present', () => {
    const data = [
      {
        seller: 'Alice',
        buyer: 'Bob',
        share_class: 'Series A',
        shares: 1000,
        price_per_share: 10,
        total_consideration: 10000,
        closing_date: '2024-06-01',
      },
    ];
    const result = spTransactionEconomicsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
