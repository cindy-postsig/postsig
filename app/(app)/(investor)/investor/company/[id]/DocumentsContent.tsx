'use client';

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  FileText,
  ChevronRight,
  ChevronDown,
  Download,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import { handleDownload } from '@/app/lib/utils';
import {
  getVentureDocumentSignedUrl,
  downloadAllVentureDocuments,
} from '@/app/lib/actions/investor/export';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ColumnDef,
  ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type {
  VentureDocumentRow,
  VentureDocumentFile,
} from '@/lib/v2/investor/service';
import { resolveVentureDocumentGroupType } from '@/lib/v2/investor/document-categories';
import { STAGE_DISPLAY_ORDER } from '@/lib/v2/inv/stage-utils';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';

const DocumentPreviewSheet = dynamic(
  () =>
    import('@/app/(app)/(investor)/investor/documents/DocumentPreviewSheet').then(
      (m) => m.DocumentPreviewSheet,
    ),
  { ssr: false },
);
import { TabHeader, TabEmptyState } from './companyDetailsPrimitives';

type DocumentCategoryId = 'transaction' | 'cap_table' | 'supplemental';

export interface MissingDocumentInfo {
  definedName: string;
  documentType: string | null;
}

interface DocumentTableRow {
  id: string;
  isCategory: boolean;
  isStage?: boolean;
  isMissing?: boolean;
  categoryLabel?: string;
  stageLabel?: string;
  count?: number;
  missingCount?: number;
  name?: string;
  date?: string | null;
  year?: string | null;
  documentType?: string;
  files?: VentureDocumentFile[];
  subRows?: DocumentTableRow[];
}

function getDocumentCategory(doc: VentureDocumentRow): DocumentCategoryId {
  return resolveVentureDocumentGroupType(
    doc.documentGroupType,
    doc.documentTypeCode,
  );
}

function getDocumentSortValue(doc: VentureDocumentRow): number {
  const year = Number(doc.year);
  if (Number.isFinite(year)) return year;
  return new Date(doc.submittedOn).getTime();
}

function sortDocumentsDescending(
  documents: VentureDocumentRow[],
): VentureDocumentRow[] {
  return [...documents].sort(
    (a, b) => getDocumentSortValue(b) - getDocumentSortValue(a),
  );
}

function getDisplayDocumentType(doc: VentureDocumentRow): string {
  if (
    !doc.documentType?.trim() ||
    doc.documentType === 'Unknown' ||
    doc.documentTypeCode === 'unknown'
  ) {
    return 'Other';
  }
  return doc.documentType;
}

// Each base stage is followed by its -1..-5 sub-stages and its extension, so a
// family stays together; see `docs/stage-taxonomy.md`.
const STAGE_SORT_ORDER = [...STAGE_DISPLAY_ORDER, 'Uncategorized'];

function getStageSortIndex(stage: string): number {
  const index = STAGE_SORT_ORDER.indexOf(stage);
  return index === -1 ? STAGE_SORT_ORDER.length : index;
}

