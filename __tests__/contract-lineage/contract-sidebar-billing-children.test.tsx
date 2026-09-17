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

const billedInvoice = {
  id: 45,
  typeName: 'Invoice',
  productNames: ['Custom Index', 'Support'],
  isArchived: false,
};

const renderSidebar = (
  billingChildrenByParent?: Record<
    string | number,
    Array<typeof billedInvoice>
  >,
): ReturnType<typeof render> =>
  render(
    <ContractSidebar
      completeHierarchy={hierarchy}
      currentContract={{ id: 103 }}
      allContractsWithLocalIds={localIds}
      billingChildrenByParent={billingChildrenByParent}
    />,
  );

describe('ContractSidebar billing children rows', () => {
  it('renders a billing child as a leaf row under its billing parent', () => {
    renderSidebar({ 101: [billedInvoice] });

    const row = screen.getByText('Custom Index').closest('a');
    expect(row?.getAttribute('href')).toBe('/contracts/45');
    // Second product rides along as a "+N" chip, like any tree row.
    expect(row?.textContent).toContain('+1');
  });

  it('renders billing children of nested tree contracts, not only the root', () => {
    renderSidebar({ 103: [{ ...billedInvoice, id: 46 }] });

    const row = screen.getByText('Custom Index').closest('a');
    expect(row?.getAttribute('href')).toBe('/contracts/46');
  });

  it('participates in the rail-trim measurement like a real child row', () => {
    // Billing rows live INSIDE the parent's ChildrenContainer, so unlike the
    // flat billing-parents section they must carry data-contract-depth.
    renderSidebar({ 101: [billedInvoice] });

    const row = screen.getByText('Custom Index').closest('a');
    expect(row?.closest('[data-contract-depth]')).not.toBeNull();
  });

  it('leaves the tree byte-identical when the prop is empty or absent', () => {
    const bare = renderSidebar();
    const withEmpty = renderSidebar({});

    expect(withEmpty.container.innerHTML).toBe(bare.container.innerHTML);
  });

  it('shows both occurrences when an invoice is also a structural node in the tree', () => {
    // Shared-tree duplicate case (user decision: show both): invoice 103 sits
    // structurally under SO 101 and is also billed under MSA 100.
    renderSidebar({
      100: [{ ...billedInvoice, id: 103, productNames: ['Custom Index'] }],
    });

    const links = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/contracts/103');
    expect(links).toHaveLength(2);
  });

  it('dims an archived billing child instead of hiding it', () => {
    renderSidebar({
      101: [{ ...billedInvoice, isArchived: true, productNames: ['Old Feed'] }],
    });

    const row = screen.getByText('Old Feed').closest('a');
    expect(row?.className).toContain('opacity-60');
  });

  it('does not count an archived billing child in the archived toggle', () => {
    renderSidebar({ 101: [{ ...billedInvoice, isArchived: true }] });

    // Two archived tree rows (SO-2, INV-2); the billing child must not
    // become a third.
    const toggle = screen.getByRole('button', {
      name: 'Show archived contracts',
    });
    expect(toggle.textContent).toBe('Show archived2');
  });

  it('falls back to the type name when the invoice has no products', () => {
    renderSidebar({ 101: [{ ...billedInvoice, productNames: [] }] });

    const row = screen
      .getAllByText('Invoice')
      .map((el) => el.closest('a'))
      .find((a) => a?.getAttribute('href') === '/contracts/45');
    expect(row).not.toBeUndefined();
  });

  it('shows the tree when billing children are the only related contracts', () => {
    render(
      <ContractSidebar
        completeHierarchy={{
          id: 40,
          contract_types: contractType(2, 'Service Order'),
        }}
        currentContract={{ id: 40 }}
        allContractsWithLocalIds={[{ id: 40, localId: 'SO' }]}
        billingChildrenByParent={{ 40: [billedInvoice] }}
      />,
    );

    expect(screen.queryByText('No related contracts')).toBeNull();
    const row = screen.getByText('Custom Index').closest('a');
    expect(row?.getAttribute('href')).toBe('/contracts/45');
  });
});
