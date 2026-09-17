/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  useUploadQueue,
  type UploadQueue,
} from '@/components/documents/useUploadQueue';
import type { UploadingFile } from '@/components/documents/types';

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

const makeFile = (name: string) =>
  new File(['content'], name, { type: 'application/pdf' });

/**
 * Stands in for the upload manager: each call parks until the test settles it,
 * and aborting settles it the way a cancelled tus upload does.
 */
function makeRunner() {
  const settle = new Map<string, () => void>();
  const startedIds: string[] = [];
  const startedNames: string[] = [];

  const runUpload = jest.fn((file: File, id: string) => {
    startedIds.push(id);
    startedNames.push(file.name);
    return new Promise<void>((resolve) => settle.set(id, resolve));
  });

  const abortInFlight = jest.fn((row: UploadingFile) => {
    settle.get(row.id)?.();
  });

  return {
    runUpload,
    abortInFlight,
    startedNames,
    finish: (index: number) => settle.get(startedIds[index])?.(),
  };
}

async function startQueue(runner: ReturnType<typeof makeRunner>) {
  const { result } = renderHook(() =>
    useUploadQueue<UploadingFile>({
      runUpload: runner.runUpload,
      abortInFlight: runner.abortInFlight,
      maxConcurrency: 1,
    }),
  );

  act(() => {
    result.current.handleFiles([makeFile('a.pdf'), makeFile('b.pdf')]);
  });
  act(() => {
    result.current.handleUploadClick();
  });

  await waitFor(() => expect(runner.startedNames).toEqual(['a.pdf']));
  return result as { current: UploadQueue<UploadingFile> };
}

// The caller's runUpload owns row status in production; here the test drives
// it, and the row being worked on has to leave 'ready' or the scheduler would
// hand it back on the next pass.
const markStatus = (
  result: { current: UploadQueue<UploadingFile> },
  fileName: string,
  status: UploadingFile['status'],
) =>
  act(() => {
    const row = result.current.files.find((f) => f.fileName === fileName);
    if (row) result.current.patchFile(row.id, { status });
  });

const removeRow = (
  result: { current: UploadQueue<UploadingFile> },
  fileName: string,
) =>
  act(() => {
    const row = result.current.files.find((f) => f.fileName === fileName);
    if (row) result.current.removeFile(row.id);
  });

describe('useUploadQueue cancellation scope', () => {
  it('keeps draining the queue when one in-flight file is removed', async () => {
    const runner = makeRunner();
    const result = await startQueue(runner);
    await markStatus(result, 'a.pdf', 'uploading');

    await removeRow(result, 'a.pdf');

    await waitFor(() =>
      expect(runner.startedNames).toEqual(['a.pdf', 'b.pdf']),
    );
    expect(runner.abortInFlight).toHaveBeenCalledTimes(1);
    expect(result.current.files.map((f) => f.fileName)).toEqual(['b.pdf']);
  });

  it('leaves the rest of the queue alone when a finished row is removed', async () => {
    const runner = makeRunner();
    const result = await startQueue(runner);
    await markStatus(result, 'a.pdf', 'uploading');

    act(() => runner.finish(0));
    await markStatus(result, 'a.pdf', 'uploaded');
    await waitFor(() =>
      expect(runner.startedNames).toEqual(['a.pdf', 'b.pdf']),
    );

    await removeRow(result, 'a.pdf');

    // Clearing a finished row is bookkeeping, not a cancellation: b.pdf keeps
    // the slot it already holds and is never aborted or restarted.
    expect(runner.abortInFlight).not.toHaveBeenCalled();
    expect(runner.startedNames).toEqual(['a.pdf', 'b.pdf']);
    expect(result.current.files.map((f) => f.fileName)).toEqual(['b.pdf']);
  });

  it('stops the whole batch only when the batch Cancel is used', async () => {
    const runner = makeRunner();
    const result = await startQueue(runner);
    await markStatus(result, 'a.pdf', 'uploading');

    act(() => {
      result.current.handleCancel();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(runner.startedNames).toEqual(['a.pdf']);
    expect(runner.abortInFlight).toHaveBeenCalledTimes(1);
    expect(result.current.isCancelling).toBe(true);
  });
});
