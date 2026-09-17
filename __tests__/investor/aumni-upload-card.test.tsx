/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { UploadSnapshot } from '@/app/(app)/(investor)/investor/documents/aumni-upload-manager';

const managerState: {
  snapshot: UploadSnapshot;
  listeners: ((s: UploadSnapshot) => void)[];
} = { snapshot: { status: 'idle' } as UploadSnapshot, listeners: [] };

// TanStack Table applies its page-index reset from a queued microtask; yielding
// a macrotask inside act lets it settle before asserting.
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

const startUpload = jest.fn().mockResolvedValue(null);

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
    startUpload: (...args: unknown[]) => startUpload(...args),
    isActive: () => managerState.snapshot.status === 'uploading',
    reset: () => {
      managerState.snapshot = { status: 'idle' } as UploadSnapshot;
    },
    toastRef: { current: null },
  }),
);

jest.mock(
  '@/app/(app)/(investor)/investor/documents/aumni-upload-state',
  () => ({
    loadPending: () => null,
    clearPending: jest.fn(),
  }),
);

jest.mock('@/utils/supabase/client', () => ({ createClient: () => ({}) }));
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// The real drop zone wires drag/drop and a file input; the card's own state is
// what this covers, so expose a plain button that hands it a file.
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

import { AumniUploadCard } from '@/app/(app)/(investor)/investor/documents/AumniUploadCard';

const dropZone = () => screen.queryByRole('button', { name: 'drop zone' });
const importButton = () =>
  screen.queryByRole('button', { name: 'Upload Aumni Archive' });

function renderCard() {
  const onUploadComplete = jest.fn();
  render(
    <AumniUploadCard
      organizationId="org-1"
      onUploadComplete={onUploadComplete}
    />,
  );
  return { onUploadComplete };
}

const stageAndUpload = async () => {
  await interact(() => fireEvent.click(dropZone() as HTMLElement));
  await interact(() => fireEvent.click(importButton() as HTMLElement));
  await emit({
    status: 'uploading',
    fileName: 'export.zip',
    loaded: 0,
    total: 1,
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  managerState.snapshot = { status: 'idle' } as UploadSnapshot;
  managerState.listeners = [];
});

describe('AumniUploadCard after a completed import', () => {
  it('keeps the finished row and hands the drop zone back for another archive', async () => {
    renderCard();
    await stageAndUpload();
    expect(dropZone()).toBeNull();

    await emit({ status: 'uploaded' });

    expect(screen.getByText('export.zip')).toBeTruthy();
    expect(dropZone()).not.toBeNull();
  });

  it('does not re-offer the upload action for the archive it just sent', async () => {
    renderCard();
    await stageAndUpload();

    await emit({ status: 'uploaded' });

    expect(importButton()).toBeNull();
    expect(startUpload).toHaveBeenCalledTimes(1);
  });

  it('notifies the page once so it can refresh, without closing the panel', async () => {
    const { onUploadComplete } = renderCard();
    await stageAndUpload();

    await emit({ status: 'uploaded' });

    expect(onUploadComplete).toHaveBeenCalledTimes(1);
  });

  it('replaces the finished row when a second archive is picked', async () => {
    renderCard();
    await stageAndUpload();
    await emit({ status: 'uploaded' });

    await interact(() => fireEvent.click(dropZone() as HTMLElement));

    expect(importButton()).not.toBeNull();
  });
});
