'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ReloadIcon } from '@radix-ui/react-icons';

interface SaveConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onSkipPreferenceChange?: (skip: boolean) => void;
  isSaving: boolean;
}

export function SaveConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  onSkipPreferenceChange,
  isSaving,
}: SaveConfirmationDialogProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleConfirm = () => {
    if (dontShowAgain && onSkipPreferenceChange) {
      onSkipPreferenceChange(true);
    }
    onConfirm();
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            You&apos;re About to Change Contract Data
          </AlertDialogTitle>
          <AlertDialogDescription>
            Saving this edit will overwrite the existing values and may deviate
            from the original uploaded contract. Please confirm that this change
            is intentional.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="dont-show-again"
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked === true)}
          />
          <Label
            htmlFor="dont-show-again"
            className="font-normal cursor-pointer text-sm text-muted-foreground"
          >
            Don&apos;t show this again
          </Label>
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            Cancel Edits
          </Button>
          <Button onClick={handleConfirm} disabled={isSaving}>
            {isSaving && <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Edits
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
