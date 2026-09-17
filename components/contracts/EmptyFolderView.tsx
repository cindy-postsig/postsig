'use client';

import Link from 'next/link';
import { FolderIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface EmptyFolderViewProps {
  folderId?: string;
  folderName?: string;
  className?: string;
}

export function EmptyFolderView({
  folderId,
  folderName,
  className,
}: EmptyFolderViewProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-md border bg-muted/20',
        'h-[calc(100vh-200px)]',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="space-y-3">
          <p className="text-lg text-muted-foreground">This folder is empty</p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/contracts">Add Contracts</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
