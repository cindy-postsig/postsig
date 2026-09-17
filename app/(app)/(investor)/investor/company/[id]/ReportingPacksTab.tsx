'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getVentureDocumentSignedUrl } from '@/app/lib/actions/investor/export';
import { DocumentPreviewSheet } from '@/app/(app)/(investor)/investor/documents/DocumentPreviewSheet';
import { SubTabEmpty } from './companyDetailsPrimitives';
import type { ReportingDocument, ReportingQuarter } from '@/lib/v2/kpis/types';

export function ReportingPacksTab({
  docQuarters,
}: {
  docQuarters: ReportingQuarter[];
}) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<{
    filePath: string;
    fileName: string;
    fileType: string | null;
  } | null>(null);

  const [collapsedPacks, setCollapsedPacks] = useState<Set<number>>(
    () => new Set(docQuarters.map((q) => q.packId)),
  );
  const togglePack = (packId: number) =>
    setCollapsedPacks((prev) => {
      const next = new Set(prev);
      next.has(packId) ? next.delete(packId) : next.add(packId);
      return next;
    });

  const handleDocDownload = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    const signedUrl = await getVentureDocumentSignedUrl(filePath);
    if (signedUrl) {
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } else {
      toast({
        variant: 'destructive',
        title: 'Could not download document',
        description: 'Something went wrong. Please try again.',
      });
    }
  };

  const openPreview = (doc: ReportingDocument) =>
    setPreview({
      filePath: doc.filePath,
      fileName: doc.fileName,
      fileType: doc.fileType,
    });

  if (docQuarters.length === 0) {
    return (
      <SubTabEmpty>
        No reporting packs submitted yet. Use Request to ask this company for
        one.
      </SubTabEmpty>
    );
  }

  return (
    <>
      <DocumentPreviewSheet
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        filePath={preview?.filePath ?? null}
        fileName={preview?.fileName}
        fileType={preview?.fileType}
      />
      <div className="overflow-hidden rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Document</TableHead>
              <TableHead className="w-1/4">Type</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {docQuarters.map((q) => {
              const isExpanded = !collapsedPacks.has(q.packId);
              return (
                <React.Fragment key={q.packId}>
                  <TableRow
                    className="font-medium cursor-pointer bg-card hover:bg-muted/20"
                    onClick={() => togglePack(q.packId)}
                  >
                    <TableCell className="w-10">
                      <button
                        type="button"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        className="p-0.5 text-muted-foreground"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell colSpan={3}>
                      <span className="font-medium text-sm">
                        {q.periodLabel}
                      </span>
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {q.documents.length}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  {isExpanded &&
                    q.documents.map((doc) => (
                      <TableRow
                        key={doc.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer bg-background hover:bg-muted/20"
                        onClick={() => openPreview(doc)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openPreview(doc);
                          }
                        }}
                      >
                        <TableCell className="w-10" />
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>{doc.fileName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {doc.docType ?? doc.customDocType ?? '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => handleDocDownload(e, doc.filePath)}
                          >
                            <Download className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
