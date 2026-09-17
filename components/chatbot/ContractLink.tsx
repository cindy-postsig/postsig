'use client';

import Link from 'next/link';
import { buildContractLink } from '@/lib/v2/chat/transforms';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chatStore';

interface ContractLinkProps {
  contractId: number;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Renders a clickable link to a contract detail page.
 * Displays the contract ID by default, or custom children.
 * If chatbot is fullscreen, minimizes it to sidebar on click.
 */
export function ContractLink({
  contractId,
  className,
  children,
}: ContractLinkProps) {
  const { close } = useChatStore();

  const handleClick = () => {
    close();
  };

  return (
    <Link
      href={buildContractLink(contractId)}
      onClick={handleClick}
      className={cn(
        'text-primary underline underline-offset-2 hover:text-primary/80',
        className,
      )}
    >
      {children ?? contractId}
    </Link>
  );
}
