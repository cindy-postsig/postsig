/**
 * @jest-environment jsdom
 */
import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

const saveAllocationBudgetAction = jest.fn();
jest.mock('@/lib/api/v2-client', () => ({
  apiClient: {
    costAllocation: {
      saveBudget: (...args: unknown[]) => saveAllocationBudgetAction(...args),
    },
  },
}));
const refresh = jest.fn();
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push }),
  usePathname: () => '/reports/allocation-rollup',
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
const toast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast }),
}));
jest.mock('@/components/vendors/VendorIcon', () => ({
  __esModule: true,
  default: ({ name }: { name: string }) => <span>{`icon:${name}`}</span>,
}));
const allocationSheetSubject = jest.fn();
jest.mock('@/components/contracts/cost-allocation/AllocationSheet', () => ({
  AllocationSheet: ({ subject }: { subject: { id: number } | null }) => {
    allocationSheetSubject(subject);
    return subject ? <div data-testid="allocation-sheet" /> : null;
  },
}));

import { AllocationRollupReport } from '@/components/reports/allocation-rollup/AllocationRollupReport';
import { buildAllocationContext } from '@/lib/v2/cost-allocation/context';
import {
  buildAllocationRollup,
  type AllocationRollupData,
} from '@/lib/v2/cost-allocation/rollup-report-rows';

const ctx = buildAllocationContext({
  allocations: [],
  lines: [],
  units: [
    { id: 1, level: 'entity', name: 'Bank', parent_id: null },
    { id: 2, level: 'department', name: 'Research', parent_id: 1 },
    { id: 3, level: 'cost_center', name: 'CC-1', parent_id: null },
  ],
  employees: [
    {
      id: 9,
      name: 'Ada',
      status: 'active',
      deleted_at: null,
      org_unit_id: 2,
      cost_center: 'CC-1',
    },
  ],
  seats: [],
  relationships: [],
});

function data(
  overrides: Partial<AllocationRollupData> = {},
): AllocationRollupData {
  const levelOrder: Array<'entity' | 'department'> = ['entity', 'department'];
  return {
    period: 'this-month',
    window: { start: '2026-08-01', end: '2026-09-01' },
    custom: null,
    costMethod: 'amortized',
    fiscalYears: [2026],
    budgetFiscalYear: 2026,
    projected: null,
    bloombergSeatRenewalIncreasePercent: null,
    unallocatedContracts: [],
    ...buildAllocationRollup({
      targetTotals: new Map([
        ['unit:2', 100],
        ['user:9', 20],
        ['unit:3', 5],
        ['unassigned', 7],
      ]),
      unitsById: ctx.unitsById,
      employeesById: ctx.employeesById,
      levelOrder,
      employees: [
        {
          id: 9,
          name: 'Ada',
          status: 'active',
          deleted_at: null,
          org_unit_id: 2,
          cost_center: 'CC-1',
        },
      ],
      budgetByKey: new Map([['unit:2', 1000]]),
    }),
    ...overrides,
  };
}

// Every allocation on a cost centre, as Berenberg's are: the flat Cost Centers
// view places all of it, so nothing is left outside.
const costCenterOnlyData = () => {
  const levelOrder: Array<'entity' | 'department'> = ['entity', 'department'];
  return data(
    buildAllocationRollup({
      targetTotals: new Map([
        ['unit:3', 5],
        ['unassigned', 7],
      ]),
      unitsById: ctx.unitsById,
      employeesById: ctx.employeesById,
      levelOrder,
      employees: [
        {
          id: 9,
          name: 'Ada',
          status: 'active',
          deleted_at: null,
          org_unit_id: 2,
          cost_center: 'CC-1',
        },
      ],
      budgetByKey: new Map(),
    }),
  );
};

const unallocatedData = () =>
  data({
    unallocatedContracts: [
      {
        id: 55,
        vendor: 'Acme',
        vendorDomain: 'acme.com',
        name: 'ORD-12',
        product: 'Terminal',
        products: [
          { id: 1, name: 'Terminal' },
          { id: 2, name: 'Data Feed' },
        ],
        termStart: '2026-01-01',
        termEnd: '2026-12-31',
        amount: 40,
      },
      {
        id: 56,
        vendor: null,
        vendorDomain: '',
        name: 'MSA · ID 56',
        product: '',
        products: [],
        termStart: null,
        termEnd: null,
        amount: null,
      },
    ],
  });

