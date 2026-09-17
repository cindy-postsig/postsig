'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const INLINE_LIMIT = 10;

interface BulkUsersListProps {
  action: 'Added' | 'Removed' | 'Released';
  userNames: string[];
}

export default function BulkUsersList({
  action,
  userNames,
}: BulkUsersListProps) {
  const [open, setOpen] = useState(false);
  const inline = userNames.slice(0, INLINE_LIMIT);
  const remaining = userNames.length - INLINE_LIMIT;

  return (
    <>
      {action} <strong>{userNames.length} Active Users</strong>:{' '}
      {inline.join(', ')}
      {remaining > 0 && (
        <>
          <button
            type="button"
            className="mt-1 block text-xs text-primary underline underline-offset-2"
            onClick={() => setOpen(true)}
          >
            Show all
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {action} {userNames.length} Active Users
                </DialogTitle>
              </DialogHeader>
              <ul className="max-h-[60vh] space-y-1 overflow-y-auto pr-2 text-sm">
                {userNames.map((name, idx) => (
                  <li key={`${idx}-${name}`}>{name}</li>
                ))}
              </ul>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}
