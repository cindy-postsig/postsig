/**
 * @jest-environment jsdom
 */
import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/assignments',
}));

const fetchPayload = jest.fn();
jest.mock('@/lib/api/v2-client', () => ({
  apiClient: {
    assignments: { payload: (month: string) => fetchPayload(month) },
  },
}));

import { AssignmentsPage } from '@/components/assignments/AssignmentsPage';
import type {
  AssignmentNode,
  AssignmentSeat,
  AssignmentUser,
  AssignmentsPayload,
  ProductContractDetail,
} from '@/lib/v2/assignments/types';
import type { OrgUnitTreeLevel } from '@/lib/v2/org-units/levels';

const LEVELS: OrgUnitTreeLevel[] = ['entity', 'department'];

const node = (
  id: number,
  name: string,
  parentId: number | null,
  childIds: number[],
  memberIds: number[],
  headcount: number = memberIds.length,
): AssignmentNode => ({
  id,
  name,
  level: parentId === null ? 'entity' : 'department',
  levelLabel: parentId === null ? 'Entity' : 'Department',
  parentId,
  childIds,
  memberIds,
  headcount,
});

const user = (
  id: number,
  name: string,
  orgUnitId: number,
  seatIds: number[],
  over: Partial<AssignmentUser> = {},
): AssignmentUser => ({
  id,
  name,
  email: `${name.split(' ')[0].toLowerCase()}@example.com`,
  employeeId: `E${id}`,
  orgUnitId,
  status: 'active',
  costCenter: '70133 - Rates',
  region: 'London',
  country: 'GBR',
  seatIds,
  monthlyCost: 100,
  ...over,
});

const seat = (
  id: number,
  orgEmployeeId: number,
  over: Partial<AssignmentSeat> = {},
): AssignmentSeat => ({
  id,
  contractId: 100,
  productId: 200,
  productName: 'Terminal',
  vendorId: 1,
  vendorName: 'Bloomberg',
  deliveryMethods: ['Desktop'],
  orgEmployeeId,
  holderName: `Holder ${orgEmployeeId}`,
  assignedDate: '2026-01-15',
  inactiveReasons: [],
  underused: false,
  monthlyCost: 100,
  ...over,
});

const PAYLOAD: AssignmentsPayload = {
  window: { month: '2026-04', label: 'April 2026' },
  nodes: {
    1: node(1, 'Markets', null, [2, 3], [], 3),
    2: node(2, 'Rates', 1, [], [10, 11]),
    3: node(3, 'Credit', 1, [], [12]),
  },
  rootIds: [1],
  users: {
    10: user(10, 'Ada Lovelace', 2, [1000]),
    11: user(11, 'Alan Turing', 2, [1001, 1002]),
    12: user(12, 'Grace Hopper', 3, []),
  },
  seats: {
    1000: seat(1000, 10),
    1001: seat(1001, 11),
    1002: seat(1002, 11, {
      productId: 300,
      productName: 'Workspace',
      vendorId: 2,
      vendorName: 'LSEG',
      underused: true,
      monthlyCost: 50,
    }),
  },
  productDetails: {
    // Both seat products sit on contract 100, so the panel shows its terms.
    '100:200': {
      contractId: 100,
      orderNumber: 'CTR-2400',
      contractType: 'Trial Agreement',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      annualIncrease: 2,
      ratePerLicence: 1200,
      licences: 5,
    },
    '100:300': {
      contractId: 100,
      orderNumber: 'CTR-2400',
      contractType: 'Trial Agreement',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      annualIncrease: 2,
      ratePerLicence: 600,
      licences: 3,
    },
  },
  empty: false,
};

function renderPage(
  search = '',
  payload: AssignmentsPayload = PAYLOAD,
  {
    onUrlUpdate,
    pathLevels = LEVELS,
    defaultLayout,
  }: {
    onUrlUpdate?: jest.Mock;
    pathLevels?: OrgUnitTreeLevel[];
    defaultLayout?: number[];
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    // `hasMemory` keeps a set param across the queue flush, the way a real URL
    // does: the month has to survive long enough for its payload to arrive.
    <NuqsTestingAdapter
      hasMemory
      searchParams={search}
      onUrlUpdate={onUrlUpdate}
    >
      <QueryClientProvider client={queryClient}>
        <AssignmentsPage
          initialPayload={payload}
          pathLevels={pathLevels}
          baseCurrency="USD"
          dateFormat="dd/MM/yyyy"
          defaultLayout={defaultLayout}
        />
      </QueryClientProvider>
    </NuqsTestingAdapter>,
  );
}