const renderReport = (
  props: Partial<React.ComponentProps<typeof AllocationRollupReport>> = {},
) =>
  render(
    <AllocationRollupReport
      data={data()}
      canEdit
      baseCurrency="USD"
      dateFormat="dd/MM/yyyy"
      {...props}
    />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  saveAllocationBudgetAction.mockResolvedValue({ success: true });
});

const expandRow = (name: string) =>
  fireEvent.click(
    within(screen.getByText(name).closest('tr') as HTMLElement).getByRole(
      'button',
      { name: 'Expand' },
    ),
  );

// The catch-all rows are hand-built, so their cell count must track the
// header row in both the accordion and flat layouts.
function expectRowsToMatchHeaders() {
  const headerCount = screen.getAllByRole('columnheader').length;
  for (const row of screen.getAllByRole('row').slice(1)) {
    expect(row.querySelectorAll('td')).toHaveLength(headerCount);
  }
}

describe('AllocationRollupReport', () => {
  it("tags a row's level only below the view's own level", () => {
    renderReport();

    const bank = screen.getByText('Bank').closest('tr') as HTMLElement;
    expect(within(bank).queryByText('Entity')).toBeNull();
    fireEvent.click(within(bank).getByRole('button', { name: 'Expand' }));

    const research = screen.getByText('Research').closest('tr') as HTMLElement;
    expect(within(research).getByText('Department')).toBeTruthy();
  });

  it('renders the top level collapsed with the two catch-all rows and reconciling cards', () => {
    renderReport();

    expect(screen.getByText('Bank')).toBeTruthy();
    expect(screen.queryByText('Research')).toBeNull();
    expect(screen.getByText('Outside hierarchy')).toBeTruthy();
    expect(screen.getByText('Unassigned')).toBeTruthy();
    expect(screen.getAllByText('Total Spend')).toHaveLength(2);
    expect(screen.getAllByText('$132').length).toBeGreaterThan(0);
    expectRowsToMatchHeaders();
  });

  it('pairs the current FY total with the projected FY on the Current FY preset', () => {
    renderReport({
      data: data({
        period: 'current-fy',
        window: { start: '2026-01-01', end: '2027-01-01' },
        projected: 150,
      }),
    });

    expect(screen.getByText('Current FY Spend')).toBeTruthy();
    expect(screen.getByText('Projected FY Spend')).toBeTruthy();
    expect(screen.getAllByText('$150').length).toBeGreaterThan(0);
    // Only the column header still says Total Spend; the card is gone.
    expect(screen.getAllByText('Total Spend')).toHaveLength(1);
  });

  it('expands a row, and the slicer reroots the accordion', () => {
    renderReport();

    expandRow('Bank');
    expect(screen.getByText('Research')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Cost Centers' }));
    expect(screen.getByText('CC-1')).toBeTruthy();
    expect(screen.queryByText('Bank')).toBeNull();
  });

  it('shows rolled-up spend on a team funded only through its people', () => {
    const ada = {
      id: 9,
      name: 'Ada',
      status: 'active' as const,
      deleted_at: null,
      org_unit_id: 4,
      cost_center: null,
    };
    const teamCtx = buildAllocationContext({
      allocations: [],
      lines: [],
      units: [
        { id: 1, level: 'entity', name: 'Bank', parent_id: null },
        { id: 2, level: 'department', name: 'Research', parent_id: 1 },
        { id: 4, level: 'team', name: 'Risk Arb', parent_id: 2 },
      ],
      employees: [ada],
      seats: [],
      relationships: [],
    });
    const withTeam = {
      ...data(),
      ...buildAllocationRollup({
        targetTotals: new Map([['user:9', 20]]),
        unitsById: teamCtx.unitsById,
        employeesById: teamCtx.employeesById,
        levelOrder: ['entity', 'department', 'team'],
        employees: [ada],
        budgetByKey: new Map(),
      }),
    };
    renderReport({ data: withTeam });

    fireEvent.click(screen.getByRole('radio', { name: 'Teams' }));
    const team = screen.getByText('Risk Arb').closest('tr') as HTMLElement;
    const amounts = within(team)
      .getAllByRole('cell')
      .slice(-3)
      .map((cell) => cell.textContent);

    // Direct, Rollup, Total: the team has no lines of its own, so the total
    // is entirely rolled up and the middle column has to say so.
    expect(amounts).toEqual(['$0', '$20', '$20']);
  });

  it('nests people under their unit as the bottom level, and lists them flat in the Users view', () => {
    renderReport();

    expandRow('Bank');
    const research = screen.getByText('Research').closest('tr') as HTMLElement;
    fireEvent.click(within(research).getByRole('button', { name: 'Expand' }));

    const amountsOf = (name: string) =>
      within(screen.getByText(name).closest('tr') as HTMLElement)
        .getAllByRole('cell')
        .slice(-3)
        .map((cell) => cell.textContent);

    // Ada's own line is her direct spend; Research already carried it as
    // rollup, so the department's figures are what they were.
    const ada = screen.getByText('Ada').closest('tr') as HTMLElement;
    expect(within(ada).getByText('User')).toBeTruthy();
    expect(amountsOf('Ada')).toEqual(['$20', '$0', '$20']);
    expect(amountsOf('Research')).toEqual(['$100', '$20', '$120']);

    fireEvent.click(screen.getByRole('radio', { name: 'Users' }));
    expect(screen.getByText('Ada').className).toContain('font-medium');
    expect(screen.queryByText('Bank')).toBeNull();
    // At the top of its own view a person carries no level tag.
    const adaRoot = screen.getByText('Ada').closest('tr') as HTMLElement;
    expect(within(adaRoot).queryByText('User')).toBeNull();
    // Drilled-in views list only what they place; the catch-alls belong to
    // the landing view.
    expect(screen.queryByText('Outside hierarchy')).toBeNull();
    expect(screen.queryByText('Unassigned')).toBeNull();
    expectRowsToMatchHeaders();
  });

  // Budgets are hidden in the product; these force them on so the surfaces
  // stay covered until the switch flips back.
  it('saves an inline budget edit and applies it without reloading the report', async () => {
    renderReport({ showBudgets: true });
    expandRow('Bank');

    const input = screen.getByLabelText(
      'Budget for Research',
    ) as HTMLInputElement;
    expect(input.value).toBe('1000');
    fireEvent.change(input, { target: { value: '2500' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(saveAllocationBudgetAction).toHaveBeenCalledWith({
        target: { kind: 'org_unit', id: 2 },
        fiscalYear: 2026,
        amount: 2500,
      }),
    );
    // The confirmed save updates the row, its ancestor's rolled-up budget,
    // and the Total Budget card from the client copy; the engine-backed rows
    // never reload.
    await waitFor(() => expect(input.value).toBe('2500'));
    expect(screen.getAllByText('$2,500').length).toBeGreaterThan(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('blocks further edits on the row while its save is pending', async () => {
    let settle!: (result: { success: boolean }) => void;
    saveAllocationBudgetAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    renderReport({ showBudgets: true });
    expandRow('Bank');

    const input = screen.getByLabelText(
      'Budget for Research',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2500' } });
    fireEvent.blur(input);

    expect(input.disabled).toBe(true);
    await act(async () => settle({ success: true }));
    await waitFor(() => expect(input.disabled).toBe(false));
    expect(input.value).toBe('2500');
  });

  it('does not save an unchanged budget, and a failed save keeps the draft and applies nothing', async () => {
    saveAllocationBudgetAction.mockRejectedValue(
      new Error('Only organization admins can edit budgets'),
    );
    renderReport({ showBudgets: true });
    expandRow('Bank');

    const input = screen.getByLabelText(
      'Budget for Research',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1000' } });
    fireEvent.blur(input);
    expect(saveAllocationBudgetAction).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '2500' } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(saveAllocationBudgetAction).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 2500 }),
      ),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      ),
    );
    // The rejected draft stays in the cell for correction; the report's
    // numbers never moved, so there is nothing to roll back.
    expect(input.value).toBe('2500');
    expect(screen.queryByText('$2,500')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not apply a save that lands after the window changed', async () => {
    let settle!: (result: { success: boolean }) => void;
    saveAllocationBudgetAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    const view = renderReport({ showBudgets: true });
    expandRow('Bank');

    const input = screen.getByLabelText(
      'Budget for Research',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2500' } });
    fireEvent.blur(input);

    // The user switches to another fiscal-year window; the server payload
    // for it carries a different budget on the same row key.
    const nextWindow = data({ fiscalYears: [2027], budgetFiscalYear: 2027 });
    nextWindow.rows['unit:2'] = {
      ...nextWindow.rows['unit:2'],
      budget: 4000,
    };
    view.rerender(
      <AllocationRollupReport
        data={nextWindow}
        canEdit
        showBudgets
        baseCurrency="USD"
        dateFormat="dd/MM/yyyy"
      />,
    );
    const nextInput = screen.getByLabelText(
      'Budget for Research',
    ) as HTMLInputElement;
    expect(nextInput.value).toBe('4000');

    await act(async () => settle({ success: true }));

    // The save belonged to the previous window's report; the new window's
    // rows must not absorb it.
    expect(nextInput.value).toBe('4000');
  });

  it('shows budgets read-only for viewers and when the window spans fiscal years', () => {
    const { unmount } = renderReport({ showBudgets: true, canEdit: false });
    expect(screen.queryByLabelText('Budget for Bank')).toBeNull();
    unmount();

    renderReport({
      showBudgets: true,
      data: data({ fiscalYears: [2025, 2026], budgetFiscalYear: null }),
    });
    expect(screen.queryByLabelText('Budget for Bank')).toBeNull();
  });

  it('keeps the gutter for top-level rows and puts a subrow expander inline', () => {
    const deepCtx = buildAllocationContext({
      allocations: [],
      lines: [],
      units: [
        { id: 1, level: 'entity', name: 'Bank', parent_id: null },
        { id: 2, level: 'division', name: 'Markets', parent_id: 1 },
        { id: 3, level: 'department', name: 'Research', parent_id: 2 },
      ],
      employees: [],
      seats: [],
      relationships: [],
    });
    renderReport({
      data: {
        ...data(),
        ...buildAllocationRollup({
          targetTotals: new Map([['unit:3', 100]]),
          unitsById: deepCtx.unitsById,
          employeesById: deepCtx.employeesById,
          levelOrder: ['entity', 'division', 'department'],
          employees: [],
          budgetByKey: new Map(),
        }),
      },
    });

    const cellsOf = (name: string) =>
      Array.from(
        (screen.getByText(name).closest('tr') as HTMLElement).querySelectorAll(
          'td',
        ),
      );

    // Top level: the control sits in the gutter column, never the name cell.
    const bankCells = cellsOf('Bank');
    expect(
      within(bankCells[0]).getByRole('button', { name: 'Expand' }),
    ).toBeTruthy();
    expect(within(bankCells[1]).queryByRole('button')).toBeNull();

    fireEvent.click(
      within(bankCells[0]).getByRole('button', { name: 'Expand' }),
    );

    // A subrow leaves the gutter empty and carries its control beside the name,
    // so it travels with the indent instead of detaching to the far left.
    // The top of the tree carries the weight; levels under it do not.
    expect(screen.getByText('Bank').className).toContain('font-medium');
    expect(screen.getByText('Markets').className).not.toContain('font-medium');

    const marketsCells = cellsOf('Markets');
    expect(within(marketsCells[0]).queryByRole('button')).toBeNull();
    const subExpander = within(marketsCells[1]).getByRole('button', {
      name: 'Expand',
    });
    expect(subExpander).toBeTruthy();

    // Rendered size, not just placement: the prop reaching the component is
    // not the same as the icon actually drawing smaller.
    const iconSize = (button: HTMLElement) =>
      button.querySelector('svg')?.getAttribute('width');
    expect(iconSize(subExpander)).toBe('18');
    expect(
      iconSize(within(bankCells[0]).getByRole('button', { name: 'Collapse' })),
    ).toBe('24');
  });

  it('expands from a click anywhere on an expandable row, and only those rows', () => {
    renderReport();

    const bank = screen.getByText('Bank').closest('tr') as HTMLElement;
    expect(bank.className).toContain('cursor-pointer');
    // A cell with no control of its own — the click has to come from the row.
    fireEvent.click(screen.getByText('Bank'));
    expect(screen.getByText('Research')).toBeTruthy();

    // Research opens onto its people the same way.
    fireEvent.click(screen.getByText('Research'));
    expect(screen.getByText('Ada')).toBeTruthy();

    // Ada is the leaf: no pointer affordance, and clicking is inert.
    const ada = screen.getByText('Ada').closest('tr') as HTMLElement;
    expect(ada.className).not.toContain('cursor-pointer');
    fireEvent.click(screen.getByText('Ada'));
    expect(screen.getByText('Ada')).toBeTruthy();

    // The control still collapses, and does not re-toggle via the row.
    fireEvent.click(within(bank).getByRole('button', { name: 'Collapse' }));
    expect(screen.queryByText('Research')).toBeNull();
  });

  it('leaves a selected slicer option alone on hover', () => {
    renderReport();

    const selected = screen
      .getAllByRole('radio')
      .find((item) => item.getAttribute('data-state') === 'on');
    expect(selected).toBeTruthy();

    // jsdom does not resolve the Tailwind cascade, so assert the shape that
    // caused the bug: an unscoped hover utility outranks data-[state=on] and
    // repaints the selected label. Every hover style must be state-scoped.
    const unscopedHover = (selected as HTMLElement).className
      .split(/\s+/)
      .filter((token) => token.startsWith('hover:'));
    expect(unscopedHover).toEqual([]);
  });

  it("seeds the typed dates from the window on show, in the user's format, and re-seeds when a preset replaces a custom range", () => {
    const custom = data({
      period: 'custom',
      window: { start: '2025-03-01', end: '2025-04-01' },
      custom: { from: '2025-03-01', to: '2025-03-31' },
    });
    const { rerender } = render(
      <AllocationRollupReport
        data={custom}
        canEdit
        baseCurrency="USD"
        dateFormat="dd/MM/yyyy"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Date range' }));
    expect((screen.getByLabelText(/From/) as HTMLInputElement).value).toBe(
      '01/03/2025',
    );

    // The server comes back on a preset: the fields now hold that preset's
    // own dates — a starting point to adjust from — not the range just left.
    rerender(
      <AllocationRollupReport
        data={data({ period: 'this-month', custom: null })}
        canEdit
        baseCurrency="USD"
        dateFormat="dd/MM/yyyy"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Date range' }));
    expect((screen.getByLabelText(/From/) as HTMLInputElement).value).toBe(
      '01/08/2026',
    );
    expect((screen.getByLabelText(/To/) as HTMLInputElement).value).toBe(
      '31/08/2026',
    );
  });

  it("applies a range typed in the user's format as ISO search params", () => {
    renderReport();

    fireEvent.click(screen.getByRole('button', { name: 'Date range' }));
    fireEvent.change(screen.getByLabelText(/From/), {
      target: { value: '10.03.2025' },
    });
    fireEvent.change(screen.getByLabelText(/To/), {
      target: { value: '15/03/2025' },
    });
    // A date in the wrong format is not a date; there is nothing to apply.
    expect(
      (screen.getByRole('button', { name: 'Apply range' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.change(screen.getByLabelText(/From/), {
      target: { value: '10/03/2025' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(push).toHaveBeenCalledWith(
      '/reports/allocation-rollup?period=custom&from=2025-03-10&to=2025-03-15',
    );
  });

  it('keeps the To calendar from picking a day before From', () => {
    renderReport();

    fireEvent.click(screen.getByRole('button', { name: 'Date range' }));
    fireEvent.change(screen.getByLabelText(/From/), {
      target: { value: '10/03/2025' },
    });
    fireEvent.change(screen.getByLabelText(/To/), {
      target: { value: '15/03/2025' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pick the to date' }));

    const grid = screen.getByRole('grid');
    const day = (label: string) =>
      within(grid).getByText(label).closest('button') as HTMLButtonElement;
    expect(day('7').disabled).toBe(true);
    expect(day('12').disabled).toBe(false);
  });

  it('tells same-named top-level rows apart by their parents, and only at the top', () => {
    const twinCtx = buildAllocationContext({
      allocations: [],
      lines: [],
      units: [
        { id: 1, level: 'entity', name: 'Bank', parent_id: null },
        { id: 2, level: 'entity', name: 'Trust', parent_id: null },
        { id: 3, level: 'department', name: 'Research', parent_id: 1 },
        { id: 4, level: 'department', name: 'Research', parent_id: 2 },
      ],
      employees: [],
      seats: [],
      relationships: [],
    });
    const twins = {
      ...data(),
      ...buildAllocationRollup({
        targetTotals: new Map([
          ['unit:3', 10],
          ['unit:4', 20],
        ]),
        unitsById: twinCtx.unitsById,
        employeesById: twinCtx.employeesById,
        levelOrder: ['entity', 'department'],
        employees: [],
        budgetByKey: new Map(),
      }),
    };
    renderReport({ data: twins });

    fireEvent.click(screen.getByRole('radio', { name: 'Departments' }));
    const researchRows = screen
      .getAllByText('Research')
      .map((name) => (name.closest('tr') as HTMLElement).textContent);
    expect(researchRows).toHaveLength(2);
    expect(researchRows[0]).toContain('· Bank');
    expect(researchRows[1]).toContain('· Trust');

    // Under its entity the parent is the row above, so no breadcrumb.
    fireEvent.click(screen.getByRole('radio', { name: 'Entities' }));
    const bank = screen.getByText('Bank').closest('tr') as HTMLElement;
    fireEvent.click(within(bank).getByRole('button', { name: 'Expand' }));
    expect(screen.getByText('Research')).toBeTruthy();
    expect(screen.queryByText('· Bank')).toBeNull();
  });

  it('renders a single level with nobody assigned as a flat list: no slicer, no rollup columns', () => {
    const flatCtx = buildAllocationContext({
      allocations: [],
      lines: [],
      units: [
        { id: 2, level: 'department', name: 'Research', parent_id: null },
      ],
      employees: [],
      seats: [],
      relationships: [],
    });
    const flat = {
      ...data(),
      ...buildAllocationRollup({
        targetTotals: new Map([['unit:2', 100]]),
        unitsById: flatCtx.unitsById,
        employeesById: flatCtx.employeesById,
        levelOrder: ['department'],
        employees: [],
        budgetByKey: new Map(),
      }),
    };
    renderReport({ data: flat });

    // No hierarchy at all: that single level is still the top one.
    expect(screen.getByText('Research').className).toContain('font-medium');
    expect(screen.queryByRole('group', { name: 'Level' })).toBeNull();
    expect(screen.queryByText('Rolled-up Budget')).toBeNull();
    expect(screen.queryByText('Direct Spend')).toBeNull();
    expect(screen.getByText('Spend')).toBeTruthy();
    expect(screen.getByText('Research')).toBeTruthy();
    expectRowsToMatchHeaders();
  });

  it('rejects a non-numeric budget draft locally and keeps it for correction', async () => {
    renderReport({ showBudgets: true });
    expandRow('Bank');

    const input = screen.getByLabelText(
      'Budget for Research',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1.2.3' } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Budget not saved' }),
      ),
    );
    expect(saveAllocationBudgetAction).not.toHaveBeenCalled();
    expect(input.value).toBe('1.2.3');
  });

  it('pushes the chosen preset to the URL', () => {
    renderReport();

    fireEvent.click(screen.getByRole('button', { name: 'Date range' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Last Month' }));

    expect(push).toHaveBeenCalledWith(
      '/reports/allocation-rollup?period=last-month',
    );
  });

  it('offers no reset on the default window', () => {
    renderReport({ data: data({ period: 'current-fy' }) });

    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('restores the default window in one click, from a preset or a typed range', () => {
    for (const report of [
      data({ period: 'this-month' }),
      data({
        period: 'custom',
        window: { start: '2025-03-01', end: '2025-04-01' },
        custom: { from: '2025-03-01', to: '2025-03-31' },
      }),
    ]) {
      const { unmount } = renderReport({ data: report });

      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

      // The bare pathname carries no period, from or to.
      expect(push).toHaveBeenCalledWith('/reports/allocation-rollup');
      push.mockClear();
      unmount();
    }
  });

  it('replaces the tree with a flat, tagged list of matches from every level', () => {
    renderReport();
    const input = screen.getByLabelText('Search levels and users');

    // Whitespace is not a query: the view is still the view.
    fireEvent.change(input, { target: { value: '  ' } });
    expect(screen.getByText('Outside hierarchy')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'a' } });

    // Name and level tag share the cell. Every match is tagged — including
    // Bank, which the Entities view leaves untagged — and the catch-alls are
    // gone, so this is the whole table.
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.querySelectorAll('td')[1].textContent),
    ).toEqual(['AdaUser', 'BankEntity', 'ResearchDepartment']);
    expect(screen.queryByRole('group', { name: 'Level' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand all' })).toBeNull();

    // A match carries no subtree, so the row is inert.
    fireEvent.change(input, { target: { value: 'bank' } });
    expect(screen.queryByText('Research')).toBeNull();
    fireEvent.click(screen.getByText('Bank'));
    expect(screen.queryByText('Research')).toBeNull();
  });

  it('comes back to the view that was open, still expanded where it was', () => {
    renderReport();
    fireEvent.click(screen.getByRole('radio', { name: 'Departments' }));
    expandRow('Research');
    expect(screen.getByText('Ada')).toBeTruthy();

    const input = screen.getByLabelText('Search levels and users');
    fireEvent.change(input, { target: { value: 'bank' } });
    expect(screen.getByText('Bank')).toBeTruthy();
    expect(screen.queryByText('Ada')).toBeNull();

    fireEvent.change(input, { target: { value: '' } });
    expect(
      screen
        .getByRole('radio', { name: 'Departments' })
        .getAttribute('data-state'),
    ).toBe('on');
    expect(screen.getByText('Research')).toBeTruthy();
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.queryByText('Outside hierarchy')).toBeNull();
  });

  it('says so when nothing matches', () => {
    renderReport();

    fireEvent.change(screen.getByLabelText('Search levels and users'), {
      target: { value: 'zzz' },
    });

    expect(screen.getByText('No matches')).toBeTruthy();
    expect(screen.queryByText('Bank')).toBeNull();
    expect(screen.queryByText('Unassigned')).toBeNull();
  });

  it('offers no filter pill, and no expander on a bucket with no list behind it', () => {
    renderReport();

    expect(screen.queryByRole('button', { name: /Unallocated/ })).toBeNull();

    // A bucket holding money is worth a look whether or not it can name the
    // contracts it came from, so the dot and the expander answer separately.
    const unassigned = screen
      .getByText('Unassigned')
      .closest('tr') as HTMLElement;
    expect(unassigned.className).not.toContain('cursor-pointer');
    expect(within(unassigned).queryByRole('button')).toBeNull();
    expect(
      within(unassigned).getByRole('img', { name: 'Needs attention' }),
    ).toBeTruthy();
  });

  it('reads as a normal row: medium name in the default colour, dot, and a gutter expander', () => {
    renderReport({ data: unallocatedData() });

    const label = screen.getByText('Unassigned');
    expect(label.className).toContain('font-medium');
    expect(label.className).toContain('text-foreground');
    expect(label.className).not.toContain('italic');

    const row = label.closest('tr') as HTMLElement;
    expect(row.className).not.toContain('text-muted-foreground');
    expect(within(row).getByRole('button', { name: 'Expand' })).toBeTruthy();
    expect(
      within(row).getByRole('img', { name: 'Needs attention' }),
    ).toBeTruthy();
  });

  it('expands the Unassigned row inline into contract-shaped rows', () => {
    renderReport({ data: unallocatedData() });

    fireEvent.click(
      screen.getByText('Unassigned').closest('tr') as HTMLElement,
    );

    const acme = screen.getByText('Acme').closest('tr') as HTMLElement;
    expect(within(acme).getByText('icon:Acme')).toBeTruthy();
    expect(screen.getByText('Acme').className).toContain('font-medium');
    // Lead product, then the count of the rest.
    expect(within(acme).getByText('Terminal')).toBeTruthy();
    expect(within(acme).getByText('+1')).toBeTruthy();

    // Vendorless rows fall back to the contract, and a contract the window's
    // spend never mentions shows a dash rather than a zero.
    const unnumbered = screen
      .getByText('MSA · ID 56')
      .closest('tr') as HTMLElement;
    expect(
      within(unnumbered).getAllByRole('cell').slice(-1)[0].textContent,
    ).toBe('—');

    // Inline, not instead of: the tree, its controls and the columns all stay.
    expect(screen.getByText('Bank')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Cost Centers' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeTruthy();
    expect(
      screen.getByRole('columnheader', { name: 'Direct Spend' }),
    ).toBeTruthy();
    expectRowsToMatchHeaders();

    fireEvent.click(
      screen.getByText('Unassigned').closest('tr') as HTMLElement,
    );
    expect(screen.queryByText('Acme')).toBeNull();
  });

  it('opens the allocation sheet on a contract row, by click or by keyboard', () => {
    renderReport({ data: unallocatedData() });
    fireEvent.click(
      screen.getByText('Unassigned').closest('tr') as HTMLElement,
    );

    fireEvent.click(screen.getByText('Acme').closest('tr') as HTMLElement);
    expect(screen.getByTestId('allocation-sheet')).toBeTruthy();
    expect(allocationSheetSubject).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 55,
        title: 'Terminal',
        vendor: 'Acme',
        vendorDomain: 'acme.com',
        // The contract as a whole, not its allocation tab.
        link: expect.objectContaining({ href: '/contracts/55' }),
        contextFields: expect.arrayContaining([
          { label: 'Term Start', value: '01/01/2026' },
          { label: 'Term End', value: '31/12/2026' },
        ]),
      }),
    );

    fireEvent.keyDown(
      screen.getByText('MSA · ID 56').closest('tr') as HTMLElement,
      { key: 'Enter' },
    );
    // No vendor and no product: the contract's own name carries the header.
    expect(allocationSheetSubject).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 56, title: 'MSA · ID 56', vendor: '' }),
    );
  });

  it('expands Outside hierarchy into the targets this view cannot place', () => {
    renderReport();

    const outside = screen
      .getByText('Outside hierarchy')
      .closest('tr') as HTMLElement;
    fireEvent.click(outside);

    // The entity view roots on Bank; the cost centre hangs off nothing, so its
    // $5 is the whole of the remainder.
    const cc = screen.getByText('CC-1').closest('tr') as HTMLElement;
    expect(within(cc).getAllByRole('cell').slice(-1)[0].textContent).toBe('$5');
    expectRowsToMatchHeaders();
  });

  it('shows both catch-alls on the landing view and on no other', () => {
    renderReport();

    expect(screen.getByText('Outside hierarchy')).toBeTruthy();
    expect(screen.getByText('Unassigned')).toBeTruthy();

    for (const label of ['Departments', 'Cost Centers', 'Users']) {
      fireEvent.click(screen.getByRole('radio', { name: label }));
      expect(screen.queryByText('Outside hierarchy')).toBeNull();
      expect(screen.queryByText('Unassigned')).toBeNull();
    }
  });

  it('keeps the spend headline the same on every view, as it always has', () => {
    renderReport();

    // Roots $120 + outside $5 + unassigned $7. The table changes per view;
    // this number does not, and Projected FY Spend is org-wide beside it.
    expect(screen.getByText('$132')).toBeTruthy();

    for (const label of ['Departments', 'Cost Centers', 'Users']) {
      fireEvent.click(screen.getByRole('radio', { name: label }));
      expect(screen.getByText('$132')).toBeTruthy();
    }
  });

  it('draws no change comparison on Projected FY Spend', () => {
    // Current is org-wide and projected is org-wide, but they answer different
    // questions; the arrow read as a like-for-like delta.
    renderReport({ data: data({ projected: 200 }) });

    expect(screen.getByText('Projected FY Spend')).toBeTruthy();
    expect(screen.getByText('$200')).toBeTruthy();
    expect(screen.queryByText('$68')).toBeNull();
  });

  it('hides an empty Outside hierarchy when cost centers are the landing view', () => {
    // An org with no tree at all lands on Cost Centers, which places
    // everything — so the bucket would render as a $0 row with nothing in it.
    const flatCtx = buildAllocationContext({
      allocations: [],
      lines: [],
      units: [{ id: 3, level: 'cost_center', name: 'CC-1', parent_id: null }],
      employees: [],
      seats: [],
      relationships: [],
    });
    renderReport({
      data: data(
        buildAllocationRollup({
          targetTotals: new Map([['unit:3', 5]]),
          unitsById: flatCtx.unitsById,
          employeesById: flatCtx.employeesById,
          levelOrder: [],
          employees: [],
          budgetByKey: new Map(),
        }),
      ),
    });

    expect(screen.getByText('CC-1')).toBeTruthy();
    expect(screen.queryByText('Outside hierarchy')).toBeNull();
  });

  it('describes the bucket in product words, not engine words', () => {
    renderReport();

    const outside = screen
      .getByText('Outside hierarchy')
      .closest('tr') as HTMLElement;
    expect(outside.textContent).toContain('Allocated outside any entity');
    expect(outside.textContent).not.toContain('Targets with');
    expect(outside.textContent).not.toContain('Lines on');
    expect(outside.textContent).not.toContain('org unit');
  });

  it('tags each expanded Outside hierarchy row with its target kind', () => {
    renderReport();

    fireEvent.click(
      screen.getByText('Outside hierarchy').closest('tr') as HTMLElement,
    );

    // The column header says "Entity", and the bucket mixes kinds, so the row
    // has to say what it actually is. (Ada rolls up to her entity, so the
    // cost centre is all this view cannot place; rollup-report-rows covers
    // the mixed case.)
    const cc = screen.getByText('CC-1').closest('tr') as HTMLElement;
    expect(within(cc).getByText('Cost Center')).toBeTruthy();
  });

  it('opens the Unassigned row when the dashboard links to it', () => {
    renderReport({ data: unallocatedData(), initialExpandUnassigned: true });

    expect(screen.getByText('Acme')).toBeTruthy();
    // Client state from here: closing it navigates nowhere.
    fireEvent.click(
      screen.getByText('Unassigned').closest('tr') as HTMLElement,
    );
    expect(screen.queryByText('Acme')).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it('opens both catch-alls with Expand all', () => {
    renderReport({ data: unallocatedData() });

    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('CC-1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByText('Acme')).toBeNull();
    expect(screen.queryByText('CC-1')).toBeNull();
  });

  it('shows the empty state when the org has no structure', () => {
    renderReport({ data: data({ rows: {}, views: [] }) });

    expect(screen.getByText('Settings › Employees')).toBeTruthy();
  });
});
