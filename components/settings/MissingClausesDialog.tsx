'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import MissingClausesSettings from './MissingClausesSettings';
import { GearIcon } from '@radix-ui/react-icons';

interface MissingClausesDialogProps {
  user: any;
  buttonText?: string;
  showIcon?: boolean;
  buttonVariant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  buttonClassName?: string;
  disabled?: boolean;
}

export default function MissingClausesDialog({
  user,
  buttonText = 'Edit Clauses',
  buttonVariant = 'outline',
  buttonSize = 'sm',
  buttonClassName = '',
  disabled = false,
}: MissingClausesDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={buttonVariant}
          size={buttonSize}
          className={buttonClassName}
          disabled={disabled}
        >
          {buttonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Configure Required Clauses</DialogTitle>
          <DialogDescription>
            Select which contract clauses are important to your organization.
            This will determine which missing clauses appear in this report.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <MissingClausesSettings
            user={user}
            showTitle={false}
            refreshRoute="true"
            onSettingsSaved={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
