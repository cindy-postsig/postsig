'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EyeOpenIcon } from '@radix-ui/react-icons';

export function OriginalPreviewToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleExitPreview = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('viewOriginal');
    const queryString = params.toString() ? `?${params.toString()}` : '';
    router.push(pathname + queryString);
  };

  return (
    <div className="z-20 border-t bg-background">
      <div className="flex h-16 w-full items-center justify-between bg-blue-100 px-6 dark:bg-blue-950/30">
        <div className="flex items-center gap-3">
          <div className="font-medium flex items-center gap-2 text-sm">
            Viewing Original
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleExitPreview}>
            Exit Preview
          </Button>
        </div>
      </div>
    </div>
  );
}
