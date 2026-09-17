/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

import { FileDropZone } from '@/components/documents/FileDropZone';

const SKIPPED = 'Unsupported file types will be skipped.';
// Contracts processing discards every non-PDF entry; investor processing also
// keeps CSV and XLSX, so the two modules disclose different types.
const CPM_TYPES_COPY =
  'Supported file types: PDF up to 50MB for each file · ZIP up to 5GB — ' +
  `Only PDF files within the ZIP will be uploaded. ${SKIPPED}`;
const INVESTOR_TYPES_COPY =
  'Supported file types: PDF, CSV, XLSX up to 50MB for each file · ' +
  `ZIP up to 5GB — Only PDF, CSV, and XLSX files within the ZIP will be uploaded. ${SKIPPED}`;

describe('FileDropZone labels', () => {
  it('tells the CPM variant only PDFs survive the ZIP', () => {
    render(<FileDropZone onFiles={jest.fn()} variant="cpm" maxFiles={500} />);

    expect(screen.getByText(CPM_TYPES_COPY)).toBeTruthy();
    expect(screen.getByText('Maximum of 500 files per upload')).toBeTruthy();
  });

  it('tells the investor variant PDF, CSV and XLSX survive the ZIP', () => {
    render(<FileDropZone onFiles={jest.fn()} maxFiles={500} />);

    expect(screen.getByText(INVESTOR_TYPES_COPY)).toBeTruthy();
    expect(screen.getByText('Maximum of 500 files per upload')).toBeTruthy();
  });

  it('does not promise CSV or XLSX uploads on the CPM variant', () => {
    render(<FileDropZone onFiles={jest.fn()} variant="cpm" maxFiles={500} />);

    expect(screen.queryByText(INVESTOR_TYPES_COPY)).toBeNull();
  });

  it('leaves the Aumni variant copy unchanged', () => {
    render(<FileDropZone onFiles={jest.fn()} variant="aumni" />);

    expect(
      screen.getByText('Supported file type: ZIP only up to 5GB'),
    ).toBeTruthy();
    expect(screen.queryByText(CPM_TYPES_COPY)).toBeNull();
    expect(screen.queryByText(INVESTOR_TYPES_COPY)).toBeNull();
  });

  it('lets an explicit labelTypes override take precedence', () => {
    render(
      <FileDropZone
        onFiles={jest.fn()}
        variant="cpm"
        labelTypes="Custom types line"
      />,
    );

    expect(screen.getByText('Custom types line')).toBeTruthy();
    expect(screen.queryByText(CPM_TYPES_COPY)).toBeNull();
  });
});
