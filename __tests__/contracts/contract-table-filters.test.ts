import {
  buildColumnFilters,
  buildFilterUrlKeys,
} from '@/components/contracts/ContractTableFilters';
import {
  filterFunctions,
  matchesAllActiveFiltersForRow,
} from '@/components/ui/data-table/utils/filterUtils';

const defaultParams = {
  renewal: 'all',
  tags: [] as string[],
  sponsor: 'all',
  group: 'all',
  invoiceStatus: 'all',
};

describe('buildColumnFilters', () => {
  it('returns no filters when all params are defaults', () => {
    expect(buildColumnFilters(defaultParams)).toEqual([]);
  });

  it('maps each active param to its column filter', () => {
    expect(
      buildColumnFilters({
        renewal: 'auto',
        tags: ['critical'],
        sponsor: 'Jane Doe',
        group: 'unit:12',
        invoiceStatus: 'review',
      }),
    ).toEqual([
      { id: 'renewalType', value: 'auto' },
      { id: 'tags', value: ['critical'] },
      { id: 'businessSponsor', value: 'Jane Doe' },
      { id: 'businessGroup', value: 'unit:12' },
      { id: 'invoiceStatus', value: 'review' },
    ]);
  });

  it('skips only the params left at defaults', () => {
    expect(
      buildColumnFilters({ ...defaultParams, invoiceStatus: 'paid' }),
    ).toEqual([{ id: 'invoiceStatus', value: 'paid' }]);
  });
});

describe('buildFilterUrlKeys', () => {
  it('returns undefined with no prefix, leaving the default URL keys in place', () => {
    expect(buildFilterUrlKeys()).toBeUndefined();
  });

  it('namespaces every filter key under the given prefix', () => {
    expect(buildFilterUrlKeys('auto')).toEqual({
      renewal: 'autoRenewal',
      tags: 'autoTags',
      sponsor: 'autoSponsor',
      group: 'autoGroup',
      invoiceStatus: 'autoInvoiceStatus',
      page: 'autoPage',
    });
  });

  it('gives different prefixes disjoint key sets', () => {
    const auto = buildFilterUrlKeys('auto')!;
    const manual = buildFilterUrlKeys('manual')!;
    const sharedValues = Object.values(auto).filter((key) =>
      Object.values(manual).includes(key),
    );
    expect(sharedValues).toEqual([]);
  });
});

describe('filterFunctions.subrowAware', () => {
  const { subrowAware } = filterFunctions;

  it('passes every row when the filter is empty or "all"', () => {
    const row = { original: { invoiceStatus: 'paid' } };
    expect(subrowAware(row, 'invoiceStatus', 'all')).toBe(true);
    expect(subrowAware(row, 'invoiceStatus', undefined)).toBe(true);
    expect(subrowAware(row, 'tags', [])).toBe(true);
  });

  it('matches leaf rows on their own value', () => {
    expect(
      subrowAware(
        { original: { invoiceStatus: 'review' } },
        'invoiceStatus',
        'review',
      ),
    ).toBe(true);
    expect(
      subrowAware(
        { original: { invoiceStatus: 'paid' } },
        'invoiceStatus',
        'review',
      ),
    ).toBe(false);
  });

  it('matches vendor groups when any subrow matches', () => {
    const group = {
      original: {
        isGroup: true,
        subRows: [{ invoiceStatus: 'review' }, { invoiceStatus: 'paid' }],
      },
    };
    expect(subrowAware(group, 'invoiceStatus', 'paid')).toBe(true);
    expect(subrowAware(group, 'invoiceStatus', 'review')).toBe(true);
    expect(subrowAware(group, 'invoiceStatus', 'declined')).toBe(false);
  });

  it('matches tags case-insensitively through subrows', () => {
    const group = {
      original: {
        isGroup: true,
        subRows: [{ tags: [{ name: 'Critical' }] }, { tags: [] }],
      },
    };
    expect(subrowAware(group, 'tags', ['critical'])).toBe(true);
    expect(subrowAware(group, 'tags', ['other'])).toBe(false);
  });

  it('matches business groups by id', () => {
    const row = {
      original: { businessGroups: [{ id: 'unit:12', name: 'Data' }] },
    };
    expect(subrowAware(row, 'businessGroup', 'unit:12')).toBe(true);
    expect(subrowAware(row, 'businessGroup', 'unit:99')).toBe(false);
  });
});

describe('matchesAllActiveFiltersForRow', () => {
  it('requires every active filter to match', () => {
    const item = {
      invoiceStatus: 'review',
      businessSponsor: ['Jane Doe'],
    };
    expect(
      matchesAllActiveFiltersForRow(item, [
        { id: 'invoiceStatus', value: 'review' },
        { id: 'businessSponsor', value: 'Jane Doe' },
      ]),
    ).toBe(true);
    expect(
      matchesAllActiveFiltersForRow(item, [
        { id: 'invoiceStatus', value: 'review' },
        { id: 'businessSponsor', value: 'Someone Else' },
      ]),
    ).toBe(false);
  });
});
