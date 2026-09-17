import { describe, expect, it } from '@jest/globals';
import { getNavItemsForMode, isNavItemActive } from '../navConfig';

const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe('getNavItemsForMode', () => {
  it('includes portfolio in venture mode by default', () => {
    expect(keys(getNavItemsForMode('venture'))).toContain('portfolio');
  });

  it('excludes portfolio in venture mode when hidePortfolio is true', () => {
    const items = getNavItemsForMode('venture', false, true);
    expect(keys(items)).not.toContain('portfolio');
    expect(keys(items)).toContain('documents');
  });

  it('keeps portfolio in venture mode when hidePortfolio is false', () => {
    expect(keys(getNavItemsForMode('venture', false, false))).toContain(
      'portfolio',
    );
  });

  it('still excludes portfolio for investor trial regardless of hidePortfolio', () => {
    expect(keys(getNavItemsForMode('venture', true, false))).not.toContain(
      'portfolio',
    );
  });

  it('includes the dashboard in venture mode by default', () => {
    expect(keys(getNavItemsForMode('venture'))).toContain('investor-dashboard');
  });

  it('excludes the dashboard in venture mode when hidePortfolio is true', () => {
    expect(keys(getNavItemsForMode('venture', false, true))).not.toContain(
      'investor-dashboard',
    );
  });

  it('excludes the dashboard for investor trial', () => {
    expect(keys(getNavItemsForMode('venture', true, false))).not.toContain(
      'investor-dashboard',
    );
  });

  it('offers assignments when the assignments flag is on', () => {
    expect(keys(getNavItemsForMode('contracts', false, false, true))).toContain(
      'assignments',
    );
  });

  it('hides assignments when the flag is off, as the route does', () => {
    // Every figure on that page is a cost allocation; without the feature it
    // would be a page of zeros.
    expect(keys(getNavItemsForMode('contracts'))).not.toContain('assignments');
  });

  it('does not offer assignments in venture mode even with the flag on', () => {
    expect(
      keys(getNavItemsForMode('venture', false, false, true)),
    ).not.toContain('assignments');
  });

  it('leaves the rest of contracts mode alone', () => {
    expect(keys(getNavItemsForMode('contracts'))).toEqual([
      'dashboard',
      'vendors',
      'contracts',
      'calendar',
      'spend',
      'reports',
      'inventory',
    ]);
  });

  it('is unaffected by hidePortfolio', () => {
    expect(getNavItemsForMode('contracts', false, true, true)).toEqual(
      getNavItemsForMode('contracts', false, false, true),
    );
  });

  it('excludes exchange-agreements in contracts mode by default', () => {
    expect(keys(getNavItemsForMode('contracts'))).not.toContain(
      'exchange-agreements',
    );
  });

  it('includes exchange-agreements in contracts mode when enabled', () => {
    expect(
      keys(getNavItemsForMode('contracts', false, false, false, false, true)),
    ).toContain('exchange-agreements');
  });
});

describe('isNavItemActive', () => {
  const assignments = getNavItemsForMode('contracts', false, false, true).find(
    (item) => item.key === 'assignments',
  );

  it('marks assignments active on its own route', () => {
    expect(isNavItemActive(assignments!, '/assignments')).toBe(true);
  });

  it('stays active while a scope is selected', () => {
    // Scope and sub-tab are query state, but a drill-down must not un-select
    // the tab if the route ever gains a segment.
    expect(isNavItemActive(assignments!, '/assignments/2')).toBe(true);
  });

  it('is not active on another route', () => {
    expect(isNavItemActive(assignments!, '/inventory')).toBe(false);
  });

  it('does not light up for a route that merely starts the same way', () => {
    expect(isNavItemActive(assignments!, '/assignments-export')).toBe(false);
  });
});

describe('isNavItemActive - vendors', () => {
  const vendors = getNavItemsForMode('contracts').find(
    (item) => item.key === 'vendors',
  );

  it('marks vendors active on the list and on a vendor page', () => {
    expect(isNavItemActive(vendors!, '/vendors')).toBe(true);
    expect(isNavItemActive(vendors!, '/vendors/42')).toBe(true);
  });

  it('is not active on another route', () => {
    expect(isNavItemActive(vendors!, '/contracts')).toBe(false);
    expect(isNavItemActive(vendors!, '/vendors-export')).toBe(false);
  });
});
