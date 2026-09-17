/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

import { ArchivesTable } from '../ArchivesTable';
import type { ModuleArchiveRow } from '@/app/api/v2/types/api';

jest.mock('@/hooks/useDateFormat', () => ({
  useDateFormat: () => ({ dateFormat: 'MM/dd/yyyy' }),
}));

const archive: ModuleArchiveRow = {
  id: '1',
  publicId: 'arch_1',
  fileName: 'portfolio-export.zip',
  filePath: 'org-1/archives/portfolio-export.zip',
  fileSize: 2048,
  fileType: 'application/zip',
  source: 'investor_upload',
  uploadedBy: 'Sam Rivera',
  uploadedAt: '2026-09-15T10:00:00.000Z',
};

describe('ArchivesTable', () => {
  it('lists an archive without offering a download', () => {
    render(<ArchivesTable archives={[archive]} />);

    expect(screen.getByText('portfolio-export.zip')).toBeTruthy();
    // Archive downloads are intentionally unavailable: the stored archive is
    // unvalidated input, and nothing yet records whether its contents passed
    // extraction.
    expect(screen.queryByLabelText('Download archive')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('spans the empty state across every column', () => {
    render(<ArchivesTable archives={[]} />);

    const emptyCell = screen.getByText('No archives uploaded yet.');
    const headers = screen.getAllByRole('columnheader');

    expect(emptyCell.getAttribute('colspan')).toBe(String(headers.length));
  });
});
