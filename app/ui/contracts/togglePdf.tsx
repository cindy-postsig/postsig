'use client';
import { createContext, useContext, useState } from 'react';
import { Citation } from '@/constants/types';

type CitationContent = Citation['content'][number];

export type PdfVisibilityContextType = {
  isPdfOpen: boolean;
  togglePdf: () => void;
  openPdf: () => void;
  selectedBlockId: string | null;
  setSelectedBlockId: (blockId: string | null) => void;
  selectedCitationContent: CitationContent | null;
  setSelectedCitationContent: (citationContent: CitationContent | null) => void;
  selectedFieldId: string | null;
  setSelectedFieldId: (fieldId: string | null) => void;
  scrollToField: (fieldId: string) => void;
};

const PdfVisibilityContext = createContext<PdfVisibilityContextType | null>(
  null,
);

export const usePdfVisibility = () => useContext(PdfVisibilityContext);

export const PdfVisibilityProvider = ({
  children,
  initialIsPdfOpen = false,
}: {
  children: any;
  initialIsPdfOpen?: boolean;
}) => {
  const [isPdfOpen, setIsPdfOpen] = useState(initialIsPdfOpen);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedCitationContent, setSelectedCitationContent] =
    useState<CitationContent | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const openPdf = () => {
    setIsPdfOpen(true);
  };

  const togglePdf = () => {
    if (isPdfOpen) {
      setSelectedBlockId(null);
      setSelectedCitationContent(null);
      setSelectedFieldId(null);
    }
    setIsPdfOpen((prev) => !prev);
  };

  const scrollToField = (fieldId: string) => {
    const element = document.querySelector(
      `[data-citation-field-id="${fieldId}"]`,
    );
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  };

  return (
    <PdfVisibilityContext.Provider
      value={{
        isPdfOpen,
        togglePdf,
        openPdf,
        selectedBlockId,
        setSelectedBlockId,
        selectedCitationContent,
        setSelectedCitationContent,
        selectedFieldId,
        setSelectedFieldId,
        scrollToField,
      }}
    >
      {children}
    </PdfVisibilityContext.Provider>
  );
};
