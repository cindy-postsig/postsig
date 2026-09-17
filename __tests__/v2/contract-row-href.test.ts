import { contractRowHref } from '@/lib/v2/contracts/rowHref';

describe('contractRowHref', () => {
  it('sends contract ids to the contract and the Bloomberg rollup to the inventory view', () => {
    expect(contractRowHref('42')).toBe('/contracts/42');
    expect(contractRowHref(42)).toBe('/contracts/42');
    expect(contractRowHref('bloomberg:469')).toBe('/vendors/469/inventory');
  });
});
