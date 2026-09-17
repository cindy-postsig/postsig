/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ContractSidebar from '@/components/contracts/ContractSidebar';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// The sidebar's rail-trim effect observes its container; jsdom has no
// ResizeObserver, and the measurements it feeds are purely cosmetic here.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const contractType = (id: number, name: string) => ({ id, name });

// MSA 100 — archived SO 102 deliberately comes FIRST in the tree so the
// archived-last ordering has to move it.
//  ├ SO 102 (archived) ─ INV 104 (archived)   <- fully archived subtree
//  ├ SO 101 (active)   ─ INV 103 (active)
//  └ SO 105 (archived) ─ INV 106 (active)     <- must stay visible
const hierarchy = {
  id: 100,
  contract_types: contractType(1, 'Master Services Agreement'),
  children: [
    {
      id: 102,
      contract_types: contractType(2, 'Service Order'),
      children: [{ id: 104, contract_types: contractType(6, 'Invoice') }],
    },
    {
      id: 101,
      contract_types: contractType(2, 'Service Order'),
      children: [{ id: 103, contract_types: contractType(6, 'Invoice') }],
    },
    {
      id: 105,
      contract_types: contractType(2, 'Service Order'),
      children: [{ id: 106, contract_types: contractType(6, 'Invoice') }],
    },
  ],
};

const localIds = [
  { id: 100, localId: 'MSA', isArchived: false },
  { id: 101, localId: 'SO-1', isArchived: false },
  { id: 102, localId: 'SO-2', isArchived: true },
  { id: 103, localId: 'INV-1', isArchived: false },
  { id: 104, localId: 'INV-2', isArchived: true },
  { id: 105, localId: 'SO-3', isArchived: true },
  { id: 106, localId: 'INV-3', isArchived: false },
];

const renderSidebar = (currentContractId = 101) =>
  render(
    <ContractSidebar
      completeHierarchy={hierarchy}
      currentContract={{ id: currentContractId }}
      allContractsWithLocalIds={localIds}
    />,
  );

/** Rendered local-id badges, in document order. */
const visibleLocalIds = () =>
  localIds
    .map((c) => ({ localId: c.localId, el: screen.queryByText(c.localId) }))
    .filter(
      (entry): entry is { localId: string; el: HTMLElement } =>
        entry.el !== null,
    )
    .sort((a, b) =>
      a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1,
    )
    .map((entry) => entry.localId);

describe('ContractSidebar archived handling', () => {
  it('labels the toggle visibly and for screen readers in both states', () => {
    renderSidebar();

    const toggle = screen.getByRole('button', {
      name: 'Show archived contracts',
    });
    // Visible label, then the suppressed-row count in its badge.
    expect(toggle.textContent).toBe('Show archived2');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);

    const collapse = screen.getByRole('button', {
      name: 'Hide archived contracts',
    });
    expect(collapse.textContent).toBe('Hide archived2');
    expect(collapse.getAttribute('aria-expanded')).toBe('true');
  });

  it('hides fully archived subtrees behind the toggle', () => {
    renderSidebar();

    // SO-2 / INV-2 are wholly archived, so they fold away.
    expect(screen.queryByText('SO-2')).toBeNull();
    expect(screen.queryByText('INV-2')).toBeNull();
    const toggle = screen.getByRole('button', { name: /Show archived/ });
    // The count of suppressed rows rides along in a badge.
    expect(within(toggle).queryByText('2')).not.toBeNull();
  });

  it('keeps an archived contract visible when a descendant is still active', () => {
    renderSidebar();

    // SO-3 is archived but INV-3 under it is not, so both stay in the tree.
    expect(screen.queryByText('SO-3')).not.toBeNull();
    expect(screen.queryByText('INV-3')).not.toBeNull();
  });

  it('marks visible archived rows with an Archived badge', () => {
    renderSidebar();

    const archivedBadges = screen.getAllByText('Archived');
    expect(archivedBadges).toHaveLength(1);

    const row = archivedBadges[0].closest('a');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText('SO-3')).not.toBeNull();
  });

  it('sorts archived siblings after active ones', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: /Show archived/ }));

    // Active SO-1 (and its invoice) come before the archived service orders.
    expect(visibleLocalIds()).toEqual([
      'MSA',
      'SO-1',
      'INV-1',
      'SO-2',
      'INV-2',
      'SO-3',
      'INV-3',
    ]);
  });

  it('reveals and re-hides archived rows via the toggle', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: /Show archived/ }));
    expect(screen.queryByText('SO-2')).not.toBeNull();
    expect(screen.queryByText('INV-2')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Hide archived/ }));
    expect(screen.queryByText('SO-2')).toBeNull();
  });

  it('always shows the contract being viewed even when archived', () => {
    renderSidebar(104);

    // 104 sits in an otherwise-hidden archived subtree; its path stays visible
    // and nothing is left to hide, so the toggle disappears.
    expect(screen.queryByText('SO-2')).not.toBeNull();
    expect(screen.queryByText('INV-2')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /archived/i })).toBeNull();
  });

  it('omits the toggle when nothing is hidden', () => {
    render(
      <ContractSidebar
        completeHierarchy={hierarchy}
        currentContract={{ id: 101 }}
        allContractsWithLocalIds={localIds.map((c) => ({
          ...c,
          isArchived: false,
        }))}
      />,
    );

    expect(screen.queryByRole('button', { name: /archived/i })).toBeNull();
    expect(screen.queryAllByText('Archived')).toHaveLength(0);
  });
});

describe('ContractSidebar TOS grouping', () => {
  const tosHierarchy = {
    id: 200,
    contract_types: contractType(1, 'Master Services Agreement'),
    children: [
      {
        id: 201,
        contract_types: contractType(6, 'Invoice'),
        tos_urls: [
          'https://example.com/tos-a',
          'https://example.com/tos-b',
          'https://example.com/tos-c',
        ],
      },
    ],
  };

  const renderTosSidebar = () =>
    render(
      <ContractSidebar
        completeHierarchy={tosHierarchy}
        currentContract={{ id: 201 }}
        allContractsWithLocalIds={[
          { id: 200, localId: 'MSA', isArchived: false },
          { id: 201, localId: 'INV-1', isArchived: false },
        ]}
      />,
    );

  it('collapses a contract TOS links into a single counted row', () => {
    renderTosSidebar();

    expect(
      screen.getByRole('button', { name: /Terms of Service \(3\)/ }),
    ).not.toBeNull();
    expect(screen.queryByText('TOS-1')).toBeNull();
    expect(screen.queryByText('TOS-3')).toBeNull();
  });

  it('expands to the individual TOS links on click', () => {
    renderTosSidebar();

    fireEvent.click(
      screen.getByRole('button', { name: /Terms of Service \(3\)/ }),
    );

    expect(screen.queryByText('TOS-1')).not.toBeNull();
    expect(screen.queryByText('TOS-2')).not.toBeNull();
    expect(screen.queryByText('TOS-3')).not.toBeNull();

    const links = screen
      .getAllByRole('link')
      .map((el) => el.getAttribute('href'));
    expect(links).toContain('https://example.com/tos-a');
    expect(links).toContain('https://example.com/tos-c');
  });
});
