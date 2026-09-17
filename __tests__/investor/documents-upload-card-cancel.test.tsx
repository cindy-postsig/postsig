/**
 * @jest-environment jsdom
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';

import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

const mockStartUpload = jest.fn();
const mockToast = jest.fn();

// Keep the real UploadAbortedError so the card's instanceof branch is the one
// under test, not a stand-in that would match anything.
jest.mock(
  '@/app/(app)/(investor)/investor/documents/documents-upload-manager',
  () => {
    const actual = jest.requireActual(
      '@/app/(app)/(investor)/investor/documents/documents-upload-manager',
    );
    return {
      ...actual,
      startUpload: (args: unknown) => mockStartUpload(args),
      abort: jest.fn(),
      clearSnapshot: jest.fn(),
      subscribe: () => () => {},
    };
  },
);

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));
jest.mock('@/utils/supabase/client', () => ({ createClient: () => ({}) }));
jest.mock('@/hooks/api/useProcessInvestorDocument', () => ({
  useProcessInvestorDocument: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock('@/components/documents/FileDropZone', () => ({
  FileDropZone: ({ onFiles }: { onFiles: (files: File[]) => void }) => (
    <button
      type="button"
      onClick={() =>
        onFiles([
          new File(['content'], 'a.pdf', { type: 'application/pdf' }),
          new File(['content'], 'b.pdf', { type: 'application/pdf' }),
        ])
      }
    >
      drop zone
    </button>
  ),
}));

import { DocumentsUploadCard } from '@/app/(app)/(investor)/investor/documents/DocumentsUploadCard';
import { UploadAbortedError } from '@/app/(app)/(investor)/investor/documents/documents-upload-manager';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

const interact = (run: () => void) =>
  act(async () => {
    run();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const click = (name: string) =>
  interact(() => fireEvent.click(screen.getByRole('button', { name })));

const startedFileNames = (): string[] =>
  mockStartUpload.mock.calls.map(
    (call) => (call[0] as { file: File }).file.name,
  );

async function startBatchWithCancelledFirstFile(
  props: { onUploadProgress?: jest.Mock } = {},
) {
  mockStartUpload.mockImplementation((args: unknown) => {
    const { file } = args as { file: File };
    return file.name === 'a.pdf'
      ? Promise.reject(new UploadAbortedError())
      : Promise.resolve({ success: true, documentId: 'doc-b' });
  });

  render(<DocumentsUploadCard organizationId="org-1" {...props} />);
  await click('drop zone');
  await click('Upload Documents');
}

describe('DocumentsUploadCard cancellation branch', () => {
  // The row text alone does not separate the two paths — UploadAbortedError's
  // message is 'Upload cancelled' either way. Not telling the page the upload
  // errored is what the branch actually changes.
  it('marks the row cancelled without reporting an upload error', async () => {
    const onUploadProgress = jest.fn();
    await startBatchWithCancelledFirstFile({ onUploadProgress });

    await waitFor(() =>
      expect(screen.getByText('Upload cancelled')).toBeTruthy(),
    );
    expect(onUploadProgress).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'error' }),
    );
  });

  it('raises no destructive toast for the user’s own cancel', async () => {
    await startBatchWithCancelledFirstFile();

    await waitFor(() => expect(startedFileNames()).toContain('b.pdf'));
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' }),
    );
  });

  // Not branch-specific — the queue advances on any settled promise — but it
  // is the psk-1687 behaviour, so it is worth pinning here too.
  it('carries on to the next file in the batch', async () => {
    await startBatchWithCancelledFirstFile();

    await waitFor(() => expect(startedFileNames()).toEqual(['a.pdf', 'b.pdf']));
    await waitFor(() => expect(screen.getByText('Uploaded')).toBeTruthy());
  });
});