// Radix's popper measures its content and cmdk scrolls the highlighted row
// into view; jsdom has neither layout nor ResizeObserver.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  push.mockClear();
  fetchPayload.mockReset();
});

describe('the HR structure rail', () => {
  it('opens at the share the reader last dragged it to', () => {
    renderPage('', PAYLOAD, { defaultLayout: [30, 70] });
    const nav = screen.getByRole('navigation', { name: 'HR structure' });
    const rail = nav.closest<HTMLElement>('[data-panel]');
    expect(rail?.style.flexGrow).toBe('30');
    // The rail's column is sticky, so nothing above it may clip overflow.
    expect(rail?.style.overflow).toBe('visible');
    expect(nav.closest<HTMLElement>('[data-panel-group]')?.style.overflow).toBe(
      'visible',
    );
  });

  it('shows the tree with a subtree headcount against each node', () => {
    renderPage();
    const nav = screen.getByRole('navigation', { name: 'HR structure' });
    expect(within(nav).getByText('Firmwide')).toBeTruthy();
    // Markets covers Rates (2) and Credit (1).
    const markets = within(nav).getByRole('button', { name: /^Markets/ });
    expect(markets.textContent).toContain('Markets');
    expect(markets.textContent).toContain('3');
  });

  it('expands a node to reveal its children', () => {
    renderPage();
    const nav = screen.getByRole('navigation', { name: 'HR structure' });
    expect(within(nav).queryByText('Rates')).toBeNull();
    fireEvent.click(
      within(nav).getByRole('button', { name: 'Expand Markets' }),
    );
    expect(within(nav).getByText('Rates')).toBeTruthy();
  });

  it('opens the branch leading to the current scope, people included', () => {
    renderPage('?unit=2');
    const nav = screen.getByRole('navigation', { name: 'HR structure' });
    expect(within(nav).getByText('Ada Lovelace')).toBeTruthy();
  });

  it('marks the selected scope with the sidebar selected token, and only it', () => {
    renderPage('?unit=2');
    const nav = screen.getByRole('navigation', { name: 'HR structure' });
    const rates = within(nav).getByRole('button', { name: /^Rates/ });
    expect(rates.closest('div')?.className).toContain('bg-selected');
    const markets = within(nav).getByRole('button', { name: /^Markets/ });
    expect(markets.closest('div')?.className).not.toContain('bg-selected');
    expect(markets.closest('div')?.className).toContain('hover:bg-hover');
  });

  it('filters the tree to matching nodes and people', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Jump to level or user'), {
      target: { value: 'credit' },
    });
    const nav = screen.getByRole('navigation', { name: 'HR structure' });
    expect(within(nav).getByText('Credit')).toBeTruthy();
    expect(within(nav).queryByText('Rates')).toBeNull();
  });

  it('names the level order so the reader knows what they are drilling through', () => {
    renderPage();
    const nav = screen.getByRole('navigation', { name: 'HR structure' });
    expect(within(nav).getByText(/Entity → Department → User/)).toBeTruthy();
  });
});

