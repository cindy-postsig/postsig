import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

export function CompanyHeaderSkeleton() {
  return (
    <div className="mx-auto flex items-center justify-between px-8">
      <div className="flex items-center gap-6">
        <Skeleton className="h-[72px] w-[72px] rounded-md" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-9 w-9 rounded-sm" />
    </div>
  );
}

// Per-tab body varies too much (charts, tables, card grids) for one skeleton to
// match, so the details fall back to a spinner rather than a mismatched shape.
export function CompanyDetailsLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