function buildTransactionStageRows(
  documents: VentureDocumentRow[],
  toLeafRow: (
    doc: VentureDocumentRow,
    category: DocumentCategoryId,
  ) => DocumentTableRow,
  missingDocs?: MissingDocumentInfo[],
): DocumentTableRow[] {
  const stageDocuments = new Map<string, VentureDocumentRow[]>();

  for (const doc of documents) {
    const stage = doc.stage?.trim() || 'Uncategorized';
    const docsForStage = stageDocuments.get(stage) ?? [];
    docsForStage.push(doc);
    stageDocuments.set(stage, docsForStage);
  }

  const stageRows = Array.from(stageDocuments.entries())
    .sort(
      ([stageA], [stageB]) =>
        getStageSortIndex(stageA) - getStageSortIndex(stageB) ||
        stageA.localeCompare(stageB),
    )
    .map(([stage, stageDocs]) => {
      const subRows: DocumentTableRow[] = sortDocumentsDescending(
        stageDocs,
      ).map((doc) => toLeafRow(doc, 'transaction'));

      // Append missing doc rows under the last stage section
      const missingCount = 0;

      return {
        id: `stage-${stage.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        isCategory: false,
        isStage: true,
        stageLabel: stage,
        count: stageDocs.length,
        missingCount,
        subRows,
      };
    });

  // Append missing document rows to the last stage (or as standalone if no stages)
  if (missingDocs && missingDocs.length > 0) {
    const missingRows: DocumentTableRow[] = missingDocs.map((doc, idx) => ({
      id: `missing-${idx}-${doc.definedName}`,
      isCategory: false,
      isMissing: true,
      name: doc.definedName,
      documentType: doc.documentType ?? undefined,
    }));

    if (stageRows.length > 0) {
      const lastStage = stageRows[stageRows.length - 1];
      lastStage.subRows = [...(lastStage.subRows ?? []), ...missingRows];
      lastStage.missingCount = missingDocs.length;
    } else {
      // No stages exist — return missing docs as flat rows
      return missingRows;
    }
  }

  return stageRows;
}

function buildDocumentTableRows(
  documents: VentureDocumentRow[],
  missingDocs?: MissingDocumentInfo[],
): DocumentTableRow[] {
  const transactionDocs: VentureDocumentRow[] = [];
  const capTableDocs: VentureDocumentRow[] = [];
  const supplementalDocs: VentureDocumentRow[] = [];

  for (const doc of documents) {
    const category = getDocumentCategory(doc);
    if (category === 'transaction') {
      transactionDocs.push(doc);
    } else if (category === 'cap_table') {
      capTableDocs.push(doc);
    } else {
      supplementalDocs.push(doc);
    }
  }

  const toLeafRow = (
    doc: VentureDocumentRow,
    category: DocumentCategoryId,
  ): DocumentTableRow => ({
    id: doc.id,
    isCategory: false,
    name: doc.name,
    date: doc.submittedOn,
    year: doc.year,
    documentType: getDisplayDocumentType(doc),
    files: doc.files,
  });

  const rows: DocumentTableRow[] = [];

  const totalMissingCount = missingDocs?.length ?? 0;

  if (transactionDocs.length > 0 || totalMissingCount > 0) {
    rows.push({
      id: 'category-transaction',
      isCategory: true,
      categoryLabel: 'Transaction Documents',
      count: transactionDocs.length,
      missingCount: totalMissingCount,
      subRows: buildTransactionStageRows(
        transactionDocs,
        toLeafRow,
        missingDocs,
      ),
    });
  }

  if (capTableDocs.length > 0) {
    rows.push({
      id: 'category-cap-table',
      isCategory: true,
      categoryLabel: 'Capitalization Table',
      count: capTableDocs.length,
      subRows: sortDocumentsDescending(capTableDocs).map((doc) =>
        toLeafRow(doc, 'cap_table'),
      ),
    });
  }

  if (supplementalDocs.length > 0) {
    rows.push({
      id: 'category-supplemental',
      isCategory: true,
      categoryLabel: 'Supplemental Documents',
      count: supplementalDocs.length,
      subRows: sortDocumentsDescending(supplementalDocs).map((doc) =>
        toLeafRow(doc, 'supplemental'),
      ),
    });
  }

  return rows;
}

export function DocumentsContent({
  documents,
  companyName,
  missingDocs,
}: {
  documents: VentureDocumentRow[];
  companyName: string;
  missingDocs?: MissingDocumentInfo[];
}) {
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [preview, setPreview] = useState<{
    filePath: string;
    fileName: string;
    fileType: string | null;
  } | null>(null);
  const { toast } = useToast();

  const handleDownloadAll = async () => {
    const files = documents.flatMap((doc) =>
      (doc.files || []).map((f) => ({
        filePath: f.filePath,
        fileName: f.fileName,
      })),
    );

    if (files.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No files to download',
        description: 'There are no files available for download.',
      });
      return;
    }

    setIsDownloadingAll(true);
    try {
      const sanitizedName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
      const result = await downloadAllVentureDocuments(
        files,
        `${sanitizedName}_Documents.zip`,
      );

      if ('error' in result) {
        toast({
          variant: 'destructive',
          title: 'Download failed',
          description: result.error,
        });
        return;
      }

      const blob = new Blob([new Uint8Array(result.data)], {
        type: 'application/zip',
      });
      await handleDownload(blob, result.fileName);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description:
          'An unexpected error occurred while creating the zip file.',
      });
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const tableData = useMemo(
    () => buildDocumentTableRows(documents, missingDocs),
    [documents, missingDocs],
  );

  const columns = useMemo<ColumnDef<DocumentTableRow>[]>(
    () => [
      {
        id: 'expander',
        header: '',
        cell: ({ row }) => {
          if (!row.getCanExpand()) return null;
          return (
            <button
              onClick={row.getToggleExpandedHandler()}
              className="p-0.5 text-muted-foreground"
            >
              {row.getIsExpanded() ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          );
        },
        meta: { className: 'w-10' },
      },
      {
        accessorKey: 'name',
        header: 'Document',
        cell: ({ row }) => {
          const data = row.original;
          if (data.isCategory) {
            return (
              <div className="font-medium flex items-center gap-2 text-sm">
                <span>{data.categoryLabel}</span>
                <Badge variant="secondary" className="text-xs">
                  {data.count}
                </Badge>
                {(data.missingCount ?? 0) > 0 && (
                  <Badge
                    size="sm"
                    className="gap-0.5 border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {data.missingCount} missing
                  </Badge>
                )}
              </div>
            );
          }
          if (data.isStage) {
            return (
              <div className="font-medium flex items-center gap-2 pl-4 text-sm">
                <span>{data.stageLabel}</span>
                <Badge variant="secondary" className="text-xs">
                  {data.count}
                </Badge>
                {(data.missingCount ?? 0) > 0 && (
                  <Badge
                    size="sm"
                    className="gap-0.5 border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {data.missingCount} missing
                  </Badge>
                )}
              </div>
            );
          }
          if (data.isMissing) {
            return (
              <div
                className={cn(
                  'flex items-center gap-2 text-sm text-red-700 dark:text-red-400',
                  row.depth > 1 ? 'pl-8' : 'pl-4',
                )}
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="font-medium">{data.name}</span>
                <Badge
                  size="xs"
                  className="border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
                >
                  MISSING
                </Badge>
              </div>
            );
          }
          return (
            <div
              className={cn(
                'flex items-center gap-2 text-sm',
                row.depth > 1 ? 'pl-8' : 'pl-4',
              )}
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{data.name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'date',
        header: 'Year',
        cell: ({ row }) => {
          if (
            row.original.isCategory ||
            row.original.isStage ||
            row.original.isMissing
          )
            return null;
          const raw = row.original.year;
          if (!raw) return <span className="text-sm">—</span>;
          return (
            <span className="font-sans-neue text-sm tabular-nums">{raw}</span>
          );
        },
        meta: { className: 'w-32' },
      },
      {
        accessorKey: 'documentType',
        header: 'Type',
        cell: ({ row }) => {
          if (row.original.isCategory || row.original.isStage) return null;
          if (row.original.isMissing) {
            return <span className="text-sm">{row.original.documentType}</span>;
          }
          return <span className="text-sm">{row.original.documentType}</span>;
        },
        meta: { className: 'w-1/4' },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          if (row.original.isMissing) {
            return (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-primary"
                asChild
              >
                <a href="/investor/documents?upload=true">
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </a>
              </Button>
            );
          }
          if (row.original.isCategory || row.original.isStage) return null;
          const files = row.original.files;
          if (!files || files.length === 0) return null;

          const handleDocDownload = async (e: React.MouseEvent) => {
            e.stopPropagation();
            const filePath = files[0]?.filePath;
            if (!filePath) return;

            const signedUrl = await getVentureDocumentSignedUrl(filePath);
            if (signedUrl) {
              window.open(signedUrl, '_blank', 'noopener,noreferrer');
            }
          };

          return (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDocDownload}
            >
              <Download className="h-4 w-4 text-muted-foreground" />
            </Button>
          );
        },
        meta: { className: 'w-16' },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  if (documents.length === 0 && (!missingDocs || missingDocs.length === 0)) {
    return (
      <TabEmptyState title="Documents">
        No documents available for this company.
      </TabEmptyState>
    );
  }

  return (
    <div className="space-y-12 pb-12">
      <DocumentPreviewSheet
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        filePath={preview?.filePath ?? null}
        fileName={preview?.fileName}
        fileType={preview?.fileType}
      />
      <TabHeader
        title="Documents"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadAll}
            disabled={isDownloadingAll || documents.length === 0}
          >
            <Download className="h-4 w-4" />
            {isDownloadingAll
              ? 'Downloading...'
              : `Download All (${documents.length})`}
          </Button>
        }
      />
      <div className="overflow-hidden rounded border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as
                    | { className?: string }
                    | undefined;
                  return (
                    <TableHead
                      key={header.id}
                      className={meta?.className || ''}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const isCategory = row.original.isCategory;
                const isStage = row.original.isStage;
                const isMissing = row.original.isMissing;
                const firstFile = row.original.files?.[0];
                const canPreview =
                  !isCategory &&
                  !isStage &&
                  !isMissing &&
                  !!firstFile?.filePath;
                return (
                  <TableRow
                    key={row.id}
                    onClick={
                      canPreview
                        ? () =>
                            setPreview({
                              filePath: firstFile!.filePath,
                              fileName:
                                row.original.name ?? firstFile!.fileName,
                              fileType: firstFile!.fileType ?? null,
                            })
                        : undefined
                    }
                    className={cn(
                      isCategory && 'font-medium bg-card',
                      isStage && 'bg-muted/30',
                      isMissing && 'bg-destructive/5',
                      !isCategory && !isStage && !isMissing && 'bg-background',
                      'hover:bg-muted/20',
                      canPreview && 'cursor-pointer',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        | { className?: string }
                        | undefined;
                      return (
                        <TableCell
                          key={cell.id}
                          className={meta?.className || ''}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No documents found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
