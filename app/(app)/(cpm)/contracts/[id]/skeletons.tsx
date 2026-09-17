import { Spinner } from '@/components/ui/spinner';

/**
 * Loading state for the contract sidebar — a centered spinner.
 */
export function ContractSidebarSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}

/**
 * Loading state for the contract content area — a centered spinner.
 */
export function ContractContentSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
