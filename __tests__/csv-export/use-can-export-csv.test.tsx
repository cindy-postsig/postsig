/**
 * @jest-environment jsdom
 */
import React from 'react';
import { renderHook } from '@testing-library/react';
import { UserContext } from '@/app/userProvider';
import { useCanExportCsv } from '@/hooks/useCanExportCsv';
import type { UserMetadata } from '@/constants/types';

function wrapperFor(meta: Partial<UserMetadata> | null) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <UserContext.Provider
        value={{
          userLoaded: true,
          user: null,
          signOut: async () => {},
          userMetadata: meta as UserMetadata | null,
        }}
      >
        {children}
      </UserContext.Provider>
    );
  };
}

function renderGate(
  module: 'cpm' | 'investor',
  meta: Partial<UserMetadata> | null,
) {
  return renderHook(() => useCanExportCsv(module), {
    wrapper: wrapperFor(meta),
  }).result.current;
}

describe('useCanExportCsv', () => {
  it('hides cpm export by default and reveals it when the toggle is on', () => {
    expect(renderGate('cpm', { cpmCsvExportEnabled: false })).toBe(false);
    expect(renderGate('cpm', { cpmCsvExportEnabled: true })).toBe(true);
  });

  it('hides investor export by default and reveals it when the toggle is on', () => {
    expect(renderGate('investor', { investorCsvExportEnabled: false })).toBe(
      false,
    );
    expect(renderGate('investor', { investorCsvExportEnabled: true })).toBe(
      true,
    );
  });

  it('returns false when there is no user metadata', () => {
    expect(renderGate('cpm', null)).toBe(false);
  });
});
