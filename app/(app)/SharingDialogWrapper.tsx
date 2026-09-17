'use client';

import { SharingDialog } from '@/components/sharing/SharingDialog';
import { useSharingDialog } from './SharingDialogContext';

export function SharingDialogWrapper() {
  const { sharingDialogState, closeSharingDialog } = useSharingDialog();

  if (!sharingDialogState) return null;

  return (
    <SharingDialog
      {...sharingDialogState}
      open={true}
      onOpenChange={(open) => {
        if (!open) closeSharingDialog();
      }}
    />
  );
}
