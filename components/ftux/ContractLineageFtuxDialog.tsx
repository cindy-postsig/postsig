'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

interface ContractLineageFtuxDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ContractLineageFtuxDialog({
  isOpen,
  onClose,
  onConfirm,
}: ContractLineageFtuxDialogProps) {
  const handleConfirm = () => {
    // Close immediately
    onClose();

    // Update status in background
    try {
      onConfirm();
    } catch (error) {
      console.error('Error updating FTUX status:', error);
    }
  };

  const handleDismiss = () => {
    // Close immediately
    onClose();

    // Update status in background
    try {
      onConfirm();
    } catch (error) {
      console.error('Error updating FTUX status:', error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDismiss}>
      <DialogContent className="max-w-6xl overflow-hidden p-0">
        <div className="flex">
          {/* Left side - Text content */}
          <div className="flex w-1/2 flex-col gap-6 p-8">
            <DialogHeader>
              <DialogTitle className="max-w-sm">
                LineageAI™ shows how your contracts change.
              </DialogTitle>
              <DialogDescription className="mb-8 max-w-lg text-base leading-relaxed text-foreground/80">
                LineageAI compares fields across amendments, service orders, and
                related agreements—so you can see price shifts, new terms, or
                clause changes without digging through PDFs. Each change is
                identified in the agreement where it originated.
              </DialogDescription>
            </DialogHeader>

            {/* Button positioned at bottom left */}
            <div className="mt-auto">
              <Button onClick={handleConfirm}>Close</Button>
            </div>
          </div>

          {/* Right side - Image */}
          <div className="relative flex w-1/2 items-center justify-center overflow-hidden bg-[#E3E3E8]">
            <Image
              src="/assets/ftux/contract_lineage.png"
              alt="LineageAI contract comparison interface"
              width={650}
              height={468}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
