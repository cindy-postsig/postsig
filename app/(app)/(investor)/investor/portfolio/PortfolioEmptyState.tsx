'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function PortfolioEmptyState() {
  return (
    <div>
      <h1 className="font-normal mb-6">Portfolio</h1>

      <div className="flex h-64 items-center justify-center rounded-md border border-dashed">
        <div className="text-center text-muted-foreground">
          <p>No portfolio companies yet.</p>
          <p className="mb-4 text-sm">
            Upload documents to populate your portfolio.
          </p>
          <Button variant="outline" asChild>
            <Link href="/investor/documents?upload=true">Upload Documents</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
