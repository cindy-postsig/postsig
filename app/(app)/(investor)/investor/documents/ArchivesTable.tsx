'use client';

import { formatDateTime } from '@/utils/date';
import { useDateFormat } from '@/hooks/useDateFormat';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ModuleArchiveRow } from '@/app/api/v2/types/api';

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '--';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

const SOURCE_LABELS: Record<string, string> = {
  aumni: 'Aumni',
  investor_upload: 'Upload',
};

interface ArchivesTableProps {
  archives: ModuleArchiveRow[];
}

export function ArchivesTable({ archives }: ArchivesTableProps) {
  const { dateFormat } = useDateFormat();
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <div className="ml-auto pr-2 text-xs text-muted-foreground">
          {archives.length} archive{archives.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Submitted by</TableHead>
              <TableHead>Uploaded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {archives.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No archives uploaded yet.
                </TableCell>
              </TableRow>
            ) : (
              archives.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.fileName}</TableCell>
                  <TableCell>
                    {row.source
                      ? (SOURCE_LABELS[row.source] ?? row.source)
                      : '--'}
                  </TableCell>
                  <TableCell>{formatFileSize(row.fileSize)}</TableCell>
                  <TableCell>{row.uploadedBy}</TableCell>
                  <TableCell>
                    {formatDateTime(row.uploadedAt, dateFormat).text}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
