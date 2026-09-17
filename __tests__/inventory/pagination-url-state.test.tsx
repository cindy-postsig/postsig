/**
 * @jest-environment jsdom
 *
 * Inventory keeps its page in the URL (`?page=`), so the router write has to
 * feed back through `useSearchParams` for the table to move. The mock router
 * below reproduces that round trip — without it, paging looks fine in a test
 * even when the component bounces itself straight back to page 1.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InventoryTableClient } from '@/app/(app)/(cpm)/inventory/InventoryTableClient';
import { TableExpandedStateProvider } from '@/app/context/TableExpandedStateContext';
import type { InventoryItem } from '@/lib/v2/inventory/types';
import type { UserMetadata } from '@/constants/types';

const PATHNAME = '/inventory';

let mockUrl = PATHNAME;
const mockSubscribers = new Set<() => void>();

const mockNotify = () => {
  mockSubscribers.forEach((subscriber) => subscriber());
};

jest.mock('next/navigation', () => {
  const react: typeof React = jest.requireActual('react');
  return {
    usePathname: () => '/inventory',
    useRouter: () => ({
      replace: (url: string) => {
        mockUrl = url;
        mockNotify();
      },
    }),
    // Re-renders its callers on every router write, the way the app router's
    // own hook does.
    useSearchParams: () => {
      const [, rerender] = react.useReducer((tick: number) => tick + 1, 0);
      react.useEffect(() => {
        mockSubscribers.add(rerender);
        return () => {
          mockSubscribers.delete(rerender);
        };
      }, []);
      return new URLSearchParams(mockUrl.split('?')[1] ?? '');
    },
  };
});

// Applying a filter for real puts this component into an unbounded update loop
// under jsdom (reproduces on `development` too, unrelated to the page param), so
// the setter records the write instead of feeding it back as state.
const mockFilterWrites: Record<string, unknown>[] = [];
jest.mock('nuqs', () => {
  const actual = jest.requireActual('nuqs');
  // One frozen tuple: the table syncs its column filters off this object's
  // identity, so handing back a fresh one each render would loop.
  const state = {
    vendor: 'all',
    delivery: [],
    sponsor: [],
    group: 'all',
    page: null,
  };
  const setState = (values: Record<string, unknown>) => {
    mockFilterWrites.push(values);
  };
  return { ...actual, useQueryStates: () => [state, setState] };
});

jest.mock('@/components/vendors/VendorIcon', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/app/(app)/(cpm)/inventory/InventoryItemSheet', () => ({
  InventoryItemSheet: () => null,
}));
jest.mock('@/components/contracts/ExportReportCSVButton', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/contracts/ColumnLayoutMenu', () => ({
  ColumnLayoutMenu: () => null,
}));
// Only reached when grouping by vendor, which this table does not; the real
// module drags the server-side currency stack into jsdom.
jest.mock('@/lib/v2/inventory/transforms', () => ({
  groupInventoryByVendor: jest.fn(() => []),
}));
jest.mock('@/lib/api/v2-client', () => ({
  apiClient: {
    inventory: { list: jest.fn().mockResolvedValue({ items: [], count: 0 }) },
  },
}));

// The real filter is a Radix popover over a cmdk list; a flat button per option
// keeps the test on the table's own change handler.
jest.mock('@/components/ui/data-table/components/MultiSelectFilter', () => ({
  MultiSelectFilter: ({
    options,
    placeholder,
    onValueChange,
    disabled,
  }: {
    options: { value: string; label: string }[];
    placeholder: string;
    onValueChange: (value: string[]) => void;
    disabled?: boolean;
  }) => (
    <div>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onValueChange([option.value])}
        >
          {`${placeholder}:${option.value}`}
        </button>
      ))}
    </div>
  ),
}));

const buildItem = (index: number): InventoryItem => ({
  id: `item-${index}`,
  vendor: `Vendor ${String(index).padStart(3, '0')}`,
  productName: [`Product ${index}`],
  licensesCount: 1,
  endUsers: '',
  // Sorted ascending on endDate, so the index order is the row order.
  startDate: '2026-01-01',
  endDate: `2026-01-01T00:${String(index).padStart(2, '0')}:00.000Z`,
  cost: 100,
  costNative: 100,
  currency: 'USD',
  // Two values apiece keeps both multi-select filters enabled: the table
  // disables a filter that offers a single option.
  deliveryMethods: [index % 2 === 0 ? 'Desktop' : 'Web'],
  businessSponsor: [index % 2 === 0 ? 'Ada' : 'Grace'],
  status: 'Active',
  activeUsers: [],
});

// Page size is 50, so 60 items span exactly two pages.
const ITEMS = Array.from({ length: 60 }, (_, index) => buildItem(index + 1));

const USER_METADATA = {
  userId: 'user-1',
  userProfile: null,
  userRole: 1,
  organizationId: 'org-1',
  organizationName: 'Acme',
  organizationFY: 1,
  dateFormat: 'MM/dd/yyyy',
  organizationDateFormat: 'MM/dd/yyyy',
  baseCurrency: 'USD',
  appModules: [],
  isTrial: false,
} as unknown as UserMetadata;

// react-query notifies observers on a setTimeout(0) and the page only moves
// once the router write has re-rendered every useSearchParams caller; yielding
// a macrotask inside act settles both.
const interact = (run: () => void) =>
  act(async () => {
    run();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

// The pager renders icon-only buttons, last in the document: previous, next.
const nextPageButton = () => screen.getAllByRole('button').slice(-1)[0];

const showing = () =>
  screen
    .getByText(/^Showing/)
    .textContent?.replace(/\s+/g, ' ')
    .trim();

const renderTable = () => {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TableExpandedStateProvider>
        <InventoryTableClient
          initialData={ITEMS}
          userMetadata={USER_METADATA}
        />
      </TableExpandedStateProvider>
    </QueryClientProvider>,
  );
};

// The sticky-column offsets measure the header row; jsdom has neither layout
// nor ResizeObserver, and the offsets are purely cosmetic here.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe('inventory pagination url state', () => {
  beforeEach(() => {
    mockUrl = PATHNAME;
    mockSubscribers.clear();
    mockFilterWrites.length = 0;
  });

  it('stays on page 2 after paging forward', async () => {
    renderTable();
    expect(showing()).toBe('Showing 1 to 50 of 60 Items');

    await interact(() => fireEvent.click(nextPageButton()));

    expect(mockUrl).toBe('/inventory?page=2');
    expect(showing()).toBe('Showing 51 to 60 of 60 Items');
  });

  it('honours a deep link straight to page 2', async () => {
    mockUrl = '/inventory?page=2';
    renderTable();

    // Nothing may knock the page back off the URL as the effects settle.
    await interact(() => undefined);

    expect(mockUrl).toBe('/inventory?page=2');
    expect(showing()).toBe('Showing 51 to 60 of 60 Items');
  });

  it('clears the page param on every filter write', () => {
    renderTable();

    fireEvent.click(
      screen.getByRole('button', { name: 'All Delivery Methods:Desktop' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'All Business Sponsors:Ada' }),
    );

    expect(mockFilterWrites).toEqual([
      { delivery: ['Desktop'], page: null },
      { sponsor: ['Ada'], page: null },
    ]);
  });
});
