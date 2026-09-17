'use client';

import { Button } from '@/components/ui/button';

export default function ExchangeAgreementsViewsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 p-12 text-center">
      <p className="text-sm text-muted-foreground">
        Something went wrong loading fee schedule data.
      </p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
