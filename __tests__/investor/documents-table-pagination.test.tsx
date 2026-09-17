/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { DocumentsTableClient } from '@/app/(app)/(investor)/investor/documents/DocumentsTableClient';
import { VENTURE_DOCUMENTS_QUERY_KEYS } from '@/hooks/api/useVentureDocuments';
import type { VentureDocumentRow } from '@/lib/v2/investor/service';

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

// The real filter drives a Radix popover + cmdk list; a flat button per option
// keeps the test on the table's own handler.
jest.mock('@/components/ui/data-table/components/MultiSelectFilter', () => ({
  MultiSelectFilter: ({
    options,
    placeholder,
    onValueChange,
  }: {
    options: { value: string; label: string }[];
    placeholder: string;
    onValueChange: (value: string[]) => void;
  }) => (
    <div>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onValueChange([option.value])}
        >
          {`${placeholder}:${option.value}`}
        </button>
      ))}
    </div>
  ),
}));

const buildDocument = (index: number): VentureDocumentRow => ({
  id: `doc-${index}`,
  name: `Document ${String(index).padStart(2, '0')}.pdf`,
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

// Page size is 50, so 60 documents span two pages. Rows sort newest-first, so
// the oldest document (01) lands on page 2.
const documents = Array.from({ length: 60 }, (_, i) => buildDocument(i + 1));

const pageButton = (page: number) =>
  screen.getByRole('button', { name: `Go to page ${page}` });

const currentPage = () =>
  [1, 2].find(
    (page) => pageButton(page).getAttribute('aria-current') === 'page',
  );

const searchInput = () => screen.getByPlaceholderText('Search company or file');

// react-query notifies observers on a setTimeout(0) tick and TanStack Table
// applies its page-index reset from a queued microtask; yielding a macrotask
// inside act lets both settle before asserting.
const interact = (run: () => void) =>
  act(async () => {
    run();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const renderTable = (initialData = documents) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <NuqsTestingAdapter>
      <QueryClientProvider client={queryClient}>
        <DocumentsTableClient initialData={initialData} initialArchives={[]} />
      </QueryClientProvider>
    </NuqsTestingAdapter>,
  );
  return queryClient;
};

const refreshDocuments = (
  queryClient: QueryClient,
  refreshed: VentureDocumentRow[],
) =>
  interact(() =>
    queryClient.setQueryData(VENTURE_DOCUMENTS_QUERY_KEYS.documents, {
      documents: refreshed,
    }),
  );

const goToPage2 = async () => {
  await interact(() => fireEvent.click(pageButton(2)));
  expect(currentPage()).toBe(2);
  expect(screen.getByText('Document 01.pdf')).toBeTruthy();
};

describe('DocumentsTableClient pagination', () => {
  it('stays on the current page when the document list refreshes', async () => {
    const queryClient = renderTable();
    await goToPage2();

    await refreshDocuments(queryClient, [buildDocument(61), ...documents]);

    expect(screen.getByText('61 documents')).toBeTruthy();
    expect(currentPage()).toBe(2);
    expect(screen.getByText('Document 01.pdf')).toBeTruthy();
    expect(screen.queryByText('Document 61.pdf')).toBeNull();
  });

  it('falls back to the last page when a refresh removes the current one', async () => {
    // 51 documents: page 2 holds only the oldest one.
    const initial = documents.slice(0, 51);
    const queryClient = renderTable(initial);
    await goToPage2();

    await refreshDocuments(queryClient, initial.slice(1));

    expect(screen.getByText('50 documents')).toBeTruthy();
    expect(screen.queryByText('No documents found.')).toBeNull();
    expect(screen.getByText('Document 02.pdf')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Go to page 2' })).toBeNull();
  });

  it('returns to page 1 when the search text changes', async () => {
    renderTable();
    await goToPage2();

    await interact(() =>
      fireEvent.change(searchInput(), { target: { value: 'Document' } }),
    );

    expect(currentPage()).toBe(1);
  });

  it('returns to page 1 when a status filter is applied', async () => {
    renderTable();
    await goToPage2();

    await interact(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'All Status:COMPLETE' }),
      ),
    );

    expect(currentPage()).toBe(1);
  });

  it('returns to page 1 when a submitter filter is applied', async () => {
    renderTable();
    await goToPage2();

    await interact(() =>
      fireEvent.click(
        screen.getByRole('button', { name: 'All Submitters:Ada Lovelace' }),
      ),
    );

    expect(currentPage()).toBe(1);
  });

  it('returns to page 1 when filters are reset', async () => {
    renderTable();
    await interact(() =>
      fireEvent.change(searchInput(), { target: { value: 'Document' } }),
    );
    await goToPage2();

    await interact(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Reset' })),
    );

    expect(currentPage()).toBe(1);
  });
});
