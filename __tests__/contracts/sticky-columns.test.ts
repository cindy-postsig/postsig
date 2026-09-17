import {
  stickyCellTint,
  stickyPrefixCount,
  STICKY_CELL_BASE,
} from '@/components/contracts/stickyColumns';

describe('stickyPrefixCount', () => {
  it('pins select, expander and vendor in a grouped contracts table', () => {
    expect(
      stickyPrefixCount([
        'select',
        'expander',
        'vendor',
        'orderNumber',
        'product',
      ]),
    ).toBe(3);
  });

  it('pins vendor alone when there is no selection or expander column', () => {
    expect(stickyPrefixCount(['vendor', 'orderNumber', 'product'])).toBe(1);
  });

  it('handles the vendorAndProduct variant', () => {
    expect(stickyPrefixCount(['vendorAndProduct', 'type'])).toBe(1);
  });

  it("pins Inventory's expander/alerts/vendor run", () => {
    expect(
      stickyPrefixCount(['expander', 'alerts', 'vendor', 'productName']),
    ).toBe(3);
  });

  it('stops at the first non-pinnable column rather than scanning ahead', () => {
    // A user who drags something ahead of Vendor gets no pinning, not a
    // pinned column detached from the left edge.
    expect(stickyPrefixCount(['orderNumber', 'vendor', 'product'])).toBe(0);
  });

  it('is 0 for an empty table', () => {
    expect(stickyPrefixCount([])).toBe(0);
  });

  it('never pins past the columns it was given', () => {
    expect(stickyPrefixCount(['select', 'expander'])).toBe(2);
  });
});

describe('stickyCellTint', () => {
  const state = (overrides: Partial<Parameters<typeof stickyCellTint>[0]>) =>
    stickyCellTint({
      depth: 0,
      isBanded: false,
      isProductSubRow: false,
      isInactive: false,
      ...overrides,
    });

  it('paints the tint on ::before, never as the cell background', () => {
    // The cell background must stay the opaque backdrop, or scrolled content
    // shows through the pinned column.
    const tints = [
      state({ isBanded: true }),
      state({ depth: 1, isBanded: true }),
      state({ depth: 1, isBanded: false }),
      state({ isProductSubRow: true }),
      state({ isInactive: true }),
    ];

    for (const tint of tints) {
      expect(tint).not.toBe('');
      for (const cls of tint.split(' ')) {
        expect(cls).toMatch(/(^|:)before:bg-/);
      }
    }
  });

  it('leaves an unbanded top-level row untinted', () => {
    expect(state({})).toBe('');
  });

  it('distinguishes banded from unbanded sub-rows', () => {
    expect(state({ depth: 1, isBanded: true })).not.toEqual(
      state({ depth: 1, isBanded: false }),
    );
  });

  it('lets product sub-rows win over banding', () => {
    expect(state({ isProductSubRow: true, isBanded: true })).toEqual(
      state({ isProductSubRow: true, isBanded: false }),
    );
  });

  it('always pairs with an opaque backdrop and a negative-z ::before layer', () => {
    expect(STICKY_CELL_BASE).toContain('bg-background');
    expect(STICKY_CELL_BASE).toContain('before:absolute');
    expect(STICKY_CELL_BASE).toContain('before:-z-10');
    expect(STICKY_CELL_BASE).toContain('sticky');
  });
});
