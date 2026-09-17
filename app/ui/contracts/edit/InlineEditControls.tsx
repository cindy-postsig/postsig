'use client';

import { Button } from '@/components/ui/button';
import { ReloadIcon } from '@radix-ui/react-icons';

interface InlineEditControlsProps {
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  hasChanges: boolean;
}

export function InlineEditControls({
  onSave,
  onCancel,
  isSaving,
  hasChanges,
}: InlineEditControlsProps) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <Button
        variant="default"
        size="sm"
        onClick={onSave}
        disabled={isSaving || !hasChanges}
      >
        {isSaving ? (
          <>
            <ReloadIcon className="mr-2 h-3 w-3 animate-spin" />
            Saving...
          </>
        ) : (
          'Save'
        )}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onCancel}
        disabled={isSaving}
      >
        Cancel
      </Button>
    </div>
  );
}
