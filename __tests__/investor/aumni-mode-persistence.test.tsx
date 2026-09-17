/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { VentureDocumentRow } from '@/lib/v2/investor/service';
import type { UploadSnapshot } from '@/app/(app)/(investor)/investor/documents/aumni-upload-manager';

const managerState: {
  snapshot: UploadSnapshot;
  listeners: ((s: UploadSnapshot) => void)[];
} = { snapshot: { status: 'idle' } as UploadSnapshot, listeners: [] };

jest.mock(
  '@/app/(app)/(investor)/investor/documents/aumni-upload-manager',
  () => ({
    getSnapshot: () => managerState.snapshot,
    subscribe: (listener: (s: UploadSnapshot) => void) => {
      managerState.listeners.push(listener);
      return () => {
        managerState.listeners = managerState.listeners.filter(
          (l) => l !== listener,
        );
      };
    },
    startUpload: jest.fn().mockResolvedValue(null),
    isActive: () => managerState.snapshot.status === 'uploading',
    reset: () => {
      managerState.snapshot = { status: 'idle' } as UploadSnapshot;
    },
    toastRef: { current: null },
  }),
);

jest.mock(
  '@/app/(app)/(investor)/investor/documents/aumni-upload-state',
  () => ({ loadPending: () => null, clearPending: jest.fn() }),
);
jest.mock('@/utils/supabase/client', () => ({ createClient: () => ({}) }));
jest.mock('@/components/documents/FileDropZone', () => ({
  FileDropZone: ({ onFiles }: { onFiles: (files: File[]) => void }) => (
    <button
      type="button"
      onClick={() =>
        onFiles([new File(['zip'], 'export.zip', { type: 'application/zip' })])
      }
    >
      drop zone
    </button>
  ),
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
  '@/app/(app)/(investor)/investor/documents/DocumentsUploadCard',
  () => ({ DocumentsUploadCard: () => null }),
);
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

const emit = (snapshot: Partial<UploadSnapshot>) =>
  interact(() => {
    managerState.snapshot = {
      ...managerState.snapshot,
      ...snapshot,
    } as UploadSnapshot;
    managerState.listeners.forEach((l) => l(managerState.snapshot));
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

const button = (name: string) => screen.queryByRole('button', { name });
const inAumniMode = () => button('Cancel') !== null;
const selectedTab = () =>
  screen
    .getAllByRole('tab')
    .find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;

// hasMemory makes the adapter apply its own writes, like the real one. Without
// it a setFilterParams write never reflects back, which both spins the
// URL-sync effect and makes any assertion about the selected tab vacuous.
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

const enterAumniMode = () =>
  interact(() => fireEvent.click(button('Import from Aumni') as HTMLElement));

beforeEach(() => {
  jest.clearAllMocks();
  managerState.snapshot = { status: 'idle' } as UploadSnapshot;
  managerState.listeners = [];
});

describe('Aumni upload mode persistence (psk-1687 item 3)', () => {
  it('stays in Aumni mode after an import completes', async () => {
    renderPage();
    await enterAumniMode();
    expect(inAumniMode()).toBe(true);

    await interact(() => fireEvent.click(button('drop zone') as HTMLElement));
    await interact(() =>
      fireEvent.click(button('Upload Aumni Archive') as HTMLElement),
    );
    await emit({
      status: 'uploading',
      fileName: 'export.zip',
      loaded: 0,
      total: 1,
    });

    await emit({ status: 'uploaded' });

    expect(inAumniMode()).toBe(true);
    expect(button('Import from Aumni')).toBeNull();
  });

  it('offers the drop zone again so a second export can be imported', async () => {
    renderPage();
    await enterAumniMode();
    await interact(() => fireEvent.click(button('drop zone') as HTMLElement));
    await interact(() =>
      fireEvent.click(button('Upload Aumni Archive') as HTMLElement),
    );
    await emit({
      status: 'uploading',
      fileName: 'export.zip',
      loaded: 0,
      total: 1,
    });

    await emit({ status: 'uploaded' });

    expect(button('drop zone')).not.toBeNull();
  });

  it('does not navigate the table to Archives on its own', async () => {
    renderPage();
    await enterAumniMode();
    expect(selectedTab()).toMatch(/^Documents/);

    await interact(() => fireEvent.click(button('drop zone') as HTMLElement));
    await interact(() =>
      fireEvent.click(button('Upload Aumni Archive') as HTMLElement),
    );
    await emit({
      status: 'uploading',
      fileName: 'export.zip',
      loaded: 0,
      total: 1,
    });

    await emit({ status: 'uploaded' });

    expect(selectedTab()).toMatch(/^Documents/);
  });
});
