/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { VentureDocumentRow } from '@/lib/v2/investor/service';
import type { UploadingDocument } from '@/app/(app)/(investor)/investor/documents/DocumentsUploadCard';

// Stands in for the real card so the test can drive a finished upload straight
// into the page's completion handler.
jest.mock(
  '@/app/(app)/(investor)/investor/documents/DocumentsUploadCard',
  () => ({
    DocumentsUploadCard: ({
      onUploadStart,
      onUploadComplete,
    }: {
      onUploadStart?: (doc: UploadingDocument) => void;
      onUploadComplete?: (id: string, data: UploadingDocument) => void;
    }) => (
      <button
        type="button"
        onClick={() => {
          const doc: UploadingDocument = {
            id: 'u1',
            fileName: 'export.zip',
            status: 'uploaded',
          };
          onUploadStart?.({ ...doc, status: 'uploading' });
          onUploadComplete?.('u1', doc);
        }}
      >
        finish zip upload
      </button>
    ),
  }),
);

jest.mock('@/app/(app)/(investor)/investor/documents/AumniUploadCard', () => ({
  AumniUploadCard: () => null,
}));
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

import { DocumentsTableClient } from '@/app/(app)/(investor)/investor/documents/DocumentsTableClient';

const interact = (run: () => void) =>
  act(async () => {
    run();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

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

const selectedTab = () =>
  screen
    .getAllByRole('tab')
    .find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <NuqsTestingAdapter hasMemory>
      <QueryClientProvider client={queryClient}>
        <DocumentsTableClient
          initialData={[buildDocument(1)]}
          initialArchives={[]}
          organizationId="org-1"
        />
      </QueryClientProvider>
    </NuqsTestingAdapter>,
  );
}

describe('zip upload completion (psk-1687 item 3)', () => {
  it('leaves the reader on the tab they were already on', async () => {
    renderPage();
    await interact(() => {});
    expect(selectedTab()).toMatch(/^Documents/);

    await interact(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'finish zip upload' }),
      ),
    );

    expect(selectedTab()).toMatch(/^Documents/);
  });
});
