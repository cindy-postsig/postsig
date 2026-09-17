'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FIELD_LABELS,
  type EmployeeImportMapping,
  type ImportTargetField,
} from '@/lib/v2/employee-import/types';
import { normalizeValueMapKey } from '@/lib/v2/employee-import/resolve-rows';
import type { ImportPreview } from '@/lib/v2/employee-import/service';

/** full_name is not a stored field — it is split into first/last on resolve. */
type PreviewColumn = Exclude<ImportTargetField, 'full_name'>;

const PREVIEW_COLUMNS: PreviewColumn[] = [
  'employee_id',
  'first_name',
  'last_name',
  'email',
  'cost_center',
  'business_group',
  'business_unit',
  'department',
  'team',
  'region',
  'country',
  'start_date',
  'leave_date',
];

const ROWS_PER_PAGE = 100;

type Props = {
  preview: ImportPreview;
  isLoading: boolean;
};

export function PreviewStep({ preview, isLoading }: Props) {
  const [page, setPage] = useState(0);

  const pageCount = Math.max(
    1,
    Math.ceil(preview.sampleRows.length / ROWS_PER_PAGE),
  );

  // A mapping edit re-resolves the file and can shrink the row set.
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const unresolvedGroupCount = preview.unresolvedBusinessGroups.length;

  const visibleRows = preview.isCompleteSample
    ? preview.sampleRows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE)
    : preview.sampleRows;

  const unmappedEntries = Object.entries(preview.unmappedValues).filter(
    ([, values]) => values && values.length > 0,
  ) as [ImportTargetField, string[]][];

  const matchedGroups = useMemo(
    () =>
      new Map(
        preview.matchedBusinessGroups.map(({ source, group }) => [
          normalizeValueMapKey(source),
          group,
        ]),
      ),
    [preview.matchedBusinessGroups],
  );

  const resolvedGroup = (value: string): string | null => {
    if (value === '') return null;
    const group = matchedGroups.get(normalizeValueMapKey(value));
    return group && group !== value ? group : null;
  };

  return (
    <div className={`min-w-0 space-y-4 ${isLoading ? 'opacity-60' : ''}`}>
      <div className="overflow-hidden rounded-md border">
        <div className="flex flex-wrap items-baseline justify-between gap-2 bg-muted/30 px-3 py-2.5">
          <p className="font-medium text-xs">
            {preview.valid} of {preview.total} row
            {preview.total === 1 ? '' : 's'} ready
          </p>
          {preview.newCount !== null && (
            <p className="text-xs text-muted-foreground">
              {preview.newCount} new
              {preview.updateCount !== null &&
                preview.updateCount > 0 &&
                ` · ${preview.updateCount} update${preview.updateCount === 1 ? '' : 's'}`}
            </p>
          )}
        </div>

        {preview.invalidRows.length > 0 && (
          <Accordion type="single" collapsible className="border-t">
            <AccordionItem value="invalid" className="border-0">
              <AccordionTrigger className="px-3 py-2.5 text-xs text-pink-600 hover:no-underline">
                {preview.invalid} row{preview.invalid === 1 ? '' : 's'}{' '}
                won&apos;t be imported
              </AccordionTrigger>
              <AccordionContent className="px-3 pb-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  Only rows missing a first or last name are excluded — both are
                  required. Everything else imports.
                </p>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                  {preview.invalidRows.map((row) => (
                    <li
                      key={row.rowNumber}
                      className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2"
                    >
                      <span className="font-mono text-muted-foreground">
                        Row {row.rowNumber}
                      </span>
                      <span>{row.reasons.join('; ')}</span>
                    </li>
                  ))}
                  {preview.invalid > preview.invalidRows.length && (
                    <li className="text-muted-foreground">
                      …and {preview.invalid - preview.invalidRows.length} more
                    </li>
                  )}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>

      {unmappedEntries.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="font-medium text-xs">
            Some values have no entry in their value map and will be imported
            blank:
          </p>
          <ul className="mt-1.5 space-y-1 text-xs">
            {unmappedEntries.map(([field, values]) => (
              <li key={field}>
                <span className="text-muted-foreground">
                  {FIELD_LABELS[field]}:
                </span>{' '}
                {values.slice(0, 8).join(', ')}
                {values.length > 8 && ` …and ${values.length - 8} more`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unresolvedGroupCount > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          {/* Built as one string: JSX drops the whitespace before an
              expression that starts a line, which silently glued words
              together in the panel this replaced. */}
          <p className="font-medium text-xs">
            {unresolvedGroupCount === 1
              ? '1 business group in this file does not match an existing group'
              : `${unresolvedGroupCount} business groups in this file do not match an existing group`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Open <span className="font-medium">Map values</span> on Business
            Group to pick or create a group for each one. Unmapped names import
            with no business group.
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {preview.unresolvedBusinessGroups.slice(0, 8).join(', ')}
            {unresolvedGroupCount > 8 &&
              ` …and ${unresolvedGroupCount - 8} more`}
          </p>
        </div>
      )}

      <div className="min-w-0 overflow-hidden rounded-md border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {preview.sampleRows.length === 0
              ? 'No rows to show yet'
              : preview.isCompleteSample
                ? `Rows ${page * ROWS_PER_PAGE + 1}–${Math.min((page + 1) * ROWS_PER_PAGE, preview.sampleRows.length)} of ${preview.sampleRows.length} · scroll sideways for more columns`
                : `First ${preview.sampleRows.length} rows · scroll sideways for more columns`}
          </p>
          {preview.isCompleteSample && pageCount > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="px-1 text-xs text-muted-foreground">
                {page + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
        {/* Bounded so the sample never dominates the mapping step, and the
            only element that scrolls in either direction. */}
        <div className="max-h-64 w-full overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 z-10 bg-background">
              <tr>
                {PREVIEW_COLUMNS.map((field) => (
                  <th
                    key={field}
                    className="font-medium whitespace-nowrap border-b px-2 py-1.5 text-left text-muted-foreground"
                  >
                    {FIELD_LABELS[field]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRows.map((row) => (
                <tr key={row.rowNumber}>
                  {PREVIEW_COLUMNS.map((field) => {
                    const resolved =
                      field === 'business_group'
                        ? resolvedGroup(row[field])
                        : null;
                    return (
                      <td
                        key={field}
                        className="whitespace-nowrap px-2 py-1.5"
                        title={
                          resolved
                            ? `${row[field]} → ${resolved}`
                            : row[field] || undefined
                        }
                      >
                        {row[field] || (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {resolved && (
                          <span className="text-muted-foreground">
                            {' → '}
                            {resolved}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
