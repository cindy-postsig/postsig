import React, { useState } from 'react';
import { Citation } from '@/constants/types';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

type CitationPopoverProps = {
  citation: Citation | null | undefined;
  children: React.ReactNode;
  className?: string;
};

export default function CitationPopover({
  citation,
  children,
  className,
}: CitationPopoverProps) {
  const [isSelected, setIsSelected] = useState(false);

  if (!citation) return <>{children}</>;

  return (
    <Popover onOpenChange={(open) => setIsSelected(open)}>
      <PopoverTrigger asChild>
        <span className={`cursor-help ${className || ''}`}>{children}</span>
      </PopoverTrigger>
      <PopoverContent
        className="max-h-[300px] w-full max-w-md overflow-y-auto p-4 font-sans-neue"
        side="top"
        align="center"
      >
        <div className="space-y-4">
          {citation?.content?.map((content, contentIdx) => (
            <div key={contentIdx}>
              <p className="font-bold text-xs">Page {content.pageNumber}</p>
              <p className="text-sm">
                <Markdown rehypePlugins={[rehypeRaw]}>
                  {content.citationText}
                </Markdown>
              </p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
