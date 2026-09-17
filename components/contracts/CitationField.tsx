import React from 'react';
import { Citation } from '@/constants/types';
import { usePdfVisibility } from '@/app/ui/contracts/togglePdf';
import { Card } from '@/components/ui/card';

// Citation field color constants
const CITATION_COLORS = {
  hover: 'hover:bg-blue-300/10',
  hoverBorder: 'hover:border-gray-700/10',
  selected: 'bg-blue-300/15',
} as const;

type CitationFieldProps = {
  citation: Citation | undefined;
  children: React.ReactNode;
  className?: string;
  row?: boolean;
  variant?: 'default' | 'card';
};

export default function CitationField({
  citation,
  children,
  className = '',
  row = false,
  variant = 'default',
}: CitationFieldProps) {
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

  // Check if this citation belongs to the currently selected field
  const isSelected =
    citation?.id && selectedFieldId === citation.id && isPdfOpen;

  if (variant === 'card') {
    if (!citation?.content?.length) {
      // No citation - render card with default styling (no interaction)
      return (
        <Card
          className={`${className} flex h-full flex-col justify-between`}
          data-citation-field-id={citation?.id}
        >
          {children}
        </Card>
      );
    }

    // Has citation - render interactive card with blue backgrounds
    return (
      <Card
        className={`${className} flex h-full cursor-pointer flex-col justify-between transition-colors ${
          isSelected
            ? `${CITATION_COLORS.selected} hover:${CITATION_COLORS.selected.replace('bg-', '')}`
            : `bg-card ${CITATION_COLORS.hover} ${CITATION_COLORS.hoverBorder}`
        }`}
        onClick={handleClick}
        data-citation-field-id={citation?.id}
      >
        {children}
      </Card>
    );
  }

  if (!citation?.content?.length) {
    return <>{children}</>;
  }

  return (
    <div
      className={`${className} ${row ? 'block w-full' : 'inline-block'} cursor-pointer transition-colors ${
        isSelected ? CITATION_COLORS.selected : CITATION_COLORS.hover
      }`}
      onClick={handleClick}
      data-citation-field-id={citation?.id}
    >
      {children}
    </div>
  );
}
