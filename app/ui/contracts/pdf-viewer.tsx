'use client';
import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { Page } from 'react-pdf';
import { MinusIcon, PlusIcon, SizeIcon } from '@radix-ui/react-icons';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import 'react-pdf/dist/Page/TextLayer.css';
import '@/app/ui/pdf-viewer.css';
import { usePdfVisibility } from './togglePdf';
import PdfDocument from '@/components/pdf/PdfDocument';
import {
  ROTATION_STEP,
  normalizeRotation,
  readPageOrientations,
  resolvePageRotation,
  type PageOrientation,
  type PdfDocumentProxy,
} from '@/components/pdf/page-rotation';

interface ZoomControlsProps {
  scale: number;
  setScale: (scale: number) => void;
  onExpand?: () => void;
  onRotate?: () => void;
  expanded?: boolean;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({
  scale,
  setScale,
  onExpand,
  onRotate,
  expanded = false,
}) => {
  const handleZoomIn = () => setScale(Math.min(scale + 0.1, 3));
  const handleZoomOut = () => setScale(Math.max(scale - 0.1, 1));
  const handleReset = () => setScale(1);

  return (
    <div
      className={cn(
        'flex h-10 justify-between border-b bg-background',
        expanded && 'fixed left-0 right-0 top-0 z-[60] items-center shadow-sm',
      )}
    >
      <div className="flex items-center">
        <Button
          variant="ghost"
          onClick={handleZoomOut}
          className="h-10 w-10 rounded-none border-r p-0 text-muted-foreground dark:hover:bg-accent/30 dark:hover:text-accent-foreground"
          disabled={scale === 1}
        >
          <MinusIcon width={16} height={16} />
        </Button>
        <span className="px-3 font-label text-xs text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          onClick={handleZoomIn}
          className="h-10 w-10 rounded-none border-l p-0 text-muted-foreground dark:hover:bg-accent/30 dark:hover:text-accent-foreground"
        >
          <PlusIcon width={16} height={16} />
        </Button>
        <Button
          variant="ghost"
          onClick={handleReset}
          className="h-10 rounded-sm border-l border-r px-3 font-label text-xs text-muted-foreground dark:hover:bg-accent/30 dark:hover:text-accent-foreground"
        >
          Reset
        </Button>
        {onRotate && (
          <Button
            variant="ghost"
            onClick={onRotate}
            title="Rotate 90° clockwise"
            aria-label="Rotate 90° clockwise"
            className="h-10 w-10 rounded-none border-r p-0 text-muted-foreground dark:hover:bg-accent/30 dark:hover:text-accent-foreground"
          >
            <RotateCw width={16} height={16} />
          </Button>
        )}
      </div>
      {onExpand && (
        <Button
          variant="ghost"
          onClick={onExpand}
          className="h-10 w-10 rounded-none border-l p-0 text-muted-foreground dark:hover:bg-accent/30 dark:hover:text-accent-foreground"
        >
          <SizeIcon width={16} height={16} />
        </Button>
      )}
    </div>
  );
};

interface PDFContentProps {
  file: string | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  pdfWidth: number;
  scale?: number;
  isPdfOpen?: boolean;
  className?: string;
  isFullScreen?: boolean;
  userRotation?: number;
}

const PDFContent = memo(function PDFContent({
  file,
  containerRef,
  pdfWidth,
  scale = 1,
  isPdfOpen = true,
  className,
  isFullScreen = false,
  userRotation = 0,
}: PDFContentProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set());
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [orientations, setOrientations] = useState<
    Record<number, PageOrientation>
  >({});

  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = () => {
      if (containerRef.current) {
        if (isFullScreen) {
          // Use fixed width for fullscreen
          setContainerWidth(1000);
        } else {
          // Use container-based width for split view
          setContainerWidth(
            Math.min(containerRef.current.clientWidth * pdfWidth, 2000),
          );
        }
      }
    };

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(containerRef.current);
    updateWidth();

    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
  }, [containerRef, pdfWidth, isFullScreen]);

  // Orientation is read before numPages is published so pages mount already
  // rotated; setting it afterwards would render every landscape page upright
  // for a frame and then spin it.
  const handleDocumentLoadSuccess = async (pdf: PdfDocumentProxy) => {
    setOrientations(await readPageOrientations(pdf));
    setNumPages(pdf.numPages);
  };

  const handlePageLoad = (pageNumber: number) => {
    setLoadedPages((prev) => {
      const newSet = new Set(prev);
      newSet.add(pageNumber);
      return newSet;
    });
  };

  const isAllPagesLoaded = loadedPages.size === numPages && numPages > 0;

  return (
    <div
      className={cn(
        'pt-4 transition-opacity duration-300',
        isAllPagesLoaded && isPdfOpen ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      <PdfDocument
        file={file}
        onLoadSuccess={handleDocumentLoadSuccess}
        loading={
          <div className="h-32 w-full animate-pulse rounded-md bg-neutral-100" />
        }
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={`page_${i + 1}`}
            pageNumber={i + 1}
            width={containerWidth * scale}
            rotate={resolvePageRotation(orientations[i + 1], userRotation)}
            renderAnnotationLayer={false}
            onLoadSuccess={() => handlePageLoad(i + 1)}
            loading={
              <div className="h-[800px] w-full animate-pulse rounded-md bg-neutral-100" />
            }
            className="pdf-page my-3 shadow-md"
            onClick={(e) => e.stopPropagation()}
            renderTextLayer={true}
            customTextRenderer={({ str }) => str}
          />
        ))}
      </PdfDocument>
    </div>
  );
});

