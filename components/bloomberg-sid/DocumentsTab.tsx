'use client';

import { useState } from 'react';
import { CsvViewerDialog } from '@/components/bloomberg-sid/CsvViewerDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDateFormat } from '@/hooks/useDateFormat';
import type { SidReportFile } from '@/lib/v2/bloomberg-sid/report';
import { TABLE_HEADER_CLASS } from '@/components/bloomberg-sid/bits';

const FILE_PURPOSE: Record<number, string> = {
  0: 'Accounts (legal entities)',
  1: 'Subscription change activity',
  2: 'Terminal subscriptions',
  3: 'Exchange entitlements',
  4: 'Exchange entitlements with EID',
  5: 'Research report purchases',
  6: 'Material / hardware charges',
  7: 'Change activity with billing',
};

const kilobytes = (byteSize: number) => `${(byteSize / 1024).toFixed(1)} KB`;

export function DocumentsTab({
  files,
  reportMonth,
}: {
  files: SidReportFile[];
  /** `yyyy-MM-dd` of the selected report month. */
  reportMonth: string;
}) {
  const { formatDate } = useDateFormat();
  const [viewing, setViewing] = useState<SidReportFile | null>(null);

  return (
    <div>
      <h3 className="mb-1">Documents</h3>
      <p className="mb-6 text-sm text-muted-foreground">
        Firmwide SID files for {formatDate(reportMonth)}
      </p>
      <Card>
        <Table stickyHeader className="[&>thead]:bg-card">
          <TableHeader className={TABLE_HEADER_CLASS}>
            <TableRow className="bg-muted/40">
              <TableHead>File</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file) => (
              <TableRow key={file.fileIndex}>
                <TableCell className="font-mono text-xs">
                  {file.fileName}
                </TableCell>
                <TableCell>{FILE_PURPOSE[file.fileIndex] ?? '—'}</TableCell>
                <TableCell className="text-right">
                  {file.rowCount.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {kilobytes(file.byteSize)}
                </TableCell>
                <TableCell className="text-right">
                  {file.signedUrl || file.downloadUrl ? (
                    <div className="flex items-center justify-end gap-3">
                      {file.signedUrl && (
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => {
                            setViewing(file);
                          }}
                        >
                          View
                        </Button>
                      )}
                      {file.downloadUrl && (
                        <Button asChild variant="link" size="sm">
                          <a href={file.downloadUrl}>Download</a>
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Unavailable
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <CsvViewerDialog
        file={viewing}
        onClose={() => {
          setViewing(null);
        }}
      />
    </div>
  );
}
