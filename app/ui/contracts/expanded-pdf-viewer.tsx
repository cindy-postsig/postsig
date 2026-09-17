'use client';

import { useState, useEffect, useCallback } from 'react';
import { Page } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import '@/app/ui/pdf-viewer.css';
import { Button } from '@/components/ui/button';
import { Minimize, ZoomIn, ZoomOut } from 'lucide-react';
import { Cross2Icon } from '@radix-ui/react-icons';
import PdfDocument from '@/components/pdf/PdfDocument';

const ExpandedPDFViewer = ({
  file,
  isOpen,
  onClose,
}: {
  file: string | null;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const [numPages, setNumPages] = useState<number>();
  const [scale, setScale] = useState(1);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
  }

  const handleZoomIn = useCallback(() => {
    setScale((prevScale) => Math.min(prevScale + 0.1, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prevScale) => Math.max(prevScale - 0.1, 0.5));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          handleZoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          handleZoomOut();
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          handleZoomIn();
        } else {
          handleZoomOut();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [handleZoomIn, handleZoomOut]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="flex h-[95vh] w-[95vw] flex-col rounded-lg bg-white shadow-lg">
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center space-x-2">
            <Button onClick={handleZoomOut} variant="outline" size="icon">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span>{Math.round(scale * 100)}%</span>
            <Button onClick={handleZoomIn} variant="outline" size="icon">
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={onClose} variant="outline" size="icon">
            <Cross2Icon className="h-4 w-4" />
            <span className="sr-only">Close expanded view</span>
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <PdfDocument file={file} onLoadSuccess={onDocumentLoadSuccess}>
            {Array.from(new Array(numPages), (el, index) => (
              <Page
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                renderAnnotationLayer={false}
                scale={scale}
                className="pdf-page my-3 shadow-md"
                renderTextLayer={true}
                customTextRenderer={({ str }) => str}
              />
            ))}
          </PdfDocument>
        </div>
      </div>
    </div>
  );
};

export default ExpandedPDFViewer;
