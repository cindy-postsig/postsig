import {
  DEFAULT_PRODUCT_FILTERS,
  matchesProductFilters,
} from '@/components/exchange-agreements/ProductFilterBar';

const row = {
  assetClass: 'Cash Equities',
  useType: 'Non-Display Use',
  level: 'L2',
};

describe('matchesProductFilters', () => {
  it('matches everything when no filters are selected', () => {
    expect(matchesProductFilters(row, DEFAULT_PRODUCT_FILTERS)).toBe(true);
  });

  it('matches when the row value is any of the selected values in a category (OR)', () => {
    const filters = {
      ...DEFAULT_PRODUCT_FILTERS,
      assetClass: ['Derivatives', 'Cash Equities'],
    };
    expect(matchesProductFilters(row, filters)).toBe(true);
  });

  it('excludes a row whose value is not among the selected values', () => {
    const filters = { ...DEFAULT_PRODUCT_FILTERS, assetClass: ['Derivatives'] };
    expect(matchesProductFilters(row, filters)).toBe(false);
  });

  it('requires every category with a selection to match (AND across categories)', () => {
    const filters = {
      assetClass: ['Cash Equities'],
      useType: ['Display Use'],
      level: [],
    };
    expect(matchesProductFilters(row, filters)).toBe(false);
  });

  it('excludes rows with a null level when a level filter is selected', () => {
    const filters = { ...DEFAULT_PRODUCT_FILTERS, level: ['L2'] };
    expect(matchesProductFilters({ ...row, level: null }, filters)).toBe(false);
  });
});