interface PDFViewerProps {
  file: string | null;
  pdfWidth: number;
  contractPaneStyles?: string;
}

const PDFViewer = memo(function PDFViewer({
  file,
  pdfWidth,
  contractPaneStyles = '',
}: PDFViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [splitScale, setSplitScale] = useState(1);
  const [fullScreenScale, setFullScreenScale] = useState(1);
  // Manual override on top of the automatic landscape rotation, shared by the
  // split and fullscreen panes so expanding keeps the orientation the user set.
  const [userRotation, setUserRotation] = useState(0);
  const context = usePdfVisibility();

  if (!context) {
    throw new Error(
      'usePdfVisibility must be used within a PdfVisibilityProvider',
    );
  }

  const {
    isPdfOpen,
    selectedBlockId,
    setSelectedBlockId,
    selectedCitationContent,
    setSelectedCitationContent,
  } = context;
  const containerRef = useRef<HTMLDivElement>(null);
  const fullScreenRef = useRef<HTMLDivElement>(null);
  const [isMouseOver, setIsMouseOver] = useState(false);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY * -0.01;
        if (isExpanded) {
          setFullScreenScale((prev) => Math.min(Math.max(prev + delta, 1), 3));
        } else if (isMouseOver) {
          setSplitScale((prev) => Math.min(Math.max(prev + delta, 1), 3));
        }
      }
    },
    [isExpanded, isMouseOver],
  );

  useEffect(() => {
    if (isExpanded || isMouseOver) {
      document.addEventListener('wheel', handleWheel, { passive: false });
      return () => document.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel, isExpanded, isMouseOver]);

  useEffect(() => {
    setUserRotation(0);
  }, [file]);

  const handleRotate = useCallback(
    () => setUserRotation((prev) => normalizeRotation(prev + ROTATION_STEP)),
    [],
  );

  const handleExpand = () => {
    setIsExpanded(true);
    setFullScreenScale(1);
  };

  const handleCollapse = () => {
    setIsExpanded(false);
  };

  if (!isPdfOpen) return null;

  return (
    <>
      <div
        id="contractPane"
        className={cn(
          'relative h-[calc(100vh-3.5rem)] w-1/2 shrink-0 bg-gray-700/20',
          contractPaneStyles,
        )}
        onMouseEnter={() => setIsMouseOver(true)}
        onMouseLeave={() => setIsMouseOver(false)}
      >
        <ZoomControls
          scale={splitScale}
          setScale={setSplitScale}
          onExpand={handleExpand}
          onRotate={handleRotate}
        />
        <div className="scrollbar-track-gray/20 scrollbar-thumb-gray absolute bottom-0 left-0 right-0 top-10 overflow-y-auto scrollbar-thin">
          <div ref={containerRef}>
            <PDFContent
              file={file}
              containerRef={containerRef}
              pdfWidth={pdfWidth}
              scale={splitScale}
              isPdfOpen={isPdfOpen}
              className="min-h-full"
              isFullScreen={false}
              userRotation={userRotation}
            />
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="absolute inset-0 bg-gray-700/95"
            onClick={handleCollapse}
          />
          <ZoomControls
            scale={fullScreenScale}
            setScale={setFullScreenScale}
            onExpand={handleCollapse}
            onRotate={handleRotate}
            expanded={true}
          />
          <div
            className="absolute inset-0 mt-10 overflow-auto"
            onClick={handleCollapse}
          >
            <div className="flex min-h-full items-center justify-center">
              <div ref={fullScreenRef} className="py-4">
                <PDFContent
                  file={file}
                  containerRef={fullScreenRef}
                  pdfWidth={pdfWidth}
                  scale={fullScreenScale}
                  isPdfOpen={isPdfOpen}
                  isFullScreen={true}
                  userRotation={userRotation}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default PDFViewer;
