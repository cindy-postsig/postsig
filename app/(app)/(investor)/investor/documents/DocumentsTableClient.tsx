'use client';

import React, {
  useState,
  useRef,
  useMemo,
  useTransition,
  useCallback,
} from 'react';
import Link from 'next/link';
import {
  useQueryStates,
  parseAsString,
  parseAsStringLiteral,
  parseAsArrayOf,
} from 'nuqs';
import { Search, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { STAMINA_NOTE } from '@/components/documents/UploadQueueShell';
import VendorIcon from '@/components/vendors/VendorIcon';
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
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  SortingState,
  useReactTable,
  ColumnFiltersState,
} from '@tanstack/react-table';
import { ColumnHeader } from '@/components/contracts/ColumnHeader';
import { MultiSelectFilter } from '@/components/ui/data-table/components/MultiSelectFilter';
import { TablePagination } from '@/components/ui/data-table/components/TablePagination';
import { useQueryClient } from '@tanstack/react-query';
import { useVentureDocuments } from '@/hooks/api/useVentureDocuments';
import {
  MODULE_ARCHIVES_QUERY_KEYS,
  useModuleArchives,
} from '@/hooks/api/useModuleArchives';
import {
  DocumentsUploadCard,
  type UploadingDocument,
  type DocumentsUploadCardHandle,
} from './DocumentsUploadCard';
import { AumniUploadCard, type AumniUploadCardHandle } from './AumniUploadCard';
import {
  isActive as isAumniActive,
  getSnapshot as getAumniSnapshot,
} from '@/app/(app)/(investor)/investor/documents/aumni-upload-manager';
import { ArchivesTable } from './ArchivesTable';
import { DocumentPreviewSheet } from './DocumentPreviewSheet';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/app/(app)/(investor)/investor/components/tabs';
import type { ModuleArchiveRow } from '@/app/api/v2/types/api';
import type { VentureDocumentRow } from '@/lib/v2/investor/service';
import type { VentureDocument, VentureDocumentStatus } from '../types';
import { getVentureDocumentSignedUrl } from '@/app/lib/actions/investor/export';
import { useToast } from '@/components/ui/use-toast';
import {
  nameColumn,
  dateColumn,
  personColumn,
  statusColumn,
} from '@/components/documents/document-columns';
import {
  DocumentStatusBadge,
  type DocumentStatusCategory,
} from '@/components/documents/DocumentStatusBadge';
import _ from 'lodash';

function DownloadButton({ filePath }: { filePath: string }) {
  const { toast } = useToast();

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!filePath) return;

    const signedUrl = await getVentureDocumentSignedUrl(filePath);
    if (signedUrl) {
      window.open(signedUrl, '_blank');
    } else {
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description:
          'Could not generate download link. The file may not exist.',
      });
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={handleDownload}
    >
      <Download className="h-4 w-4 text-muted-foreground" />
    </Button>
  );
}

const STATUS_CATEGORY_MAP: Record<
  VentureDocumentStatus,
  DocumentStatusCategory
> = {
  PROCESSING: 'processing',
  COMPLETE: 'complete',
  FAILED: 'failed',
  INVALID: 'invalid',
  UPLOADED: 'uploaded',
};

