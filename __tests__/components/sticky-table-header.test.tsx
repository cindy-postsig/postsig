/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render } from '@testing-library/react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function renderTable(props: React.ComponentProps<typeof Table> = {}) {
  const { container } = render(
    <Table {...props}>
      <TableHeader>
        <TableRow>
          <TableHead>Vendor</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Acme</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
  const table = container.querySelector('table');
  if (!table) throw new Error('no table rendered');
  return { table, box: table.parentElement as HTMLElement };
}

describe('Table stickyHeader', () => {
  it('leaves the table alone when the prop is absent', () => {
    const { table, box } = renderTable();

    expect(table.className).toContain('border-collapse');
    expect(table.className).not.toContain('border-separate');
    expect(table.className).not.toContain('[&>thead]:sticky');
    expect(box.className).not.toContain('overflow-auto');
  });

  it('pins the header and gives it a scrollport to stay put against', () => {
    const { table, box } = renderTable({ stickyHeader: true });

    expect(table.className).toContain('[&>thead]:sticky');
    expect(table.className).toContain('[&>thead]:top-0');
    expect(box.className).toContain('overflow-auto');
    expect(box.className).toContain('max-h-[calc(100vh-20rem)]');
  });

  it('separates borders so the pinned header keeps its rule', () => {
    const { table } = renderTable({ stickyHeader: true });

    // Collapsed borders belong to the table, not the cells, so they would
    // scroll out from under the pinned row.
    expect(table.className).toContain('border-separate');
    expect(table.className).not.toContain('border-collapse');
    expect(table.className).toContain('[&>thead>tr>th]:border-b');
  });

  it('moves the body row rules onto the cells, which separated borders paint', () => {
    const { table } = renderTable({ stickyHeader: true });

    expect(table.className).toContain('[&>tbody>tr>*]:border-b');
    expect(table.className).toContain('[&>tbody>tr:last-child>*]:border-b-0');
  });

  it('gives the pinned header an opaque backdrop', () => {
    const { table } = renderTable({ stickyHeader: true });

    expect(table.className).toContain('[&>thead]:bg-background');
  });

  it('lets a card table restyle that backdrop', () => {
    const { table } = renderTable({
      stickyHeader: true,
      className: '[&>thead]:bg-card',
    });

    expect(table.className).toContain('[&>thead]:bg-card');
    expect(table.className).not.toContain('[&>thead]:bg-background');
  });

  it('adds the caller classes to the scroll box', () => {
    const { box } = renderTable({
      stickyHeader: true,
      scrollClassName: 'rounded-md border',
    });

    expect(box.className).toContain('rounded-md');
    expect(box.className).toContain('border');
    expect(box.className).toContain('overflow-auto');
  });

  it('lets the caller override the height cap', () => {
    const { box } = renderTable({
      stickyHeader: true,
      scrollClassName: 'max-h-96',
    });

    expect(box.className).toContain('max-h-96');
    expect(box.className).not.toContain('max-h-[calc(100vh-20rem)]');
  });

  it('skips the scrollport when the table already sits in one', () => {
    const { table, box } = renderTable({
      stickyHeader: true,
      scrollClassName: null,
    });

    expect(box.className).not.toContain('overflow-auto');
    expect(box.className).not.toContain('max-h-[calc(100vh-20rem)]');
    // The header still pins — against whatever scrollport the caller provides.
    expect(table.className).toContain('[&>thead]:sticky');
  });
});
