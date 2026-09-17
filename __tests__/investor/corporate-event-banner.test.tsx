/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { InvCorporateEventSummary } from '@/lib/v2/inv/types';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CorporateEventBanner } from '@/app/(app)/(investor)/investor/company/[id]/CorporateEventBanner';

const TODAY = '2026-09-16';

const valera = {
  companyId: 2,
  publicId: 'valera-pub',
  name: 'Valera Health',
  role: 'successor' as const,
  costAllocationRatio: 1,
};

const vytyl = {
  companyId: 1,
  publicId: 'vytyl-pub',
  name: 'Vytyl Health Management',
  role: 'predecessor' as const,
  costAllocationRatio: null,
};

describe('CorporateEventBanner', () => {
  it('renders nothing without events', () => {
    const { container } = render(<CorporateEventBanner today={TODAY} />);
    expect(container).toBeEmptyDOMElement();

    const empty = render(<CorporateEventBanner events={[]} today={TODAY} />);
    expect(empty.container).toBeEmptyDOMElement();
  });

  it('tells a predecessor what it merged into and links the successor', () => {
    const events: InvCorporateEventSummary[] = [
      {
        id: 10,
        eventType: 'merger',
        eventDate: '2025-05-16',
        role: 'predecessor',
        counterparts: [valera],
      },
    ];
    render(<CorporateEventBanner events={events} today={TODAY} />);

    const line = screen.getByText(/Merged into/);
    expect(line).toHaveTextContent('Merged into Valera Health on 2025-05-16');
    expect(line).not.toHaveTextContent('effective');
    expect(screen.getByRole('link', { name: 'Valera Health' })).toHaveAttribute(
      'href',
      '/investor/company/valera-pub',
    );
  });

  it('uses the verb of the event type', () => {
    const events: InvCorporateEventSummary[] = [
      {
        id: 11,
        eventType: 'acquisition',
        eventDate: '2025-05-16',
        role: 'predecessor',
        counterparts: [valera],
      },
      {
        id: 12,
        eventType: 'spin_off',
        eventDate: '2024-01-02',
        role: 'predecessor',
        counterparts: [valera],
      },
    ];
    render(<CorporateEventBanner events={events} today={TODAY} />);

    expect(screen.getByText(/Acquired by/)).toBeInTheDocument();
    expect(screen.getByText(/Spun off into/)).toBeInTheDocument();
  });

  it('tells a successor which predecessors it continues', () => {
    const events: InvCorporateEventSummary[] = [
      {
        id: 13,
        eventType: 'merger',
        eventDate: '2025-05-16',
        role: 'successor',
        counterparts: [vytyl],
      },
    ];
    render(<CorporateEventBanner events={events} today={TODAY} />);

    expect(screen.getByText(/Successor of/)).toHaveTextContent(
      'Successor of Vytyl Health Management (2025-05-16)',
    );
    expect(
      screen.getByRole('link', { name: 'Vytyl Health Management' }),
    ).toHaveAttribute('href', '/investor/company/vytyl-pub');
  });

  it('marks a future-dated event as not yet effective', () => {
    const events: InvCorporateEventSummary[] = [
      {
        id: 14,
        eventType: 'merger',
        eventDate: '2027-01-31',
        role: 'predecessor',
        counterparts: [valera],
      },
    ];
    render(<CorporateEventBanner events={events} today={TODAY} />);

    const line = screen.getByText(/Merged into/);
    expect(line).toHaveTextContent(
      'Merged into Valera Health (effective 2027-01-31)',
    );
    expect(line).not.toHaveTextContent(' on 2027-01-31');
  });
});
