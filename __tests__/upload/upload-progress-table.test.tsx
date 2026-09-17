/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { UploadProgressTable } from '@/components/documents/UploadProgressTable';
import {
  fileNameColumn,
  removeColumn,
  statusColumn,
} from '@/components/documents/upload-columns';
import type { UploadingFile } from '@/components/documents/types';

// Radix's tooltip popper measures its content; jsdom has no layout.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const columns = (onRemove = jest.fn()) => [
  fileNameColumn<UploadingFile>(),
  statusColumn<UploadingFile>(),
  removeColumn<UploadingFile>(onRemove),
];

const file = (
  overrides: Partial<UploadingFile> & Pick<UploadingFile, 'id'>,
): UploadingFile => ({
  fileName: `${overrides.id}.pdf`,
  status: 'ready',
  ...overrides,
});

function renderTable(files: UploadingFile[], maxHeightVh?: number) {
  const onRemove = jest.fn();
  const { container } = render(
    <UploadProgressTable
      files={files}
      columns={columns(onRemove)}
      collapsible={false}
      maxHeightVh={maxHeightVh}
    />,
  );
  return { container, onRemove };
}

const scrollRoot = (container: HTMLElement) =>
  container.querySelector('[data-radix-scroll-area-viewport]')?.parentElement;

describe('UploadProgressTable sizing', () => {
  it('caps the queue with a max height so one row does not reserve the full pane', () => {
    const { container } = renderTable([file({ id: 'a' })], 66);

    const root = scrollRoot(container);
    expect(root?.style.maxHeight).toBe('66vh');
    // A fixed height is the psk-1687 bug: a single row still reserved 66vh,
    // pushing the Upload button below the fold.
    expect(root?.style.height).toBe('');
  });

  it('lets the scroll viewport inherit the cap so long queues still scroll', () => {
    const { container } = renderTable(
      Array.from({ length: 40 }, (_, i) => file({ id: `f-${i}` })),
      66,
    );

    // Radix sizes its viewport to content, which the capped root would then
    // clip unscrollably; this variant hands the cap down to the viewport.
    expect(scrollRoot(container)?.className).toContain(
      '[&>[data-radix-scroll-area-viewport]]:max-h-[inherit]',
    );
  });

  it('renders without a scroll container when no cap is given', () => {
    const { container } = renderTable([file({ id: 'a' })]);

    expect(
      container.querySelector('[data-radix-scroll-area-viewport]'),
    ).toBeNull();
  });
});

describe('upload row actions', () => {
  it('labels the action button for a queued file', () => {
    renderTable([file({ id: 'a' })]);

    expect(
      screen.getByRole('button', { name: 'Remove from upload list' }),
    ).toBeTruthy();
  });

  it('labels the action button for a file that is still uploading', () => {
    renderTable([file({ id: 'a', status: 'uploading', progress: 40 })]);

    expect(
      screen.getByRole('button', { name: 'Cancel this upload' }),
    ).toBeTruthy();
  });

  it('describes the action in a tooltip', async () => {
    renderTable([file({ id: 'a' })]);

    fireEvent.focus(
      screen.getByRole('button', { name: 'Remove from upload list' }),
    );

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('Remove from upload list');
  });

  it('removes only the row that was actioned', () => {
    const { onRemove } = renderTable([file({ id: 'a' }), file({ id: 'b' })]);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Remove from upload list' })[1],
    );

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('b');
  });
});
