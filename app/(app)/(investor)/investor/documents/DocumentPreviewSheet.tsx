'use client';

import { useEffect, useRef, useState } from 'react';
import { Page } from 'react-pdf';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { getVentureDocumentSignedUrl } from '@/app/lib/actions/investor/export';
import PdfDocument from '@/components/pdf/PdfDocument';
import 'react-pdf/dist/Page/TextLayer.css';

interface DocumentPreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string | null;
  fileName?: string | null;
  fileType?: string | null;
}

export function DocumentPreviewSheet({
  open,
  onOpenChange,
  filePath,
  fileName,
  fileType,
}: DocumentPreviewSheetProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    if (!open || !filePath) {
      setSignedUrl(null);
      setNumPages(0);
      return;
    }

    setLoading(true);
    setNumPages(0);
    getVentureDocumentSignedUrl(filePath)
      .then((url) => {
        if (cancelled) return;
        if (url) {
          setSignedUrl(url);
        } else {
          setSignedUrl(null);
          toast({
            variant: 'destructive',
            title: 'Preview failed',
            description: 'Could not load file.',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, filePath, toast]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateWidth = () => {
      if (node.clientWidth > 0) setWidth(node.clientWidth - 32);
    };

    const ro = new ResizeObserver(updateWidth);
    ro.observe(node);
    updateWidth();
    return () => ro.disconnect();
  }, [open]);

  const isPdf =
    fileType === 'application/pdf' ||
    (fileName?.toLowerCase().endsWith('.pdf') ?? false);

  const handleOpenInNewTab = () => {
    if (signedUrl) window.open(signedUrl, '_blank');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-none md:w-1/2"
      >
        <SheetHeader className="border-b px-6 py-2">
          <div className="flex items-center justify-between gap-4 pr-8">
            <SheetTitle className="font-medium truncate text-left text-sm">
              {fileName ?? 'Preview'}
            </SheetTitle>
            {signedUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenInNewTab}
                className="font-normal flex-shrink-0 text-muted-foreground"
              >
                Open
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </div>
        </SheetHeader>

        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-gray-700/20 px-4 py-2"
        >
          {!filePath ? null : loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !signedUrl ? (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Couldn&apos;t load file.
            </p>
          ) : !isPdf ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">
                Preview isn&apos;t available for this file type.
              </p>
              <Button onClick={handleOpenInNewTab} size="sm">
                <Download className="h-4 w-4" />
                Download
              </Button>
            </div>
          ) : (
            <PdfDocument
              file={signedUrl}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              loading={
                <div className="h-64 w-full animate-pulse rounded-md bg-neutral-100" />
              }
              error={
                <p className="mt-8 text-center text-sm text-muted-foreground">
                  Failed to render PDF.
                </p>
              }
            >
              {Array.from({ length: numPages }, (_, i) => (
                <Page
                  key={`page_${i + 1}`}
                  pageNumber={i + 1}
                  width={width}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                  className="my-3 shadow-md"
                  loading={
                    <div className="my-3 h-[800px] w-full animate-pulse rounded-md bg-neutral-100" />
                  }
                />
              ))}
            </PdfDocument>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
