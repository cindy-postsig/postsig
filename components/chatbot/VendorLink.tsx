'use client';

import Link from 'next/link';
import { buildVendorLink } from '@/lib/v2/chat/transforms';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chatStore';

interface VendorLinkProps {
  vendorId: number;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Renders a clickable link to a vendor detail page within the chatbot.
 * Displays the vendor ID by default, or custom children.
 * Closes/minimizes the chatbot on click.
 */
export function VendorLink({ vendorId, className, children }: VendorLinkProps) {
  const { close } = useChatStore();

  const handleClick = () => {
    close();
  };

  return (
    <Link
      href={buildVendorLink(vendorId)}
      onClick={handleClick}
      className={cn(
        'text-primary underline underline-offset-2 hover:text-primary/80',
        className,
      )}
    >
      {children ?? vendorId}
    </Link>
  );
}
