/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ExportReportCSVButton from '@/components/contracts/ExportReportCSVButton';

jest.mock('@/hooks/useCanExportCsv', () => ({
  useCanExportCsv: () => true,
}));
jest.mock('@/app/lib/utils', () => ({ handleDownload: jest.fn() }));
jest.mock('@/app/userProvider', () => ({
  UserContext: React.createContext(null),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// Regression for psk-1753: selecting a renewals export option opens the
// loading Dialog while the DropdownMenu is still open. Radix FocusScope
// coordinates trapped scopes through module-level state, so if two copies of
// @radix-ui/react-focus-scope are installed the menu and the dialog fight over
// focus in an infinite loop and the page hangs. The exact-version override in
// package.json keeps it deduped; this test fails if that regresses.
describe('ExportReportCSVButton renewals export', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    document.body.style.pointerEvents = '';
  });

  it('keeps the page interactive after an export completes', async () => {
    const response = deferred<Response>();
    global.fetch = jest.fn(() => response.promise) as unknown as typeof fetch;

    render(
      <ExportReportCSVButton
        reportTitle="renewals"
        variant="renewals"
        renewalOptions={[
          {
            label: 'All Renewals',
            contractIds: [1, 2],
            reportType: 'all-renewals',
            fileName: 'all-renewals-report.csv',
          },
        ]}
      />,
    );

    const trigger = screen.getByRole('button', { name: /export/i });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'All Renewals' }),
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      response.resolve({
        ok: true,
        blob: async () => new Blob(['a,b']),
      } as unknown as Response);
      await response.promise;
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.body.style.pointerEvents).toBe('');
  });
});
