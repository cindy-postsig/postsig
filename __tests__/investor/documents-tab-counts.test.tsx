/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { DocumentsTableClient } from '@/app/(app)/(investor)/investor/documents/DocumentsTableClient';
import type { VentureDocumentRow } from '@/lib/v2/investor/service';
import type { ModuleArchiveRow } from '@/app/api/v2/types/api';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

jest.mock(
  '@/app/(app)/(investor)/investor/documents/DocumentsUploadCard',
  () => ({ DocumentsUploadCard: () => null }),
);
jest.mock('@/app/(app)/(investor)/investor/documents/AumniUploadCard', () => ({
  AumniUploadCard: () => null,
}));
jest.mock(
  '@/app/(app)/(investor)/investor/documents/DocumentPreviewSheet',
  () => ({ DocumentPreviewSheet: () => null }),
);
jest.mock('@/app/lib/actions/investor/export', () => ({
  getVentureDocumentSignedUrl: jest.fn(),
}));
jest.mock('@/components/vendors/VendorIcon', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/lib/api/v2-client', () => ({
  apiClient: {
    investor: { getDocuments: jest.fn().mockResolvedValue({ documents: [] }) },
    archives: { list: jest.fn().mockResolvedValue({ archives: [] }) },
  },
}));
jest.mock('@/components/ui/data-table/components/MultiSelectFilter', () => ({
  MultiSelectFilter: () => null,
}));

const buildDocument = (index: number): VentureDocumentRow => ({
  id: `doc-${index}`,
  name: `Document ${index}.pdf`,
  year: null,
  period: '',
  submittedOn: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
  submittedBy: 'Ada Lovelace',
  status: 'COMPLETE',
  isPublished: false,
  investment: null,
  documentType: 'Unknown',
  documentTypeCode: '',
  documentGroupType: 'supplemental',
  stage: null,
  files: [],
});

const buildArchive = (index: number): ModuleArchiveRow =>
  ({
    id: `archive-${index}`,
    fileName: `export-${index}.zip`,
    filePath: `org/investor/export-${index}.zip`,
    fileSize: 1024,
    source: 'aumni',
    uploadedBy: 'Ada Lovelace',
    uploadedAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
  }) as ModuleArchiveRow;

const renderTable = (
  documents: VentureDocumentRow[],
  archives: ModuleArchiveRow[],
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <NuqsTestingAdapter>
      <QueryClientProvider client={queryClient}>
        <DocumentsTableClient
          initialData={documents}
          initialArchives={archives}
        />
      </QueryClientProvider>
    </NuqsTestingAdapter>,
  );
};

const tab = (name: RegExp) => screen.getByRole('tab', { name });

describe('DocumentsTableClient tab counts', () => {
  it('shows the document count alongside the archive count', () => {
    renderTable(
      [buildDocument(1), buildDocument(2), buildDocument(3)],
      [buildArchive(1)],
    );

    expect(within(tab(/^Documents/)).getByText('3')).toBeTruthy();
    expect(within(tab(/^Archives/)).getByText('1')).toBeTruthy();
  });

  it('keeps the badge on the total while the toolbar tracks the filtered rows', async () => {
    renderTable([buildDocument(1), buildDocument(2), buildDocument(3)], []);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Search company or file'), {
        target: { value: 'Document 2' },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByText('1 documents')).toBeTruthy();
    expect(within(tab(/^Documents/)).getByText('3')).toBeTruthy();
  });
});