describe('the breadcrumb', () => {
  const currentCrumb = (crumbs: HTMLElement) => {
    const current = crumbs.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    return current[0] as HTMLElement;
  };

  it('offers the way back up as plain crumbs, no level captions', () => {
    renderPage('?unit=2');
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(
      within(crumbs).getByRole('button', { name: /Firmwide/ }),
    ).toBeTruthy();
    expect(
      within(crumbs).getByRole('button', { name: 'Markets' }),
    ).toBeTruthy();
    expect(within(crumbs).queryByText('Entity')).toBeNull();
    expect(within(crumbs).queryByText('Department')).toBeNull();
  });

  it('marks the current scope as the page, and only it', () => {
    renderPage('?unit=2');
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const current = currentCrumb(crumbs);
    expect(current.textContent).toContain('Rates');
    expect(within(crumbs).queryByRole('button', { name: 'Rates' })).toBeNull();
  });

  it('marks Firmwide when nothing is drilled into', () => {
    renderPage();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(currentCrumb(crumbs).textContent).toContain('Firmwide');
    expect(
      within(crumbs).queryByRole('button', { name: 'Show hidden levels' }),
    ).toBeNull();
  });

  it('folds the levels between Firmwide and the parent into a menu', async () => {
    const onUrlUpdate = jest.fn();
    renderPage('?tab=users', PAYLOAD, { onUrlUpdate });
    fireEvent.click(screen.getByText('Alan Turing'));
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    // Firmwide › … › Rates › Alan Turing: Markets is the folded one.
    expect(within(crumbs).queryByText('Markets')).toBeNull();
    expect(within(crumbs).getByRole('button', { name: 'Rates' })).toBeTruthy();

    const trigger = within(crumbs).getByRole('button', {
      name: 'Show hidden levels',
    });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const menu = screen.getByRole('menu');
    // The caption lives in the menu, where the name alone would not say which level.
    expect(within(menu).getByText('Entity')).toBeTruthy();
    fireEvent.click(within(menu).getByText('Markets'));
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)?.[0].queryString).toContain(
        'unit=1',
      ),
    );
  });
});

describe('HR status', () => {
  it('colours each status, and never paints the person red', () => {
    const mixed: AssignmentsPayload = {
      ...PAYLOAD,
      users: {
        ...PAYLOAD.users,
        11: { ...PAYLOAD.users[11], status: 'on_leave' },
        12: { ...PAYLOAD.users[12], status: 'inactive' },
      },
    };
    renderPage('?tab=users', mixed);

    const badge = (label: string) => screen.getByText(label);
    expect(badge('Active').className).toContain('emerald');
    expect(badge('On leave').className).toContain('amber');
    expect(badge('Inactive').className).toContain('red');

    // The name stays foreground: the badge carries the signal.
    expect(screen.getByText('Grace Hopper').className).not.toContain(
      'destructive',
    );
  });
});

