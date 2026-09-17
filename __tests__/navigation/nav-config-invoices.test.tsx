import {
  getNavItemsForMode,
  isNavItemActive,
  type NavItem,
} from '@/components/navigation/navConfig';

describe('getNavItemsForMode - invoices', () => {
  it('excludes the Invoices nav item in contracts mode by default', () => {
    const items = getNavItemsForMode('contracts');
    expect(items.some((item) => item.key === 'invoices')).toBe(false);
  });

  it('includes the Invoices nav item in contracts mode when enabled', () => {
    const items = getNavItemsForMode('contracts', false, false, false, true);
    expect(items.some((item) => item.key === 'invoices')).toBe(true);
  });

  it('does not include the Invoices nav item in venture mode', () => {
    const items = getNavItemsForMode('venture', false, false, false, true);
    expect(items.some((item) => item.key === 'invoices')).toBe(false);
  });
});

describe('isNavItemActive - invoices', () => {
  const invoicesItem: NavItem = {
    key: 'invoices',
    href: '/invoices',
    tooltip: 'Invoices',
    icon: <svg />,
  };

  it('is active on the invoices root and its sub-routes', () => {
    expect(isNavItemActive(invoicesItem, '/invoices')).toBe(true);
    expect(isNavItemActive(invoicesItem, '/invoices/archived')).toBe(true);
  });

  it('is not active outside of /invoices', () => {
    expect(isNavItemActive(invoicesItem, '/contracts')).toBe(false);
  });
});
