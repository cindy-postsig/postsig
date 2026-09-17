import { describe, expect, it } from '@jest/globals';

import {
  QUERY_CONTRACTS_COLUMN_SPECS,
  QUERY_CONTRACTS_COLUMN_SPEC_BY_KEY,
  getQueryColumnHeader,
  getQueryColumnAliases,
  buildQueryContractsTableMarkdownHeader,
} from '@/lib/v2/chat/guidance/query-contracts-guidance';

describe('query contracts column specs', () => {
  it('has entries for all column keys', () => {
    const keys = QUERY_CONTRACTS_COLUMN_SPECS.map((s) => s.key);
    expect(keys).toContain('id');
    expect(keys).toContain('vendorName');
    expect(keys).toContain('contractType');
    expect(keys).toContain('tcv');
  });

  it('QUERY_CONTRACTS_COLUMN_SPEC_BY_KEY maps every spec', () => {
    for (const spec of QUERY_CONTRACTS_COLUMN_SPECS) {
      expect(QUERY_CONTRACTS_COLUMN_SPEC_BY_KEY[spec.key]).toBe(spec);
    }
  });

  it('getQueryColumnHeader returns correct header', () => {
    expect(getQueryColumnHeader('id')).toBe('ID');
    expect(getQueryColumnHeader('vendorName')).toBe('Vendor');
  });

  it('getQueryColumnAliases returns aliases array', () => {
    const aliases = getQueryColumnAliases('tcv');
    expect(aliases).toContain('tcv');
    expect(aliases).toContain('totalcontractvalue');
  });

  it('buildQueryContractsTableMarkdownHeader produces markdown table header', () => {
    const header = buildQueryContractsTableMarkdownHeader();
    expect(header).toContain('| ID |');
    expect(header).toContain('Vendor');
    expect(header).toContain('TCV');
  });
});
