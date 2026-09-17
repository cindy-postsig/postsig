/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ExportCSVButton from '@/components/contracts/ExportCSVButton';

jest.mock('@/hooks/useCanExportCsv', () => ({
  useCanExportCsv: jest.fn(),
}));
jest.mock('@/app/lib/actions/contract', () => ({ exportCSV: jest.fn() }));
jest.mock('@/app/lib/utils', () => ({ handleDownload: jest.fn() }));
jest.mock('@/utils/audit-export', () => ({ logExportBeacon: jest.fn() }));

import { useCanExportCsv } from '@/hooks/useCanExportCsv';

const mockUseCanExportCsv = useCanExportCsv as jest.Mock;

describe('ExportCSVButton gating', () => {
  afterEach(() => jest.clearAllMocks());

  it('renders nothing when cpm export is not allowed', () => {
    mockUseCanExportCsv.mockReturnValue(false);

    const { container } = render(<ExportCSVButton label="Export" />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
  });

  it('renders the button when cpm export is allowed', () => {
    mockUseCanExportCsv.mockReturnValue(true);

    render(<ExportCSVButton label="Export" />);

    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeNull();
  });

  it('gates on the cpm module', () => {
    mockUseCanExportCsv.mockReturnValue(true);

    render(<ExportCSVButton label="Export" />);

    expect(mockUseCanExportCsv).toHaveBeenCalledWith('cpm');
  });
});
