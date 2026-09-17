'use client';

import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { EnvelopeClosedIcon } from '@radix-ui/react-icons';

interface PostSigEmailDisplayProps {
  email: string;
  action?: React.ReactNode;
  disabled?: boolean;
}

export function PostSigEmailDisplay({
  email,
  action,
  disabled,
}: PostSigEmailDisplayProps) {
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      toast({
        description: 'Copied to clipboard',
        variant: 'default',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to copy';
      toast(generateToastError(message, 'Clipboard error'));
    }
  };

  return (
    <div className="flex items-center justify-between rounded border">
      <div className="flex items-center gap-3 px-3 py-1 font-label text-xs uppercase tracking-wide">
        <EnvelopeClosedIcon className="h-4 w-4" />
      </div>
      <div className="flex flex-1 items-center justify-between border-l border-r px-3 py-1 pr-1">
        <span className="font-medium break-all text-sm">{email}</span>
        <Button
          variant="link"
          size="icon"
          className="h-8 w-8 shrink-0 hover:opacity-60 active:opacity-100"
          onClick={handleCopy}
          disabled={disabled}
          aria-label="Copy email address"
          title="Copy"
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      {action}
    </div>
  );
}
