/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/components/ui/hover-card', () => {
  const react = require('react') as typeof React;
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    react.createElement('div', null, children);
  return {
    HoverCard: passthrough,
    HoverCardTrigger: passthrough,
    HoverCardContent: passthrough,
  };
});

import ContractReplacementIndicator from '@/components/contracts/ContractReplacementIndicator';
import { hasReplacementPrompt } from '@/lib/contracts/replacementPrompt';

const LABEL = 'Potential replacement detected';

describe('ContractReplacementIndicator', () => {
  it('renders an accessible hazard flag', () => {
    render(<ContractReplacementIndicator />);

    expect(screen.getByLabelText(LABEL)).toBeTruthy();
  });

  it('explains what the flag means on hover', () => {
    render(<ContractReplacementIndicator />);

    expect(
      screen.getByText(/potentially newer contract that may replace this one/),
    ).toBeTruthy();
  });
});

describe('hasReplacementPrompt', () => {
  // The vendor cell's gate: row ids are strings, the flagged batch is numeric.
  it('flags a row whose contract carries a verified prompt', () => {
    expect(hasReplacementPrompt('7', [7, 9])).toBe(true);
  });

  it('leaves an unflagged row clean', () => {
    expect(hasReplacementPrompt('8', [7, 9])).toBe(false);
  });

  it('returns false when no ids were resolved', () => {
    // The fetch failed, or nothing is verified — either way the list is clean.
    expect(hasReplacementPrompt('7', [])).toBe(false);
  });

  it('returns false when meta carries no flag list at all', () => {
    // Tables that never opted in (reports, dashboards) must be unchanged.
    expect(hasReplacementPrompt('7', undefined)).toBe(false);
  });

  it('does not flag a vendor-group row whose id is not a contract id', () => {
    // Group rows carry ids like "vendor-3"; Number() makes those NaN.
    expect(hasReplacementPrompt('vendor-7', [7])).toBe(false);
  });
});
