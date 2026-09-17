/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
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

// MSA 100 ─ SO 101 ─ INV 103 (current), with an archived SO 102 subtree so the
// "Show archived" toggle is live and its count can be asserted stable.
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
  ],
};

const localIds = [
  { id: 100, localId: 'MSA', isArchived: false },
  { id: 101, localId: 'SO-1', isArchived: false },
  { id: 102, localId: 'SO-2', isArchived: true },
  { id: 103, localId: 'INV-1', isArchived: false },
  { id: 104, localId: 'INV-2', isArchived: true },
];

const billingParent = {
  id: 20,
  typeName: 'Service Order',
  productNames: ['Analytics Platform', 'Support'],
  isArchived: false,
};

const renderSidebar = (
  billingParents?: Array<typeof billingParent>,
): ReturnType<typeof render> =>
  render(
    <ContractSidebar
      completeHierarchy={hierarchy}
      currentContract={{ id: 103 }}
      allContractsWithLocalIds={localIds}
      billingParents={billingParents}
    />,
  );

/** The sidebar's HTML with the billing section (if any) cut out. */
function htmlWithoutBillingSection(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelector('[data-testid="billing-parents"]')?.remove();
  return clone.innerHTML;
}

describe('ContractSidebar billing parents section', () => {
  it('lists each billing parent as a link below the tree', () => {
    renderSidebar([billingParent]);

    expect(screen.getByText('Also billed under')).not.toBeNull();
    const row = screen.getByText('Analytics Platform').closest('a');
    expect(row?.getAttribute('href')).toBe('/contracts/20');
    // Second product rides along as a "+N" chip, like tree rows.
    expect(screen.getByText('+1')).not.toBeNull();
  });

  it('omits the section entirely when there are no billing parents', () => {
    const { container } = renderSidebar([]);

    expect(screen.queryByText('Also billed under')).toBeNull();
    expect(
      container.querySelector('[data-testid="billing-parents"]'),
    ).toBeNull();
  });

  it('omits the section when the prop is not passed at all', () => {
    render(
      <ContractSidebar
        completeHierarchy={hierarchy}
        currentContract={{ id: 103 }}
        allContractsWithLocalIds={localIds}
      />,
    );

    expect(screen.queryByText('Also billed under')).toBeNull();
  });

  it('dims an archived billing parent instead of hiding it', () => {
    renderSidebar([
      { ...billingParent, isArchived: true, productNames: ['Old Platform'] },
    ]);

    const row = screen.getByText('Old Platform').closest('a');
    expect(row?.className).toContain('opacity-60');
  });

  it('falls back to the type name when the parent has no products', () => {
    renderSidebar([{ ...billingParent, productNames: [] }]);

    const section = screen
      .getByText('Also billed under')
      .closest('[data-testid="billing-parents"]');
    expect(section?.textContent).toContain('Service Order');
  });

  it('leaves the tree byte-identical with and without billing parents', () => {
    // The regression that matters: the new section must not perturb the
    // hierarchy render, the rail geometry, or the archived fold-away.
    const bare = renderSidebar();
    const withParents = renderSidebar([
      billingParent,
      { ...billingParent, id: 21, isArchived: true },
    ]);

    expect(htmlWithoutBillingSection(withParents.container)).toBe(
      bare.container.innerHTML,
    );
  });

  it('keeps billing rows out of the rail-trim measurement', () => {
    // ChildrenContainer trims the vertical rail by measuring elements with
    // data-contract-depth; a billing row carrying it would corrupt the trim.
    const { container } = renderSidebar([billingParent]);

    const section = container.querySelector('[data-testid="billing-parents"]');
    expect(section?.querySelector('[data-contract-depth]')).toBeNull();
  });

  it('shows the tree when billing parents are the only related contracts', () => {
    // An invoice with no hierarchy relatives but an additional payer must not
    // say "No related contracts" above its "Also billed under" section.
    render(
      <ContractSidebar
        completeHierarchy={{
          id: 45,
          contract_types: contractType(6, 'Invoice'),
        }}
        currentContract={{ id: 45 }}
        allContractsWithLocalIds={[{ id: 45, localId: 'INV' }]}
        billingParents={[billingParent]}
      />,
    );

    expect(screen.queryByText('No related contracts')).toBeNull();
    expect(screen.getByText('Also billed under')).not.toBeNull();
  });

  it('does not count an archived billing parent in the archived toggle', () => {
    renderSidebar([{ ...billingParent, isArchived: true }]);

    // Two archived tree rows (SO-2, INV-2); the billing parent must not
    // become a third.
    const toggle = screen.getByRole('button', {
      name: 'Show archived contracts',
    });
    expect(toggle.textContent).toBe('Show archived2');
  });
});
