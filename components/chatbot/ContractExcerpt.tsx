'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ExcerptData } from '@/lib/v2/chat/client';

interface ContractExcerptProps {
  excerpts: ExcerptData[];
  onHide: () => void;
}

export function ContractExcerpt({ excerpts, onHide }: ContractExcerptProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!excerpts || excerpts.length === 0) return null;

  const excerpt = excerpts[currentIndex];
  const hasMultiple = excerpts.length > 1;

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : excerpts.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < excerpts.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium font-sans text-sm">
            Contract Excerpts
          </span>
          {hasMultiple && (
            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} of {excerpts.length}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={onHide}
        >
          Hide
        </Button>
      </div>

      {/* Navigation for multiple excerpts */}
      {hasMultiple && (
        <div className="flex items-center justify-between border-b border-border px-2 py-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handlePrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {`Contract ${excerpt.contractId}`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1 px-4 py-3">
        <div className="space-y-3">
          {/* Section Title */}
          <h3 className="font-medium font-sans text-sm">{excerpt.title}</h3>

          {/* Clause Content */}
          <div className="space-y-3 font-sans text-xs leading-relaxed text-muted-foreground">
            {excerpt.content.split('\n\n').map((paragraph, idx) => (
              <p key={idx}>{paragraph}</p>
            ))}
          </div>
        </div>
      </ScrollArea>

      {/* Footer with contract info */}
      <div className="border-t border-border px-4 py-2">
        <p className="font-sans text-[10px] text-muted-foreground">
          From: {`Contract #${excerpt.contractId}`} ({excerpt.vendor})
        </p>
      </div>
    </div>
  );
}

export function ContractExcerptLoading() {
  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-medium font-sans text-sm">Contract Excerpts</span>
      </div>
      <div className="flex-1 animate-pulse space-y-3 px-4 py-3">
        <div className="h-4 w-32 rounded-sm bg-muted" />
        <div className="h-3 w-full rounded-sm bg-muted" />
        <div className="h-3 w-full rounded-sm bg-muted" />
        <div className="h-3 w-3/4 rounded-sm bg-muted" />
      </div>
    </div>
  );
}
