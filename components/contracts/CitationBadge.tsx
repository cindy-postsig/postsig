import React from 'react';
import { Citation } from '@/constants/types';
import { usePdfVisibility } from '@/app/ui/contracts/togglePdf';
import { Badge } from '../ui/badge';

type CitationBadgeProps = {
  citation: Citation | undefined;
  className?: string;
};

export default function CitationBadge({
  citation,
  className,
}: CitationBadgeProps) {
  const context = usePdfVisibility();

  if (!context) {
    throw new Error(
      'usePdfVisibility must be used within a PdfVisibilityProvider',
    );
  }

  const {
    isPdfOpen,
    togglePdf,
    setSelectedBlockId,
    selectedBlockId,
    setSelectedCitationContent,
    selectedFieldId,
    setSelectedFieldId,
  } = context;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (citation?.content?.[0]) {
      // Use the first available citation for now
      const citationContentItem = citation.content[0];
      const citationContentToUse = {
        ...citationContentItem,
        pageNumber: Number(citationContentItem.pageNumber),
      };

      // If this citation is already selected and PDF is open, close the PDF
      if (isPdfOpen && selectedBlockId === citationContentToUse.id) {
        togglePdf();
        setSelectedBlockId(null);
        setSelectedCitationContent(null);
        setSelectedFieldId(null);
        return;
      }

      // Otherwise, open PDF and navigate to this citation
      if (!isPdfOpen) {
        togglePdf();
      }

      setSelectedBlockId(citationContentToUse.id);
      setSelectedCitationContent(citationContentToUse);
      setSelectedFieldId(citation.id);
    }
  };

  if (!citation) return null;

  // Check if this citation belongs to the currently selected field
  const isSelected = selectedFieldId === citation.id && isPdfOpen;

  const hasBoundingBox = citation.content?.[0]?.boundingBox;
  const hasContent = citation.content && citation.content.length > 0;

  return (
    <Badge
      variant="secondary"
      className={`${className || ''} ml-2 h-5 w-5 ${hasContent ? 'cursor-pointer' : ''} items-center justify-center p-0 text-[11px] transition-colors ${
        isSelected
          ? 'bg-psblue text-white hover:bg-psblue/95'
          : hasContent
            ? 'hover:bg-primary/20'
            : ''
      }`}
      onClick={hasContent ? handleClick : undefined}
    >
      {citation.content ? `${citation.content.length}` : ''}
    </Badge>
  );
}
