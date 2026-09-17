'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useContractStatusUpdate } from '@/hooks/useContractStatusUpdate';
import {
  confirmContractReplacement,
  rejectContractReplacement,
} from '@/app/lib/contract-replacements/actions';
import type { ContractReplacementPrompt } from '@/lib/contracts/replacementPrompt';

export type { ContractReplacementPrompt };

interface ContractReplacementBannerProps {
  prompt: ContractReplacementPrompt;
  /** Vendor name of the OLD contract, for the archive toast. */
  oldContractVendorName: string;
  /**
   * Which side of the event the page contract is; picks the line-1 sentence.
   * `'old'`: the old contract's page — line 1 names the detected replacement.
   * `'new'`: the replacement's page — line 1 names the old contract.
   * Either way line 1 links to the linked contract, never the page itself.
   */
  surface: 'old' | 'new';
}

/**
 * The two copy lines. Line 1 names and links the event's other contract;
 * line 2 asks the archive question, with the old contract's end date as
 * informational copy when known.
 */
function PromptLines({
  prompt,
  surface,
}: {
  prompt: ContractReplacementPrompt;
  surface: 'old' | 'new';
}) {
  const subject = [prompt.vendorName, prompt.firstProductName]
    .filter(Boolean)
    .join(' – ');

  const linkedContract = (
    <>
      {' '}
      {prompt.linkedContractId}
      {subject ? ' for ' : ''}
      {subject ? <strong>{subject}</strong> : null}
      {prompt.linkedContractDate ? (
        <>
          , dated <strong>{prompt.linkedContractDate}</strong>
        </>
      ) : null}
    </>
  );

  return (
    <div>
      <Link
        href={`/contracts/${prompt.linkedContractId}`}
        className="hover:underline"
      >
        {surface === 'old'
          ? 'We detected a potentially newer contract'
          : 'We detected that this contract potentially replaces contract'}
        {linkedContract}
      </Link>
      <div>
        Archive this older contract
        {prompt.oldContractEndDate ? (
          <>
            {' on '}
            <strong>{prompt.oldContractEndDate}</strong>
          </>
        ) : null}
        ?
      </div>
    </div>
  );
}

/**
 * Asks the customer whether a detected newer contract replaces an older one.
 * Rendered on both sides of the event — the old contract's page and the
 * replacement's page — and only for `verified` events: an unscreened
 * detection never reaches a customer.
 *
 * "Yes" archives through the existing archive path (`useContractStatusUpdate`
 * → `/api/contracts/update`), which owns invoice-descendant cascade, the
 * non-invoice confirmation dialog and the audit log, and only then stamps the
 * event confirmed. If the archive fails the event stays `verified` and this
 * banner is still here to retry.
 */
export default function ContractReplacementBanner({
  prompt,
  oldContractVendorName,
  surface,
}: ContractReplacementBannerProps) {
  const router = useRouter();
  const [isResolving, setIsResolving] = useState(false);
  const { updateContractStatus } = useContractStatusUpdate();

  const handleConfirm = async () => {
    setIsResolving(true);
    try {
      const archived = await updateContractStatus(
        String(prompt.oldContractId),
        'inactive',
        oldContractVendorName,
      );
      // The archive path reports its own failure toast; leaving the event
      // verified keeps the prompt available for a retry.
      if (!archived) return;

      await confirmContractReplacement(prompt.eventId);
      router.refresh();
    } catch (error) {
      console.error('Failed to confirm contract replacement:', error);
      toast({
        title: 'Error',
        description:
          'The contract was archived but we could not record the replacement. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsResolving(false);
    }
  };

  const handleReject = async () => {
    setIsResolving(true);
    try {
      await rejectContractReplacement(prompt.eventId);
      router.refresh();
    } catch (error) {
      console.error('Failed to reject contract replacement:', error);
      toast({
        title: 'Error',
        description: 'Failed to update the contract. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <Alert variant="warning" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PromptLines prompt={prompt} surface={surface} />
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="default"
            disabled={isResolving}
            onClick={handleConfirm}
          >
            Yes
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isResolving}
            onClick={handleReject}
          >
            No, keep it active
          </Button>
        </div>
      </div>
    </Alert>
  );
}
