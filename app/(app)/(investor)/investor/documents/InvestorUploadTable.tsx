'use client';

import { FileText, Loader2, X, CheckCircle2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { UploadingDocument } from './DocumentsUploadCard';

const STATUS_CONFIG: Record<
  UploadingDocument['status'],
  {
    label: string;
    className?: string;
    showSpinner?: boolean;
    showCheck?: boolean;
  }
> = {
  ready: { label: 'Ready' },
  uploading: { label: 'Uploading', showSpinner: true },
  processing: { label: 'Uploading', showSpinner: true },
  uploaded: { label: 'Uploaded', className: 'text-green-600', showCheck: true },
  error: { label: 'Failed', className: 'text-destructive' },
};

interface InvestorUploadTableProps {
  files: UploadingDocument[];
  onRemove?: (id: string) => void;
}

export function InvestorUploadTable({
  files,
  onRemove,
}: InvestorUploadTableProps) {
  if (files.length === 0) return null;

  return (
    <div className="mb-4 mt-4 rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File Name</TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file) => (
            <TableRow key={file.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.fileName}</span>
                </div>
              </TableCell>
              <TableCell>
                {(() => {
                  const config = STATUS_CONFIG[file.status];
                  return (
                    <div className="flex h-8 items-center gap-2">
                      {config.showSpinner && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {config.showCheck && (
                        <CheckCircle2 className="text-green-600 h-4 w-4" />
                      )}
                      <span className={config.className}>{config.label}</span>
                    </div>
                  );
                })()}
              </TableCell>
              <TableCell>
                {['ready', 'error'].includes(file.status) && onRemove && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => onRemove(file.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50"
                      aria-label="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
