/**
 * @jest-environment jsdom
 */
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const replace = jest.fn();
const push = jest.fn();
// Stands in for the app router having picked the history write up. Left null,
// it follows the url the way a synced router does.
let mockStaleSearchParams: URLSearchParams | null = null;
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () =>
    mockStaleSearchParams ?? new URLSearchParams(window.location.search),
}));

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }));

import TabComponent from '@/app/ui/Tab';

const tab = (key: string) => ({ key, label: key, content: <div>{key}</div> });

describe('TabComponent url state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStaleSearchParams = null;
    window.history.replaceState({}, '', '/contracts/7?view=details');
  });

  it('writes the tab param with the History API, not a router navigation', () => {
    const replaceState = jest.spyOn(window.history, 'replaceState');

    render(
      <TabComponent
        tabs={[tab('details'), tab('owner')]}
        useUrlState
        urlParamName="view"
      />,
    );

    // Radix activates on mousedown; setting the value programmatically would
    // bypass the trigger entirely.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'owner' }));

    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(String(replaceState.mock.calls[0][2])).toContain('?view=owner');
    expect(window.location.pathname + window.location.search).toBe(
      '/contracts/7?view=owner',
    );
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByRole('tab', { name: 'owner' }).getAttribute('aria-selected'),
    ).toBe('true');

    replaceState.mockRestore();
  });

  it('keeps the fragment when switching tabs', () => {
    window.history.replaceState({}, '', '/contracts/7?view=details#notes');

    render(
      <TabComponent
        tabs={[tab('details'), tab('owner')]}
        useUrlState
        urlParamName="view"
      />,
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'owner' }));

    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe('/contracts/7?view=owner#notes');
  });

  it('writes a history state the app router will sync from', () => {
    // Next skips its useSearchParams sync when the payload already carries
    // its own internals, which strands the hook on the entry param.
    window.history.replaceState(
      { __NA: true },
      '',
      '/contracts/7?view=details',
    );
    const replaceState = jest.spyOn(window.history, 'replaceState');

    render(
      <TabComponent
        tabs={[tab('details'), tab('owner')]}
        useUrlState
        urlParamName="view"
      />,
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'owner' }));

    expect(replaceState.mock.calls[0][0]).toBeNull();

    replaceState.mockRestore();
  });

  it('keeps a clicked tab while the router still reports the entry param', () => {
    window.history.replaceState({}, '', '/contracts/7?view=cost-allocation');
    mockStaleSearchParams = new URLSearchParams('view=cost-allocation');

    function ContractDetail() {
      const [view, setView] = useState('cost-allocation');
      return (
        <>
          <span data-testid="view">{view}</span>
          {/* A fresh array per render, as the contract page builds it. */}
          <TabComponent
            tabs={[tab('cost-allocation'), tab('owner')]}
            defaultTab="cost-allocation"
            onViewChange={setView}
            useUrlState
            urlParamName="view"
          />
        </>
      );
    }

    render(<ContractDetail />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'owner' }));

    expect(
      screen.getByRole('tab', { name: 'owner' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByTestId('view').textContent).toBe('owner');
  });

  it('leaves the url alone when the tab is not url-backed', () => {
    const replaceState = jest.spyOn(window.history, 'replaceState');

    render(<TabComponent tabs={[tab('details'), tab('owner')]} />);

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'owner' }));

    expect(replaceState).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    replaceState.mockRestore();
  });
});