describe('KPI cards', () => {
  it('reports the five figures for the selected scope', () => {
    renderPage('?unit=2');
    for (const label of [
      'People in scope',
      'Assigned users',
      'Assignments',
      'Monthly cost',
      'Underutilized licences',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0);
  });

  it('carries no explanatory footnote, and no unit-level remainder anywhere', () => {
    renderPage('?unit=2');
    expect(screen.queryByText(/allocated at unit level/i)).toBeNull();
  });
});

describe('the Products tab', () => {
  it('groups products under their vendor', () => {
    renderPage();
    expect(screen.getByText('Bloomberg')).toBeTruthy();
    expect(screen.getByText('Terminal')).toBeTruthy();
    expect(screen.getByText('Workspace')).toBeTruthy();
  });

  it('shows a product with no allocated value as zero, not as a share of other money', () => {
    const free: AssignmentsPayload = {
      ...PAYLOAD,
      seats: {
        ...PAYLOAD.seats,
        1000: { ...PAYLOAD.seats[1000], monthlyCost: 0 },
        1001: { ...PAYLOAD.seats[1001], monthlyCost: 0 },
      },
    };
    renderPage('', free);
    const terminalRow = screen
      .getAllByRole('row')
      .find((row) => row.textContent?.includes('Terminal'));
    expect(terminalRow?.textContent).toContain('$0.00');
  });

  it('carries each vendor’s totals on the group row above its products', () => {
    renderPage();
    const bloomberg = screen
      .getAllByRole('row')
      .find((row) => row.textContent?.startsWith('Bloomberg'));
    // Two Terminal seats at $100, none of them inactive.
    expect(bloomberg?.textContent).toContain('2');
    expect(bloomberg?.textContent).toContain('$200.00');

    const lseg = screen
      .getAllByRole('row')
      .find((row) => row.textContent?.startsWith('LSEG'));
    expect(lseg?.textContent).toContain('$50.00');
  });

  it('collapses a vendor’s products from its group row', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Terminal' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bloomberg' }));
    expect(screen.queryByRole('button', { name: 'Terminal' })).toBeNull();
    // The vendor's own totals stay on screen while its products are hidden.
    expect(screen.getByRole('button', { name: 'Bloomberg' })).toBeTruthy();
  });

  const openPanel = (name: RegExp | string) => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name }));
    return screen.getByRole('dialog');
  };
  const activeTab = (dialog: HTMLElement) =>
    within(dialog)
      .getAllByRole('tab')
      .find((tab) => tab.getAttribute('aria-selected') === 'true')?.textContent;

  it('opens on Details from the product name, showing the contract terms', () => {
    const dialog = openPanel('Terminal');
    expect(activeTab(dialog)).toBe('Details');
    expect(within(dialog).getByText('CTR-2400')).toBeTruthy();
    expect(within(dialog).getByText('2%')).toBeTruthy();
    // Annual cost in scope is the monthly figure annualised: $100 x 12.
    expect(within(dialog).getByText('$1,200.00')).toBeTruthy();
    expect(within(dialog).getByText('Desktop')).toBeTruthy();
  });

  it('names the vendor above the product, not beside it', () => {
    const dialog = openPanel('Terminal');
    expect(within(dialog).getByText('Bloomberg')).toBeTruthy();
    expect(within(dialog).getByText('Terminal')).toBeTruthy();
  });

  it('opens on Users from the users count, with the licence headline', () => {
    const dialog = openPanel(/users of Terminal/i);
    expect(activeTab(dialog)).toBe('Users (2)');
    expect(within(dialog).getByText('Licences')).toBeTruthy();
    expect(within(dialog).getByText('Monthly cost')).toBeTruthy();
    // The holder's team sits under their name.
    expect(within(dialog).getAllByText('Rates').length).toBeGreaterThan(0);
  });

  it('opens on Inactive from the inactive count, costing only those seats', () => {
    const dialog = openPanel(/inactive seats of Workspace/i);
    expect(activeTab(dialog)).toBe('Inactive (1)');
    expect(within(dialog).getByText('Inactive licences')).toBeTruthy();
    // The one underused seat costs $50; the headline and its row agree.
    expect(within(dialog).getAllByText('$50.00')).toHaveLength(2);
  });

  it('shows identifier and last used as placeholders', () => {
    const dialog = openPanel(/users of Terminal/i);
    expect(within(dialog).getByText('Identifier')).toBeTruthy();
    expect(within(dialog).getByText('Last used')).toBeTruthy();
  });

  it('sorts on a header click and cycles back to the default', () => {
    renderPage();
    const monthly = screen.getByRole('button', { name: 'Monthly' });
    const leadVendor = () =>
      screen
        .getAllByRole('row')
        .map((row) => row.textContent ?? '')
        .filter(
          (text) => text.includes('Bloomberg') || text.includes('LSEG'),
        )[0];

    // Default is biggest spend first: Bloomberg's $200 beats LSEG's $50.
    expect(leadVendor()).toContain('Bloomberg');
    // First click repeats the default direction, second flips it.
    fireEvent.click(monthly);
    fireEvent.click(monthly);
    expect(leadVendor()).toContain('LSEG');
    // Third click restores the default rather than stranding a sort.
    fireEvent.click(monthly);
    expect(leadVendor()).toContain('Bloomberg');
  });

  it('marks the sorted column for assistive tech', () => {
    renderPage();
    const vendor = screen.getByRole('button', { name: 'Vendor' });
    expect(vendor.closest('th')?.getAttribute('aria-sort')).toBeNull();
    fireEvent.click(vendor);
    expect(vendor.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    fireEvent.click(vendor);
    expect(vendor.closest('th')?.getAttribute('aria-sort')).toBe('descending');
  });

  it('offers every column as a sort, Monthly included', () => {
    renderPage();
    for (const label of ['Vendor', 'Product', 'Users', 'Inactive', 'Monthly']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('says how many contracts a product spans instead of naming one', () => {
    const spread: AssignmentsPayload = {
      ...PAYLOAD,
      seats: {
        ...PAYLOAD.seats,
        1001: { ...PAYLOAD.seats[1001], contractId: 999 },
      },
    };
    renderPage('', spread);
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('2 contracts')).toBeTruthy();
    // Several contracts, so nothing to point a single link at.
    expect(
      within(dialog).queryByRole('link', { name: /contracts/ }),
    ).toBeNull();
  });

  // The linked contract names the document, never the PostSig id (PSK-1989).
  const openTerminalWith = (detail: Partial<ProductContractDetail>) => {
    const payload: AssignmentsPayload = {
      ...PAYLOAD,
      productDetails: {
        ...PAYLOAD.productDetails,
        '100:200': { ...PAYLOAD.productDetails['100:200'], ...detail },
      },
    };
    renderPage('', payload);
    fireEvent.click(screen.getByRole('button', { name: 'Terminal' }));
    return screen.getByRole('dialog');
  };

  it('links the linked contract by its Contract No.', () => {
    const dialog = openPanel('Terminal');
    const link = within(dialog).getByRole('link', { name: /CTR-2400/ });
    expect(link.getAttribute('href')).toBe('/contracts/100');
    expect(within(dialog).queryByText('#100')).toBeNull();
  });

  it('falls back to the contract type when no Contract No. was extracted', () => {
    const dialog = openTerminalWith({ orderNumber: null });
    const link = within(dialog).getByRole('link', { name: /Trial Agreement/ });
    expect(link.getAttribute('href')).toBe('/contracts/100');
  });

  it('still links the contract when it has neither number nor type', () => {
    const dialog = openTerminalWith({ orderNumber: null, contractType: null });
    const link = within(dialog).getByRole('link', { name: /View contract/ });
    expect(link.getAttribute('href')).toBe('/contracts/100');
  });

  describe('for a Bloomberg product, which has no contract record to open', () => {
    const bloombergPayload = (
      seatOver: Partial<AssignmentSeat> = {},
    ): AssignmentsPayload => ({
      ...PAYLOAD,
      users: { 10: user(10, 'Ada Lovelace', 2, [1003]) },
      seats: {
        1003: seat(1003, 10, {
          id: 1003,
          contractId: -500,
          productId: 7,
          productName: 'Bloomberg Anywhere',
          deliveryMethods: ['Terminal'],
          ...seatOver,
        }),
      },
      productDetails: {
        '-500:7': {
          contractId: -500,
          orderNumber: null,
          contractType: null,
          startDate: '2000-04-07',
          endDate: '2028-04-07',
          annualIncrease: null,
          ratePerLicence: null,
          licences: 1,
        },
      },
    });
    const openBloomberg = (seatOver: Partial<AssignmentSeat> = {}) => {
      renderPage('', bloombergPayload(seatOver));
      fireEvent.click(
        screen.getByRole('button', { name: 'Bloomberg Anywhere' }),
      );
      return screen.getByRole('dialog');
    };

    it('links the inventory view narrowed to the product instead', () => {
      const dialog = openBloomberg();
      const links = within(dialog).getAllByRole('link');
      expect(links.map((link) => link.getAttribute('href'))).toEqual([
        '/vendors/1/inventory?tab=subscriptions&product=Bloomberg%20Anywhere',
      ]);
      expect(within(dialog).queryByText('Linked contract')).toBeNull();
    });

    it('adds the exchange entitlements tab when its terminals carry any', () => {
      const dialog = openBloomberg({
        entitlements: {
          exchanges: [{ code: 'CBOE', name: 'Cboe Europe L1', monthlyCost: 3 }],
          monthlyCost: 3,
        },
      });
      expect(
        within(dialog)
          .getAllByRole('link')
          .map((link) => link.getAttribute('href')),
      ).toEqual([
        '/vendors/1/inventory?tab=subscriptions&product=Bloomberg%20Anywhere',
        '/vendors/1/inventory?tab=exchange',
      ]);
    });
  });
});

describe('the Users tab', () => {
  // Seeded through the URL: the tab is nuqs query state, and nuqs applies an
  // update asynchronously, so seeding keeps these assertions about the table
  // rather than about update timing. The switch itself is covered below.
  const openUsers = () => renderPage('?tab=users');

  it('lists people with a column per HR level, sorted by assignment count', () => {
    openUsers();
    // Default sort is assignment count descending: Alan holds two seats.
    const rows = screen
      .getAllByRole('row')
      .map((row) => row.textContent ?? '')
      .filter((text) => text.includes('@example.com'));
    expect(rows[0]).toContain('Alan Turing');
    // One cell per level in use, read by level rather than by position.
    expect(rows[0]).toContain('Markets');
    expect(rows[0]).toContain('Rates');
  });

  it('narrows the table by free text', () => {
    openUsers();
    fireEvent.change(screen.getByLabelText('Search users'), {
      target: { value: 'grace' },
    });
    expect(screen.getByText('Grace Hopper')).toBeTruthy();
    expect(screen.queryByText('Alan Turing')).toBeNull();
  });

  it('says so when nothing matches rather than showing an empty table', () => {
    openUsers();
    fireEvent.change(screen.getByLabelText('Search users'), {
      target: { value: 'nobody' },
    });
    expect(screen.getByText(/matches those filters/i)).toBeTruthy();
  });

  it('does not show all employees in an HR level with no assigned users', () => {
    renderPage('?unit=3&tab=users');
    const table = screen.getByRole('table');
    expect(within(table).queryByText('Grace Hopper')).toBeNull();
    expect(
      within(table).getByText(/No assigned users in this scope/i),
    ).toBeTruthy();
  });

  it('offers a reset only once a filter narrows the table, and clears it', () => {
    openUsers();
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();

    const search = screen.getByLabelText('Search users') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'grace' } });
    expect(screen.queryByText('Alan Turing')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(search.value).toBe('');
    expect(screen.getByText('Alan Turing')).toBeTruthy();
    // The button goes away with the filters it clears.
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('offers every column as a sort, HR levels and products included', () => {
    openUsers();
    for (const label of [
      'User',
      'Entity',
      'Department',
      'HR status',
      'Vendor',
      'Assigned products',
      'Assignments',
      'Monthly',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('sorts an HR level from its header popover', () => {
    openUsers();
    fireEvent.click(screen.getByRole('button', { name: 'Department' }));
    expect(screen.getByText('Sort Ascending')).toBeTruthy();
    expect(screen.getByText('Sort Descending')).toBeTruthy();
  });

  const chooseFromPopover = (header: string, option: string) => {
    fireEvent.click(screen.getByRole('button', { name: header }));
    const popover = screen.getByRole('dialog');
    fireEvent.click(within(popover).getByText(option));
  };

  it('filters an HR level from its header popover', () => {
    openUsers();
    // The options are the values in scope, and unticking one hides its people.
    chooseFromPopover('Department', 'Credit');
    expect(screen.queryByText('Grace Hopper')).toBeNull();
    expect(screen.getByText('Alan Turing')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
  });

  it('filters on a vendor, keeping everyone who holds any seat from it', () => {
    openUsers();
    chooseFromPopover('Vendor', 'LSEG');
    // Alan's seats span both vendors, so unticking LSEG must not drop him.
    expect(screen.getByText('Alan Turing')).toBeTruthy();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    // Grace holds nothing, so no vendor claims her.
    expect(screen.queryByText('Grace Hopper')).toBeNull();
  });

  const peopleInOrder = () =>
    screen
      .getAllByRole('row')
      .map((row) => row.textContent ?? '')
      .filter((text) => text.includes('@example.com'));

  it('sorts on one HR level column, ties broken by name', () => {
    openUsers();
    fireEvent.click(screen.getByRole('button', { name: 'Department' }));
    fireEvent.click(screen.getByText('Sort Ascending'));
    // Credit before Rates; Ada and Alan share Rates and fall back to name.
    expect(peopleInOrder().map((text) => text.slice(0, 4))).toEqual([
      'Grac',
      'Ada ',
      'Alan',
    ]);
  });

  it('sorts on the assigned products column', () => {
    openUsers();
    const header = screen.getByRole('button', { name: 'Assigned products' });
    // Ascending puts the person holding nothing first.
    fireEvent.click(header);
    expect(peopleInOrder()[0]).toContain('Grace Hopper');
    fireEvent.click(header);
    expect(peopleInOrder().at(-1)).toContain('Grace Hopper');
  });

  it('opens a person’s profile in place, named in the breadcrumb', () => {
    openUsers();
    fireEvent.click(screen.getByText('Alan Turing'));

    // The person is the last crumb, which is what replaced the back button.
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Alan Turing')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Back to scope/ })).toBeNull();

    // The three headline cards: two seats, their cost, and one of them underused.
    expect(screen.getAllByText('Assignments').length).toBeGreaterThan(0);
    expect(screen.getByText('Inactive')).toBeTruthy();
    // The seats sit in their own panel, apart from the person and the figures.
    const seats = screen.getByRole('table').closest('section') as HTMLElement;
    expect(within(seats).queryByText('Alan Turing')).toBeNull();
    expect(within(seats).queryByText('Inactive')).toBeNull();
    // The HR facts stay folded until asked for.
    expect(screen.queryByText('Cost centre')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'HR structure' }));
    expect(screen.getByText('Cost centre')).toBeTruthy();
    expect(screen.getByText('Entity')).toBeTruthy();
    expect(screen.getByText('Department')).toBeTruthy();
    expect(screen.getByText('Location')).toBeTruthy();
    expect(screen.getByText(/London/)).toBeTruthy();
    // Title and Manager have no columns on org_employees, so no rows for them.
    expect(screen.queryByText('Manager')).toBeNull();
    expect(screen.queryByText('Title')).toBeNull();
  });

  it('shows a placeholder for a missing cost centre and keeps the location', () => {
    const noCostCentre: AssignmentsPayload = {
      ...PAYLOAD,
      users: {
        ...PAYLOAD.users,
        11: { ...PAYLOAD.users[11], costCenter: null, region: null },
      },
    };
    renderPage('?tab=users', noCostCentre);
    fireEvent.click(screen.getByText('Alan Turing'));
    fireEvent.click(screen.getByRole('button', { name: 'HR structure' }));
    expect(
      screen.getByText('Cost centre').nextElementSibling?.textContent,
    ).toBe('—');
    expect(
      screen.getByText('United Kingdom of Great Britain and Northern Ireland'),
    ).toBeTruthy();
  });

  it('shows the person’s own path in the breadcrumb, whatever scope was open', () => {
    renderPage('?tab=users');
    fireEvent.click(screen.getByText('Alan Turing'));
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Rates')).toBeTruthy();
    expect(within(crumbs).getByText('Alan Turing')).toBeTruthy();
    expect(
      within(crumbs).getByRole('button', { name: 'Show hidden levels' }),
    ).toBeTruthy();
  });

  it('puts a person with no HR path straight under Firmwide', () => {
    const unplaced: AssignmentsPayload = {
      ...PAYLOAD,
      users: {
        ...PAYLOAD.users,
        11: { ...PAYLOAD.users[11], orgUnitId: null },
      },
    };
    renderPage('?tab=users', unplaced);
    fireEvent.click(screen.getByText('alan@example.com'));
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(
      within(crumbs).getByRole('button', { name: /Firmwide/ }),
    ).toBeTruthy();
    expect(within(crumbs).getByText('Alan Turing')).toBeTruthy();
  });

  it('shows the person’s total with nothing held back beside it', () => {
    openUsers();
    fireEvent.click(screen.getByText('Alan Turing'));
    expect(screen.queryByText(/Allocated without a seat/)).toBeNull();
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
  });

  it('returns to the scope by clicking a crumb above the person', () => {
    openUsers();
    fireEvent.click(screen.getByText('Alan Turing'));
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    fireEvent.click(within(crumbs).getByRole('button', { name: /Firmwide/ }));
    expect(screen.getByText('People in scope')).toBeTruthy();
  });
});

describe('the Underutilized licences tab', () => {
  it('lists the reclaim candidates and what they cost a month', () => {
    renderPage('?tab=underused');
    expect(screen.getByText(/candidates for reclaim/i)).toBeTruthy();
    expect(screen.getByText('Workspace')).toBeTruthy();
    expect(
      screen.getByText(/1 licence · \$50\.00 \/ month at risk/),
    ).toBeTruthy();
  });

  it('counts itself in the tab label', () => {
    renderPage();
    expect(
      screen.getByRole('tab', { name: 'Underutilized licences (1)' }),
    ).toBeTruthy();
  });
});

describe('sub-tab switching', () => {
  it('moves to the Users tab and keeps it in the URL', async () => {
    const onUrlUpdate = jest.fn();
    renderPage('', PAYLOAD, { onUrlUpdate });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'User assignments' }));
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)?.[0].queryString).toContain(
        'tab=users',
      ),
    );
  });

  it('keeps the scope in the URL so a drill-down is shareable', async () => {
    const onUrlUpdate = jest.fn();
    renderPage('', PAYLOAD, { onUrlUpdate });
    const nav = screen.getByRole('navigation', { name: 'HR structure' });
    fireEvent.click(within(nav).getByText('Markets'));
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)?.[0].queryString).toContain(
        'unit=1',
      ),
    );
    // A shallow update: the server component must not re-run for a drill-down.
    expect(push).not.toHaveBeenCalled();
  });
});

