/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ContractSidebar from '@/components/contracts/ContractSidebar';

/**
 * An invoice is never itself cancelled — only the service order or agreement
 * commanding it is. So an invoice row in the hierarchy renders its product as
 * plain text even when a later addendum cancelled that product, while a
 * service order carrying the same product still renders it struck. That keeps
 * the cancellation visible where it actually applies.
 */

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

const CANCELLED_PRODUCT_ID = 55;

const productDetails = (name: string) => [
  {
    product_id: CANCELLED_PRODUCT_ID,
    vendor_products: { id: CANCELLED_PRODUCT_ID, name },
  },
];

// SO 101 and INV 103 both carry the cancelled product 55.
const hierarchy = {
  id: 100,
  contract_types: { id: 1, name: 'Master Services Agreement' },
  children: [
    {
      id: 101,
      contract_types: { id: 2, name: 'Service Order' },
      vendor_products_details: productDetails('Seat Add-on (SO)'),
      children: [
        {
          id: 103,
          contract_types: { id: 6, name: 'Invoice' },
          vendor_products_details: productDetails('Seat Add-on (INV)'),
        },
      ],
    },
  ],
};

const localIds = [
  { id: 100, localId: 'MSA', isArchived: false },
  { id: 101, localId: 'SO-1', isArchived: false },
  { id: 103, localId: 'INV-1', isArchived: false },
];

const renderSidebar = (removedByContract: Record<number, number[]>) =>
  render(
    <ContractSidebar
      completeHierarchy={hierarchy}
      currentContract={{ id: 103 }}
      allContractsWithLocalIds={localIds}
      removedProductsByContract={removedByContract}
    />,
  );

/** The product label's own element, which carries the strike classes. */
const classesFor = (label: string): string =>
  screen.getByText(label).getAttribute('class') ?? '';

describe('ContractSidebar — invoices exempt from cancellation strikes', () => {
  const bothCancelled = {
    101: [CANCELLED_PRODUCT_ID],
    103: [CANCELLED_PRODUCT_ID],
  };

  it('renders an invoice row plain even when its product is cancelled', () => {
    renderSidebar(bothCancelled);

    expect(classesFor('Seat Add-on (INV)')).not.toContain('line-through');
  });

  it('still strikes the service order carrying the same cancelled product', () => {
    renderSidebar(bothCancelled);

    expect(classesFor('Seat Add-on (SO)')).toContain('line-through');
  });

  it('leaves both rows plain when nothing is cancelled', () => {
    renderSidebar({});

    expect(classesFor('Seat Add-on (INV)')).not.toContain('line-through');
    expect(classesFor('Seat Add-on (SO)')).not.toContain('line-through');
  });
});
