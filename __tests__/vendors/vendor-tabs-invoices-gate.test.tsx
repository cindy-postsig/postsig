/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { VendorTabs } from '@/components/vendors/VendorTabs';

const renderTabs = (props: Partial<Parameters<typeof VendorTabs>[0]> = {}) =>
  render(
    <NuqsTestingAdapter>
      <VendorTabs
        products={<div>products content</div>}
        productCount={1}
        contracts={<div>contracts content</div>}
        contractCount={2}
        profile={<div>profile content</div>}
        {...props}
      />
    </NuqsTestingAdapter>,
  );

describe('VendorTabs Invoices gate', () => {
  it('omits the Invoices tab entirely when the invoices prop is not passed', () => {
    renderTabs();

    expect(screen.queryByRole('tab', { name: /Invoices/ })).toBeNull();
  });

  it('shows the Invoices tab and count when invoices content is provided', () => {
    renderTabs({
      invoices: <div>invoices content</div>,
      invoiceCount: 5,
    });

    expect(screen.getByRole('tab', { name: 'Invoices (5)' })).not.toBeNull();
  });

  it('defaults the count to 0 if invoices content is passed without a count', () => {
    renderTabs({ invoices: <div>invoices content</div> });

    expect(screen.getByRole('tab', { name: 'Invoices (0)' })).not.toBeNull();
  });
});
