'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { apiClient, ApiRequestError } from '@/lib/api/v2-client';
import { customKpiDeleteBlockReason } from '@/lib/v2/kpis/transforms';

export function DeleteCustomKpiDialog({
  kpi,
  onOpenChange,
  onDeleted,
}: {
  kpi: { publicId: string; label: string } | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const lastKpi = useRef(kpi);
  if (kpi) lastKpi.current = kpi;
  const label = lastKpi.current?.label ?? '';

  const publicId = kpi?.publicId ?? null;
  useEffect(() => {
    if (!publicId) return;
    let cancelled = false;
    setChecking(true);
    setBlockReason(null);
    apiClient.reporting
      .getCustomKpiUsage(publicId)
      .then((usage) => {
        if (!cancelled) setBlockReason(customKpiDeleteBlockReason(usage));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  const handleDelete = async () => {
    if (!kpi || deleting) return;
    setDeleting(true);
    try {
      await apiClient.reporting.deactivateCustomKpi(kpi.publicId);
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not remove KPI',
        description:
          err instanceof ApiRequestError
            ? err.message
            : 'Something went wrong. Please try again.',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={kpi != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {blockReason ? `Can't remove ${label}` : `Remove ${label}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {checking
              ? 'Checking where this KPI is used…'
              : (blockReason ??
                'This removes the metric from the KPI table and from future reporting requests. It cannot be undone.')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            {blockReason ? 'Close' : 'Cancel'}
          </AlertDialogCancel>
          {!blockReason && (
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog open while the request is in flight so a
                // failure can surface without the row vanishing first.
                e.preventDefault();
                handleDelete();
              }}
              disabled={checking || deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