function createColumns(
  isInvestorTrial: boolean,
  publishedCompanyIds: Set<string>,
  hidePortfolio: boolean,
): ColumnDef<VentureDocument>[] {
  return [
    nameColumn<VentureDocument>(),
    {
      accessorKey: 'documentType',
      header: ({ column }) => <ColumnHeader column={column} title="Type" />,
      cell: ({ row }) => {
        const docType = row.original.documentType;

        if (!docType || docType === 'Unknown') {
          return <span className="text-muted-foreground">--</span>;
        }
        return (
          <Badge variant="outline" className="font-normal text-xs">
            {docType}
          </Badge>
        );
      },
    },
    {
      ...statusColumn<VentureDocument>((r) => ({
        label: r.status,
        category: STATUS_CATEGORY_MAP[r.status],
        failureMessage: r.failureInfo?.message,
      })),
      accessorKey: 'status',
      cell: ({ row }) => {
        const status = row.original.status;
        const category = STATUS_CATEGORY_MAP[status];
        const failureMessage = row.original.failureInfo?.message;

        return (
          <DocumentStatusBadge
            label={status}
            category={category}
            failureMessage={failureMessage}
          />
        );
      },
      filterFn: (row, id, value: string[]) => {
        if (!value || value.length === 0) return true;
        return value.includes(row.getValue(id));
      },
    },
    {
      ...dateColumn<VentureDocument>((r) => r.submittedOn, {
        header: 'Submitted on',
      }),
      id: 'submittedOn',
      accessorKey: 'submittedOn',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Submitted on" />
      ),
      sortingFn: (rowA, rowB) => {
        const dateA = new Date(rowA.original.submittedOn).getTime();
        const dateB = new Date(rowB.original.submittedOn).getTime();
        return dateB - dateA;
      },
    },
    {
      ...personColumn<VentureDocument>((r) => r.submittedBy, {
        header: 'Submitted by',
      }),
      id: 'submittedBy',
      accessorKey: 'submittedBy',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Submitted by" />
      ),
      filterFn: (row, id, value: string[]) => {
        if (!value || value.length === 0) return true;
        return value.includes(row.getValue(id));
      },
    },
    {
      accessorKey: 'investment',
      header: ({ column }) => (
        <ColumnHeader column={column} title="Investment" />
      ),
      size: 300,
      cell: ({ row }) => {
        const investment = row.original.investment;

        if (!investment) {
          return <span className="text-muted-foreground">--</span>;
        }

        const hasLink =
          Boolean(investment.id) &&
          !isInvestorTrial &&
          !hidePortfolio &&
          publishedCompanyIds.has(investment.id);

        return (
          <div className="flex items-center gap-2">
            {hasLink ? (
              <Link
                href={`/investor/company/${investment.id}`}
                className="flex items-center"
                onClick={(e) => e.stopPropagation()}
              >
                <VendorIcon
                  name={investment.name}
                  domain={investment.domain}
                  width={28}
                  height={28}
                />
              </Link>
            ) : (
              <VendorIcon
                name={investment.name}
                domain={investment.domain}
                width={28}
                height={28}
              />
            )}
            {hasLink ? (
              <Link
                href={`/investor/company/${investment.id}`}
                className="font-medium text-sm leading-tight underline-offset-2 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {investment.name}
              </Link>
            ) : (
              <span className="font-medium text-sm">{investment.name}</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'download',
      header: '',
      cell: ({ row }) => {
        const isOptimistic = row.original.id.startsWith('optimistic-');
        const files = row.original.files;

        if (isOptimistic || !files || files.length === 0) {
          return null;
        }

        const filePath = files[0]?.filePath;
        if (!filePath) return null;

        return <DownloadButton filePath={filePath} />;
      },
      meta: { className: 'w-12' },
    },
  ];
}

interface DocumentsTableClientProps {
  initialData: VentureDocumentRow[];
  initialArchives?: ModuleArchiveRow[];
  organizationId?: string;
  userName?: string;
  isInvestorTrial?: boolean;
  hidePortfolio?: boolean;
}

type UploadMode = 'documents' | 'aumni';

export function DocumentsTableClient({
  initialData,
  initialArchives,
  organizationId,
  userName,
  isInvestorTrial = false,
  hidePortfolio = false,
}: DocumentsTableClientProps) {
  const [isPending, startTransition] = useTransition();
  const [uploadingDocs, setUploadingDocs] = useState<UploadingDocument[]>([]);
  const [shouldPoll, setShouldPoll] = useState(false);
  const [uploadMode, setUploadMode] = useState<UploadMode>('documents');
  const [hasAumniImport, setHasAumniImport] = useState(false);
  const [preview, setPreview] = useState<{
    filePath: string;
    fileName: string;
    fileType: string | null;
  } | null>(null);
  const uploadCardRef = useRef<DocumentsUploadCardHandle>(null);
  const aumniCardRef = useRef<AumniUploadCardHandle>(null);
  const queryClient = useQueryClient();

  const TERMINAL_STATUSES: VentureDocumentStatus[] = [
    'COMPLETE',
    'FAILED',
    'INVALID',
  ];

  const { data: documentsData } = useVentureDocuments(initialData, {
    refetchInterval: shouldPoll ? 2000 : false,
  });
  const documents = documentsData?.documents ?? initialData;
  const documentStatusOptions = useMemo(() => {
    return Array.from(new Set(documents.map((doc) => doc.status)));
  }, [documents])
    .map((status) => ({
      value: status as VentureDocumentStatus,
      label: _.capitalize(status as string),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const { data: archivesData } = useModuleArchives('investor', initialArchives);
  const archives = archivesData?.archives ?? initialArchives ?? [];

  React.useEffect(() => {
    const hasInProgressDocs = documents.some(
      (doc) => !TERMINAL_STATUSES.includes(doc.status),
    );
    const hasUploadingDocs = uploadingDocs.some(
      (doc) => doc.status !== 'error',
    );
    setShouldPoll(hasInProgressDocs || hasUploadingDocs);
  }, [uploadingDocs, documents]);

  const [filterParams, setFilterParams] = useQueryStates(
    {
      mode: parseAsString,
      status: parseAsArrayOf(parseAsString).withDefault([]),
      submittedBy: parseAsArrayOf(parseAsString).withDefault([]),
      tab: parseAsStringLiteral(['documents', 'archives'] as const).withDefault(
        'documents',
      ),
    },
    {
      history: 'replace',
      shallow: true,
      startTransition,
    },
  );

  // Sync URL `mode` with state — only track Aumni; documents is default.
  React.useEffect(() => {
    if (uploadMode === 'aumni' && filterParams.mode !== 'aumni') {
      setFilterParams({ mode: 'aumni' });
    } else if (uploadMode === 'documents' && filterParams.mode === 'aumni') {
      setFilterParams({ mode: null });
    }
  }, [uploadMode, filterParams.mode, setFilterParams]);

  React.useEffect(() => {
    if (filterParams.mode === 'documents' || filterParams.mode === 'aumni') {
      setUploadMode(filterParams.mode);
    } else {
      const snap = getAumniSnapshot();
      if (isAumniActive() || snap.status === 'error') {
        setUploadMode('aumni');
      }
    }
  }, []);

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'submittedOn', desc: false },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const submittedByOptions = useMemo(() => {
    const submitterSet = new Set<string>();
    documents.forEach((doc) => {
      if (doc.submittedBy) {
        submitterSet.add(doc.submittedBy);
      }
    });
    return Array.from(submitterSet)
      .sort()
      .map((name) => ({ value: name, label: name }));
  }, [documents]);

  const tableData = useMemo(() => {
    const realDocNames = new Set(documents.map((d) => d.name?.toLowerCase()));

    const pendingOptimisticDocs = uploadingDocs.filter(
      (doc) =>
        doc.status === 'uploaded' &&
        !realDocNames.has(doc.fileName.toLowerCase()),
    );

    const optimisticDocs: VentureDocument[] = pendingOptimisticDocs
      .map((doc) => ({
        id: `optimistic-${doc.id}`,
        name: doc.fileName,
        submittedOn: new Date().toISOString(),
        submittedBy: userName || 'You',
        status: 'UPLOADED' as const,
        investment: null,
        documentType: 'Unknown',
      }))
      .reverse();

    return [...optimisticDocs, ...documents];
  }, [documents, uploadingDocs, userName]);

  const customGlobalFilter = (
    row: { original: VentureDocument },
    columnId: string,
    value: string,
  ) => {
    const search = value.toLowerCase();
    const rowData = row.original as VentureDocument;

    if (rowData.name?.toLowerCase().includes(search)) return true;
    if (rowData.investment?.name?.toLowerCase().includes(search)) return true;

    return false;
  };

  const publishedCompanyIds = useMemo(() => {
    const ids = new Set<string>();
    documents.forEach((doc) => {
      if (doc.isPublished && doc.investment?.id) {
        ids.add(doc.investment.id);
      }
    });
    return ids;
  }, [documents]);

  const columns = useMemo(
    () => createColumns(isInvestorTrial, publishedCompanyIds, hidePortfolio),
    [isInvestorTrial, publishedCompanyIds, hidePortfolio],
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: customGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // Upload progress and status polling replace `data` every few seconds;
    // the default reset would bounce the user back to page 1 mid-browse.
    autoResetPageIndex: false,
    initialState: {
      pagination: { pageSize: 50 },
    },
  });

  // A refresh can drop the row that made the last page (e.g. an optimistic
  // upload that errored); with the auto-reset off, clamp so the user is not
  // left on an empty page with the pagination bar hidden.
  const pageCount = table.getPageCount();
  const { pageIndex } = table.getState().pagination;
  React.useEffect(() => {
    if (pageIndex > 0 && pageIndex >= pageCount) {
      table.setPageIndex(Math.max(0, pageCount - 1));
    }
  }, [table, pageIndex, pageCount]);

  React.useEffect(() => {
    if (isPending) return;

    table.getColumn('status')?.setFilterValue(undefined);
    table.getColumn('submittedBy')?.setFilterValue(undefined);

    if (filterParams.status && filterParams.status.length > 0) {
      table.getColumn('status')?.setFilterValue(filterParams.status);
    }

    if (filterParams.submittedBy && filterParams.submittedBy.length > 0) {
      table.getColumn('submittedBy')?.setFilterValue(filterParams.submittedBy);
    }
  }, [table, filterParams, isPending]);

  const handleSearchChange = (value: string) => {
    setGlobalFilter(value);
    table.resetPageIndex();
  };

  const handleStatusFilterChange = (values: string[]) => {
    setFilterParams({ status: values.length === 0 ? null : values });
    table.resetPageIndex();
  };

  const handleSubmittedByFilterChange = (values: string[]) => {
    setFilterParams({ submittedBy: values.length === 0 ? null : values });
    table.resetPageIndex();
  };

  const handleClearAllFilters = () => {
    setFilterParams({
      status: null,
      submittedBy: null,
    });
    setGlobalFilter('');
    table.resetPageIndex();
  };

  const hasActiveFilters = useMemo(() => {
    return (
      (filterParams.status && filterParams.status.length > 0) ||
      (filterParams.submittedBy && filterParams.submittedBy.length > 0) ||
      globalFilter.length > 0
    );
  }, [filterParams, globalFilter]);

  const hasProcessingDocuments = tableData.some(
    (doc) => doc.status === 'PROCESSING',
  );

  React.useEffect(() => {
    if (!hasProcessingDocuments) {
      setHasAumniImport(false);
    }
  }, [hasProcessingDocuments]);

  const hasUploadingDocs =
    uploadingDocs.filter((doc) => doc.status !== 'error').length > 0;
  const isEmptyState = documents.length === 0 && !hasUploadingDocs;

  const handleUploadStart = useCallback((doc: UploadingDocument) => {
    setUploadingDocs((prev) => [...prev, doc]);
  }, []);

  const handleUploadProgress = useCallback(
    (id: string, data: Partial<UploadingDocument>) => {
      setUploadingDocs((prev) =>
        prev.map((doc) => (doc.id === id ? { ...doc, ...data } : doc)),
      );
    },
    [],
  );

  const handleUploadComplete = useCallback(
    (id: string, data: UploadingDocument) => {
      setUploadingDocs((prev) => {
        const next = prev.map((doc) =>
          doc.id === id ? { ...doc, ...data } : doc,
        );

        const isZip = data.fileName?.toLowerCase().endsWith('.zip');
        if (data.status === 'uploaded' && isZip) {
          queryClient.invalidateQueries({
            queryKey: MODULE_ARCHIVES_QUERY_KEYS.list('investor'),
          });
        }

        return next;
      });
    },
    [queryClient],
  );

  const handleImportFromAumni = useCallback(() => {
    uploadCardRef.current?.clear();
    aumniCardRef.current?.clear();
    setUploadMode('aumni');
    setFilterParams({ mode: 'aumni' });
  }, [setFilterParams]);

  const handleCancelUpload = useCallback(() => {
    aumniCardRef.current?.clear();
    setUploadMode('documents');
    setFilterParams({ mode: null });
  }, [setFilterParams]);

  React.useEffect(() => {
    if (uploadingDocs.length === 0) return;

    const realDocNames = new Set(documents.map((d) => d.name?.toLowerCase()));
    const hasInProgressRealDocs = documents.some(
      (doc) => !TERMINAL_STATUSES.includes(doc.status),
    );

    const remainingOptimistic = uploadingDocs.filter((doc) => {
      if (doc.status === 'error') return false;
      const isZip = doc.fileName.toLowerCase().endsWith('.zip');
      if (isZip) return hasInProgressRealDocs;
      return !realDocNames.has(doc.fileName.toLowerCase());
    });

    if (remainingOptimistic.length < uploadingDocs.length) {
      setUploadingDocs(remainingOptimistic);
    }
  }, [documents, uploadingDocs]);

  const showTableUI = !isEmptyState;

  const pageHeader = isEmptyState ? 'Document Upload' : 'Documents';

  return (
    <div className="relative">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-normal">{pageHeader}</h1>
        <div className="flex items-center gap-2">
          {uploadMode === 'aumni' ? (
            <Button variant="ghost" onClick={handleCancelUpload}>
              Cancel
            </Button>
          ) : (
            <Button variant="outline" onClick={handleImportFromAumni}>
              Import from Aumni
            </Button>
          )}
        </div>
      </div>

      <div className={uploadMode === 'documents' ? 'mb-6' : 'hidden'}>
        <DocumentsUploadCard
          ref={uploadCardRef}
          onUploadStart={handleUploadStart}
          onUploadProgress={handleUploadProgress}
          onUploadComplete={handleUploadComplete}
          onFilesAdded={() => {}}
          organizationId={organizationId || ''}
          isActive={uploadMode === 'documents'}
        />
      </div>

      <div className={uploadMode === 'aumni' ? 'mb-6' : 'hidden'}>
        <AumniUploadCard
          ref={aumniCardRef}
          onUploadComplete={() => {
            setHasAumniImport(true);
            queryClient.invalidateQueries({
              queryKey: MODULE_ARCHIVES_QUERY_KEYS.list('investor'),
            });
          }}
          organizationId={organizationId || ''}
          isActive={uploadMode === 'aumni'}
        />
      </div>

      <Alert variant="info" className="mb-6">
        <AlertDescription>{STAMINA_NOTE}</AlertDescription>
      </Alert>

      {showTableUI && hasProcessingDocuments && (
        <Alert variant="info" className="mb-4">
          <AlertDescription>
            {hasAumniImport ? (
              <>
                Documents from your Aumni export will take time to process. We
                will email you when processing is complete. If your zip file
                included any Aumni metadata, like a Workspace file, it can be
                viewed in the{' '}
                <Link
                  href="/portfolio"
                  className="font-medium underline underline-offset-2"
                >
                  Portfolio page
                </Link>
                .
              </>
            ) : (
              'Your documents are processing. You will be notified when they are ready.'
            )}
          </AlertDescription>
        </Alert>
      )}

      {showTableUI && (
        <Tabs
          value={filterParams.tab}
          onValueChange={(value) =>
            setFilterParams({ tab: value as 'documents' | 'archives' })
          }
          className="w-full"
        >
          <TabsList variant="line" className="mb-4">
            <TabsTrigger value="documents">
              Documents
              {tableData.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {tableData.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="archives">
              Archives
              {archives.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  {archives.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents">
            <div className="mb-4 flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search company or file"
                  value={globalFilter}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="h-8 w-[240px] pl-8 text-sm"
                />
              </div>

              <div className="min-w-[140px]">
                <MultiSelectFilter
                  options={documentStatusOptions}
                  value={filterParams.status || []}
                  onValueChange={handleStatusFilterChange}
                  placeholder="All Status"
                />
              </div>

              <div className="min-w-[160px]">
                <MultiSelectFilter
                  options={submittedByOptions}
                  value={filterParams.submittedBy || []}
                  onValueChange={handleSubmittedByFilterChange}
                  placeholder="All Submitters"
                  disabled={submittedByOptions.length === 0}
                />
              </div>

              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAllFilters}
                  className="h-8"
                >
                  Reset
                </Button>
              )}

              <div className="ml-auto pr-2 text-xs text-muted-foreground">
                {table.getFilteredRowModel().rows.length} documents
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => {
                      const doc = row.original;
                      const firstFile = doc.files?.[0];
                      const isOptimistic = doc.id.startsWith('optimistic-');
                      const canPreview = !isOptimistic && !!firstFile?.filePath;
                      return (
                        <TableRow
                          key={row.id}
                          onClick={
                            canPreview
                              ? () =>
                                  setPreview({
                                    filePath: firstFile!.filePath,
                                    fileName: doc.name,
                                    fileType: firstFile!.fileType ?? null,
                                  })
                              : undefined
                          }
                          className={canPreview ? 'cursor-pointer' : undefined}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )}
                            </TableCell>
                          ))}
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

            <TablePagination table={table} hideWhenSinglePage />
          </TabsContent>

          <TabsContent value="archives">
            <ArchivesTable archives={archives} />
          </TabsContent>
        </Tabs>
      )}

      <DocumentPreviewSheet
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        filePath={preview?.filePath ?? null}
        fileName={preview?.fileName}
        fileType={preview?.fileType}
      />
    </div>
  );
}