describe('the month stepper', () => {
  const mayPayload: AssignmentsPayload = {
    ...PAYLOAD,
    window: { month: '2026-05', label: 'May 2026' },
  };
  const arrow = (name: 'Next month' | 'Previous month') =>
    screen.getByRole('button', { name }) as HTMLButtonElement;

  it('names the window beside the controls and under the cost', () => {
    renderPage();
    // Once in the stepper, once as the Monthly cost card's footnote.
    expect(screen.getAllByText('April 2026')).toHaveLength(2);
  });

  it('serves the rendered month from the page, without asking the API', () => {
    renderPage();
    expect(fetchPayload).not.toHaveBeenCalled();
  });

  it('falls back to the rendered month when the URL names one it cannot use', async () => {
    renderPage('?month=2026-13');
    expect(screen.getAllByText('April 2026')).toHaveLength(2);
    expect(fetchPayload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(fetchPayload).toHaveBeenCalledTimes(1));
    expect(fetchPayload).toHaveBeenCalledWith('2026-05');
  });

  it('steps forward a month, shallowly: the payload comes from the API', async () => {
    fetchPayload.mockResolvedValue({ payload: mayPayload });
    const onUrlUpdate = jest.fn();
    renderPage('', PAYLOAD, { onUrlUpdate });
    fireEvent.click(arrow('Next month'));

    await waitFor(() => expect(fetchPayload).toHaveBeenCalledWith('2026-05'));
    const update = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(update.queryString).toContain('month=2026-05');
    expect(update.options.shallow).not.toBe(false);
    // The server component must not re-run to re-price a month.
    expect(push).not.toHaveBeenCalled();
  });

  it('shows the stepped-to month once its payload lands', async () => {
    fetchPayload.mockResolvedValue({ payload: mayPayload });
    renderPage();
    fireEvent.click(arrow('Next month'));
    await waitFor(() =>
      expect(screen.getAllByText('May 2026')).toHaveLength(2),
    );
  });

  it('names the month being stepped to while it loads', async () => {
    fetchPayload.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.click(arrow('Next month'));
    // The label moves at once; the cards keep April's figures until May lands.
    await waitFor(() => expect(screen.getByText('May 2026')).toBeTruthy());
    expect(screen.getByText('April 2026')).toBeTruthy();
  });

  it('locks the arrows while a month is in flight', async () => {
    fetchPayload.mockReturnValue(new Promise(() => {}));
    renderPage();
    fireEvent.click(arrow('Next month'));
    await waitFor(() => expect(arrow('Next month').disabled).toBe(true));
    expect(arrow('Previous month').disabled).toBe(true);
  });

  it('says so when a month fails, and keeps the one on screen', async () => {
    fetchPayload.mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(arrow('Next month'));
    await waitFor(() =>
      expect(screen.getByText(/Couldn’t load May 2026/)).toBeTruthy(),
    );
    expect(screen.getByText('April 2026')).toBeTruthy();
  });

  it('steps back a month', async () => {
    fetchPayload.mockReturnValue(new Promise(() => {}));
    const onUrlUpdate = jest.fn();
    renderPage('', PAYLOAD, { onUrlUpdate });
    fireEvent.click(arrow('Previous month'));
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)?.[0].queryString).toContain(
        'month=2026-03',
      ),
    );
  });
});

describe('degraded orgs', () => {
  it('renders a flat list when the org has people but no hierarchy', () => {
    const flat: AssignmentsPayload = {
      ...PAYLOAD,
      nodes: {},
      rootIds: [],
      users: {
        10: { ...user(10, 'Ada Lovelace', 2, [1000]), orgUnitId: null },
      },
      seats: { 1000: PAYLOAD.seats[1000] },
    };
    renderPage('', flat, { pathLevels: [] });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'User assignments' }));
    // No tree, so no level columns — just the person and their seat.
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy();
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
  });

  it('points an org with no employees at the roster', () => {
    renderPage('', { ...PAYLOAD, empty: true });
    expect(screen.getByText(/No employees yet/i)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Settings › Employees/i }),
    ).toBeTruthy();
  });
});
