'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Page } from 'react-pdf';
import {
  MinusIcon,
  PlusIcon,
  SizeIcon,
  Cross2Icon,
} from '@radix-ui/react-icons';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import '@/app/ui/pdf-viewer.css';
import { usePdfVisibility } from './togglePdf';
import { useDiscussionVisibility } from './toggleDiscussion';
import { TextractBlock } from '@/app/lib/aws/textract';
import { useToast } from '@/components/ui/use-toast';
import { Citation } from '@/constants/types';
import _ from 'lodash';
import CitationsIndex from '@/components/contracts/CitationsIndex';
import PdfDocument from '@/components/pdf/PdfDocument';
import {
  ROTATION_STEP,
  normalizeRotation,
  readPageOrientations,
  resolvePageRotation,
  resolveRotationDelta,
  rotateNormalizedBox,
  type PageOrientation,
  type PdfDocumentProxy,
} from '@/components/pdf/page-rotation';

interface ZoomControlsProps {
  scale: number;
  setScale: (scale: number) => void;
  onExpand?: () => void;
  onClose?: () => void;
  onRotate?: () => void;
  expanded?: boolean;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({
  scale,
  setScale,
  onExpand,
  onClose,
  onRotate,
  expanded = false,
}) => {
  const handleZoomIn = () => setScale(Math.min(scale + 0.1, 3));
  const handleZoomOut = () => setScale(Math.max(scale - 0.1, 1));
  const handleReset = () => setScale(1);

  return (
    <div
      className={cn(
        'flex h-10 justify-end border-b bg-background',
        expanded && 'fixed left-0 right-0 top-0 z-[60] items-center shadow-sm',
      )}
    >
      {/* Zoom controls */}
      <div className="flex items-center">
        <Button
          variant="ghost"
          onClick={handleZoomOut}
          className="h-10 w-10 rounded-none border-l p-0 text-muted-foreground disabled:bg-muted dark:hover:bg-accent/30 dark:hover:text-accent-foreground"
          disabled={scale === 1}
        >
          <MinusIcon width={16} height={16} />
        </Button>
        <div className="flex h-10 items-center border-l border-r px-3 font-label text-xs text-muted-foreground">
          {Math.round(scale * 100)}%
        </div>
        <Button
          variant="ghost"
          onClick={handleZoomIn}
          disabled={scale === 3}
          className="h-10 w-10 rounded-none p-0 text-muted-foreground disabled:bg-muted dark:hover:bg-accent/30 dark:hover:text-accent-foreground"
        >
          <PlusIcon width={16} height={16} />
        </Button>
        <Button
          variant="ghost"
          onClick={handleReset}
          className="h-10 rounded-sm border-l px-3 font-label text-xs text-muted-foreground dark:hover:bg-accent/30 dark:hover:text-accent-foreground"
        >
          Reset
        </Button>
        {onRotate && (
          <Button
            variant="ghost"
            onClick={onRotate}
            title="Rotate 90° clockwise"
            aria-label="Rotate 90° clockwise"
            className="h-10 w-10 rounded-none border-l p-0 text-muted-foreground dark:hover:bg-accent/30 dark:hover:text-accent-foreground"
          >
            <RotateCw width={16} height={16} />
          </Button>
        )}
        {onExpand && (
          <Button
            variant="ghost"
            onClick={onExpand}
            className="h-10 w-10 rounded-none border-l p-0 text-muted-foreground dark:hover:bg-accent/30 dark:hover:text-accent-foreground"
          >
            <SizeIcon width={16} height={16} />
          </Button>
        )}
        {onClose && (
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-10 w-10 rounded-none border-l p-0 text-muted-foreground dark:hover:bg-accent/30 dark:hover:text-accent-foreground"
          >
            <Cross2Icon width={16} height={16} />
          </Button>
        )}
      </div>
    </div>
  );
};

interface TextBlockProps {
  block: TextractBlock;
  isSelected: boolean;
  onClick: () => void;
}

interface PDFContentProps {
  file: string | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  pdfWidth: number;
  scale?: number;
  isPdfOpen?: boolean;
  className?: string;
  isFullScreen?: boolean;
  textBlocks: TextractBlock[];
  selectedBlockId: string | null;
  selectedCitationContent: Citation['content'][number] | null;
  onPageLoad?: (pageNumber: number) => void;
  pdfViewerRef?: React.MutableRefObject<any>;
  userRotation?: number;
}

function mapTextractCoordinatesToPdfCoordinates(
  boundingBox: any,
  pdfViewport: { scale: number; width: number; height: number },
  /**
   * Extra rotation the viewer applied to this page. Textract boxes are
   * normalized against the page as pdf.js would display it, so they have to be
   * turned by the same amount or the highlight lands on the wrong edge.
   */
  rotation = 0,
) {
  // Return null if boundingBox is undefined or empty
  if (!boundingBox || _.isEmpty(boundingBox)) {
    return null;
  }

  const rotated = rotateNormalizedBox(boundingBox, rotation);

  const scaleFactor = pdfViewport.scale;
  return {
    // Added 38px and 10px are important for the highlight to be in the correct position
    left: rotated.left * 100 * scaleFactor,
    // top: boundingBox.top * 100 * scaleFactor * 1.053 -> this factor can be useful,
    top: rotated.top * 100 * scaleFactor,
    width: rotated.width * 100 * scaleFactor,
    height: rotated.height * 100 * scaleFactor,
  };
}

const PDFContent = ({
  file,
  containerRef,
  pdfWidth,
  scale = 1,
  isPdfOpen = true,
  className,
  isFullScreen = false,
  textBlocks,
  selectedBlockId,
  selectedCitationContent,
  onPageLoad,
  pdfViewerRef,
  userRotation = 0,
}: PDFContentProps) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(new Set());
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pageDimensions, setPageDimensions] = useState<
    Record<number, { width: number; height: number }>
  >({});
  const [orientations, setOrientations] = useState<
    Record<number, PageOrientation>
  >({});

  // react-pdf destroys the old PDFDocumentProxy when `file` changes. Page
  // state derived from the previous document has to go with it, or `numPages`
  // keeps rendering Page children that reach for a proxy whose worker handler
  // pdf.js has already nulled.
  useEffect(() => {
    setNumPages(0);
    setLoadedPages(new Set());
    setPageDimensions({});
    setOrientations({});
    pageRefs.current = [];
  }, [file]);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = () => {
      if (containerRef.current) {
        if (isFullScreen) {
          setContainerWidth(1000);
        } else {
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

  const highlightTextInPage = (
    citationContent: Citation['content'][number],
    pageRef: HTMLDivElement,
  ) => {
    const previousHighlight = pageRef.querySelector('.highlight-overlay');
    if (previousHighlight) {
      pageRef.removeChild(previousHighlight);
    }

    const overlayElement = document.createElement('div');
    overlayElement.className = 'highlight-overlay bg-blue-300/20';
    overlayElement.style.position = 'absolute';

    const pageNumber = citationContent.pageNumber;
    const pageSize = pageDimensions[pageNumber];

    if (pageSize) {
      const pdfViewport = {
        scale: 1,
        width: pageSize.width,
        height: pageSize.height,
      };

      if (selectedCitationContent) {
        const pdfCoordinates = mapTextractCoordinatesToPdfCoordinates(
          selectedCitationContent?.boundingBox,
          pdfViewport,
          resolveRotationDelta(orientations[pageNumber], userRotation),
        );

        if (pdfCoordinates) {
          overlayElement.style.left = `${pdfCoordinates.left}%`;
          overlayElement.style.top = `${pdfCoordinates.top}%`;
          overlayElement.style.width = `${pdfCoordinates.width}%`;
          overlayElement.style.height = `${pdfCoordinates.height}%`;

          overlayElement.style.zIndex = '10';
          overlayElement.style.pointerEvents = 'none';

          pageRef.appendChild(overlayElement);
          return overlayElement;
        }
      }
    } else {
      console.warn('Page dimensions not available for highlighting');
    }

    return null;
  };

  const handlePageRenderSuccess = (page: any) => {
    setPageDimensions((prev) => ({
      ...prev,
      [page.pageNumber]: {
        width: page.width,
        height: page.height,
      },
    }));
  };

  useEffect(() => {
    // Scroll to selected block's page and highlight it
    if (
      selectedCitationContent &&
      isPdfOpen &&
      selectedCitationContent.pageNumber
    ) {
      const pageRef = pageRefs.current[selectedCitationContent.pageNumber - 1];
      if (!pageRef) return;

      // Check if citation has bounding box for highlighting
      const hasBoundingBox =
        selectedCitationContent.boundingBox &&
        !_.isEmpty(selectedCitationContent.boundingBox);

      if (hasBoundingBox) {
        // Highlight and scroll to specific location
        const overlayElement = highlightTextInPage(
          selectedCitationContent,
          pageRef,
        );
        if (overlayElement && pdfViewerRef?.current) {
          const container = pdfViewerRef.current;
          const containerRect = container.getBoundingClientRect();
          const overlayRect = overlayElement.getBoundingClientRect();
          const scrollTop =
            overlayRect.top -
            containerRect.top +
            container.scrollTop -
            containerRect.height / 2 +
            overlayRect.height / 2;
          container.scrollTo({ top: scrollTop, behavior: 'smooth' });
        } else {
          pageRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        // No bounding box - just scroll to the page
        pageRef.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [
    textBlocks,
    isPdfOpen,
    highlightTextInPage,
    selectedCitationContent,
    pdfViewerRef,
  ]);

  // Orientation is read before numPages is published so pages mount already
  // rotated; setting it afterwards would render every landscape page upright
  // for a frame and then spin it.
  const handleDocumentLoadSuccess = async (pdf: PdfDocumentProxy) => {
    setOrientations(await readPageOrientations(pdf));
    setNumPages(pdf.numPages);
    pageRefs.current = Array(pdf.numPages).fill(null);
  };

  const handlePageLoad = (pageNumber: number) => {
    setLoadedPages((prev) => {
      const newSet = new Set(prev);
      newSet.add(pageNumber);
      return newSet;
    });

    if (onPageLoad) {
      onPageLoad(pageNumber);
    }
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
          <div
            key={`page_container_${i + 1}`}
            ref={(el) => {
              pageRefs.current[i] = el;
            }}
            className="relative"
          >
            <Page
              key={`page_${i + 1}`}
              pageNumber={i + 1}
              width={containerWidth * scale}
              rotate={resolvePageRotation(orientations[i + 1], userRotation)}
              renderAnnotationLayer={true}
              onLoadSuccess={() => handlePageLoad(i + 1)}
              onRenderSuccess={handlePageRenderSuccess}
              loading={
                <div className="h-[800px] w-full animate-pulse rounded-md bg-neutral-100" />
              }
              className="pdf-page my-3 shadow-md"
              renderTextLayer={true}
            />
          </div>
        ))}
      </PdfDocument>
    </div>
  );
};

interface EnhancedPDFViewerProps {
  file: string | null;
  pdfWidth: number;
  contractPaneStyles?: string;
  textractResponse: any;
  citations?: any[];
}

const EnhancedPDFViewer = ({
  file,
  pdfWidth,
  contractPaneStyles = '',
  textractResponse,
  citations = [],
}: EnhancedPDFViewerProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [splitScale, setSplitScale] = useState(1);
  const [fullScreenScale, setFullScreenScale] = useState(1);
  // Manual override on top of the automatic landscape rotation, shared by the
  // split and fullscreen panes so expanding keeps the orientation the user set.
  const [userRotation, setUserRotation] = useState(0);
  const context = usePdfVisibility();
  const discussionContext = useDiscussionVisibility();

  if (!context) {
    throw new Error(
      'usePdfVisibility must be used within a PdfVisibilityProvider',
    );
  }

  if (!discussionContext) {
    throw new Error(
      'useDiscussionVisibility must be used within a DiscussionVisibilityProvider',
    );
  }

  const {
    isPdfOpen,
    togglePdf,
    openPdf,
    setSelectedBlockId,
    selectedBlockId,
    selectedCitationContent,
    setSelectedCitationContent,
    selectedFieldId,
    setSelectedFieldId,
    scrollToField,
  } = context;
  const { isDiscussionOpen } = discussionContext;

  // Track which panel was last opened so it can be layered on top.
  const [activePanel, setActivePanel] = useState<'pdf' | 'discussion'>('pdf');

  useEffect(() => {
    if (isPdfOpen) setActivePanel('pdf');
  }, [isPdfOpen]);

  useEffect(() => {
    if (isDiscussionOpen) setActivePanel('discussion');
  }, [isDiscussionOpen]);

  useEffect(() => {
    if (selectedBlockId && !isPdfOpen) {
      openPdf();
      setActivePanel('pdf');
    }
  }, [selectedBlockId, isPdfOpen, openPdf]);
  const containerRef = useRef<HTMLDivElement>(null);
  const fullScreenRef = useRef<HTMLDivElement>(null);
  const [isMouseOver, setIsMouseOver] = useState(false);
  const [textBlocks, setTextBlocks] = useState<TextractBlock[]>([]);
  const pdfViewerRef = useRef<any>(null);

  // Build fields with citations from the actual citations data
  const fieldsWithCitations = useMemo(
    () =>
      citations
        .filter((citation) => citation.content && citation.content.length > 0)
        .map((citation) => ({
          fieldId: citation.id,
          displayName: citation.id
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (l: string) => l.toUpperCase()),
          citations: citation.content || [],
        })),
    [citations],
  );

  useEffect(() => {
    if (selectedBlockId) {
      const field = fieldsWithCitations.find((f) =>
        f.citations.some((c: any) => c.id === selectedBlockId),
      );
      if (field) {
        setSelectedFieldId(field.fieldId);
      }
    } else {
      setSelectedFieldId(null);
    }
  }, [selectedBlockId, fieldsWithCitations, setSelectedFieldId]);

  const handleFieldSelect = (fieldId: string) => {
    setSelectedFieldId(fieldId);
    const field = fieldsWithCitations.find((f) => f.fieldId === fieldId);
    if (field && field.citations.length > 0) {
      const citationId = field.citations[0].id || 'default';
      const blockIds = field.citations.map((c: any) => c.id);
      const blockIndex =
        Math.abs(
          citationId
            .split('')
            .reduce((a: number, b: string) => a + b.charCodeAt(0), 0),
        ) % blockIds.length;
      const blockIdToUse = blockIds[blockIndex];
      setSelectedBlockId(blockIdToUse);
      setSelectedCitationContent(field.citations[0]);

      // Scroll to the field in the contract details
      scrollToField(fieldId);
    }
  };

  const handleCitationClick = (citationId: string) => {
    const field = fieldsWithCitations.find(
      (f) => f.fieldId === selectedFieldId,
    );
    if (field && field.citations.length > 0) {
      const citationContent = field.citations.find(
        (c: any) => c.id === citationId,
      );
      if (citationContent) {
        setSelectedBlockId(citationContent.id);
        setSelectedCitationContent(citationContent);

        // Scroll to the field in the contract details
        if (selectedFieldId) {
          scrollToField(selectedFieldId);
        }
      }
    }
  };

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
    if (textractResponse) {
      setTextBlocks(textractResponse);
    }
  }, [textractResponse]);

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
    setSelectedBlockId(null);
    setSelectedCitationContent(null);
    setSelectedFieldId(null);
    setIsExpanded(false);
  };

  const handleClose = () => {
    setSelectedBlockId(null);
    setSelectedCitationContent(null);
    setSelectedFieldId(null);
    togglePdf();
  };

  if (!isPdfOpen) return null;

  const shouldOverlay = isDiscussionOpen && !isExpanded;
  const pdfZIndex = activePanel === 'pdf' ? 'z-[60]' : 'z-[50]';

  return (
    <>
      <div
        className={cn(
          'flex h-[calc(100vh-3.5rem)] w-1/2 flex-col bg-gray-700/20',
          shouldOverlay &&
            cn('fixed right-0 top-14 w-[calc(50%-1rem)] border-l', pdfZIndex),
        )}
      >
        {/* Zoom Controls - Full Width */}
        <ZoomControls
          scale={splitScale}
          setScale={setSplitScale}
          onExpand={handleExpand}
          onClose={handleClose}
          onRotate={handleRotate}
        />

        {/* Content Area - Citations Index and PDF Side by Side */}
        <div className="flex flex-1 overflow-hidden">
          {/* Citations Index Pane - Only show if citations exist */}
          {fieldsWithCitations.length > 0 && (
            <div className="w-56 flex-shrink-0">
              <CitationsIndex
                fieldsWithCitations={fieldsWithCitations}
                selectedFieldId={selectedFieldId}
                selectedCitationContent={selectedCitationContent}
                onFieldSelect={handleFieldSelect}
                onCitationClick={handleCitationClick}
                className="h-full"
              />
            </div>
          )}

          {/* PDF Viewer Pane */}
          <div
            id="contractPane"
            className={cn(
              'scrollbar-track-gray/20 scrollbar-thumb-gray relative flex-1 overflow-y-auto bg-gray-700/20 scrollbar-thin',
              contractPaneStyles,
            )}
            onMouseEnter={() => setIsMouseOver(true)}
            onMouseLeave={() => setIsMouseOver(false)}
            ref={pdfViewerRef}
          >
            <div ref={containerRef}>
              <PDFContent
                file={file}
                containerRef={containerRef}
                pdfWidth={pdfWidth}
                scale={splitScale}
                isPdfOpen={isPdfOpen}
                className="min-h-full"
                isFullScreen={false}
                textBlocks={textBlocks}
                selectedBlockId={selectedBlockId}
                selectedCitationContent={selectedCitationContent}
                pdfViewerRef={pdfViewerRef}
                userRotation={userRotation}
              />
            </div>
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
                  textBlocks={textBlocks}
                  selectedBlockId={selectedBlockId}
                  selectedCitationContent={selectedCitationContent}
                  userRotation={userRotation}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EnhancedPDFViewer;
