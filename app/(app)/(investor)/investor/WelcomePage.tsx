import Link from 'next/link';
import { Upload, FileArchive } from 'lucide-react';
import { ChevronRightIcon } from '@radix-ui/react-icons';

interface WelcomePageProps {
  userName?: string;
}

export function WelcomePage({ userName }: WelcomePageProps) {
  const firstName = userName?.split(' ')[0];

  return (
    <div className="px-4 pt-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-normal mb-2 text-3xl">
          Welcome{firstName ? `, ${firstName}` : ''}
        </h1>

        <p className="mb-10 text-muted-foreground">
          Get started by uploading your investment documents.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <Link
            href="/investor/documents?upload=true&mode=documents"
            className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 px-6 py-5 transition-colors hover:border-primary/50 hover:bg-muted/50"
          >
            <Upload className="h-8 w-8 text-muted-foreground" strokeWidth={1} />
            <div className="flex-1 text-left">
              <span className="font-medium block">Upload documents</span>
              <span className="text-sm text-muted-foreground">
                Upload PDFs or ZIP files
              </span>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-muted-foreground" />
          </Link>
          <Link
            href="/investor/documents?upload=true&mode=aumni"
            className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 px-6 py-5 transition-colors hover:border-primary/50 hover:bg-muted/50"
          >
            <FileArchive
              className="h-8 w-8 text-muted-foreground"
              strokeWidth={1}
            />
            <div className="flex-1 text-left">
              <span className="font-medium block">Import from Aumni</span>
              <span className="text-sm text-muted-foreground">
                Upload your Aumni export file
              </span>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-muted-foreground" />
          </Link>
        </div>
      </div>
    </div>
  );
}
