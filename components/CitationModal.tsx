import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Citation } from '@/constants/types';

interface CitationModalProps {
  citations: Citation[];
  isOpen: boolean;
  onClose: () => void;
  citationKey: string;
}

export default function CitationModal({
  citationKey,
  citations,
  isOpen,
  onClose,
}: CitationModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const citationsForKey = citations.find((c) => c.id === citationKey);
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Citation Details</DialogTitle>
        </DialogHeader>

        <div className="flex h-[600px] flex-row gap-8">
          <div className="flex w-full flex-col gap-4">
            <div className="mb-4 flex items-center gap-2">
              {citationsForKey?.content.map((_, index) => (
                <Button
                  key={index}
                  variant={selectedIndex === index ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 w-8 rounded-full p-0"
                  onClick={() => setSelectedIndex(index)}
                >
                  {index + 1}
                </Button>
              ))}
            </div>

            <ScrollArea className="flex flex-col gap-4 pr-4">
              <div className="flex flex-col gap-4">
                <div className="space-y-1">
                  <span className="font-medium text-sm text-muted-foreground">
                    Page Number
                  </span>
                  <p className="text-lg">
                    {citationsForKey?.content[selectedIndex].pageNumber}
                  </p>
                </div>

                <Separator />

                <div className="space-y-1">
                  <span className="font-medium text-sm text-muted-foreground">
                    Citation Text
                  </span>
                  <div className="rounded-md bg-muted py-4">
                    {citationsForKey?.content[selectedIndex].citationText}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
