'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCreateBusinessGroup } from '@/hooks/api/useOrgUnits';
import { ApiRequestError } from '@/lib/api/v2-client';
import { toast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';

interface CreateBusinessGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (group: { id: number; name: string }) => void;
}

/**
 * Creates a business_group org-unit node — the HR sense of "group". Sharing
 * groups keep CreateGroupDialog; this dialog never touches ACLs.
 */
export default function CreateBusinessGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateBusinessGroupDialogProps) {
  const router = useRouter();
  const createBusinessGroup = useCreateBusinessGroup();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setName('');
  }, [open]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { group } = await createBusinessGroup.mutateAsync(name);
      onCreated(group);
      onOpenChange(false);
      // The pages hosting this dialog pass their group list down from a server
      // component, so the cache invalidation alone would not refresh it.
      router.refresh();
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof ApiRequestError
            ? error.message
            : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Business Group</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="business-group-name" className="font-medium text-sm">
            Name
          </label>
          <Input
            id="business-group-name"
            type="text"
            placeholder="e.g., Investment Banking"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim() && !isSubmitting) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            className="h-9 text-sm"
            autoFocus
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSubmitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleSubmit}
            disabled={name.trim().length === 0 || isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
