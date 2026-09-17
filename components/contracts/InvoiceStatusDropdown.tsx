'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { ChevronDownIcon } from '@radix-ui/react-icons';
import { useAbility } from '@/components/providers/AbilityProvider';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from '@/constants/invoiceStatus';

interface StatusStyle {
  label: string;
  borderColor?: string;
  bgColor?: string;
  textColor?: string;
  className?: string;
}

const STATUS_CONFIG: Record<InvoiceStatus, StatusStyle> = {
  review: {
    label: 'In Review',
    borderColor: '#D34B21',
    bgColor: 'rgba(211, 75, 33, 0.05)',
    textColor: '#D34B21',
  },
  incomplete: {
    label: 'Incomplete',
    borderColor: '#D34B21',
    bgColor: 'rgba(211, 75, 33, 0.05)',
    textColor: '#D34B21',
  },
  declined: {
    label: 'Declined',
    borderColor: '#A71A45',
    bgColor: 'rgba(167, 26, 69, 0.05)',
    textColor: '#A71A45',
  },
  void: {
    label: 'Void',
    className:
      'border-gray-600 bg-gray-600/5 text-gray-600 hover:bg-gray-600/10 hover:text-gray-600 dark:border-gray-400 dark:bg-gray-400/5 dark:text-gray-400 dark:hover:bg-gray-400/10 dark:hover:text-gray-400',
  },
  paid: {
    label: 'Paid',
    borderColor: '#00A86B',
    bgColor: 'rgba(0, 168, 107, 0.05)',
    textColor: '#00A86B',
  },
  approved: {
    label: 'Approved',
    borderColor: '#00A86B',
    bgColor: 'rgba(0, 168, 107, 0.05)',
    textColor: '#00A86B',
  },
};

interface InvoiceStatusDropdownProps {
  currentStatus: InvoiceStatus;
  onStatusUpdate: (
    newStatus: InvoiceStatus,
    reason?: string,
  ) => Promise<boolean>;
  isLoading: boolean;
  currentReason?: string;
  externalInvoiceStatus?: string;
  externalSource?: string | null;
}

const InvoiceStatusDropdown: React.FC<InvoiceStatusDropdownProps> = ({
  currentStatus,
  onStatusUpdate,
  isLoading,
  currentReason,
  externalInvoiceStatus,
  externalSource,
}) => {
  const ability = useAbility();
  const canUpdate = ability.can('update', 'Contract');

  const [displayStatus, setDisplayStatus] =
    useState<InvoiceStatus>(currentStatus);
  const [isUpdating, setIsUpdating] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<InvoiceStatus | null>(
    null,
  );
  const [decisionReason, setDecisionReason] = useState('');
  const lastSuccessfulUpdateRef = useRef<InvoiceStatus>(currentStatus);

  useEffect(() => {
    lastSuccessfulUpdateRef.current = currentStatus;
    setDisplayStatus(currentStatus);
  }, [currentStatus]);

  // Statuses that require a confirmation dialog
  const CONFIRMATION_STATUSES: InvoiceStatus[] = ['void', 'paid', 'approved'];
  // Statuses that show the reason textarea.
  const REASON_SHOWN_STATUSES: InvoiceStatus[] = [
    'approved',
    'incomplete',
    'declined',
    'void',
    'paid',
  ];

  const handleStatusUpdate = async (newStatus: string) => {
    if (newStatus === displayStatus) return;

    const status = newStatus as InvoiceStatus;

    if (
      CONFIRMATION_STATUSES.includes(status) ||
      REASON_SHOWN_STATUSES.includes(status)
    ) {
      setDecisionReason(
        REASON_SHOWN_STATUSES.includes(status) ? (currentReason ?? '') : '',
      );
      setPendingStatus(status);
      return;
    }

    await applyStatusUpdate(status);
  };

  const applyStatusUpdate = async (status: InvoiceStatus, reason?: string) => {
    setIsUpdating(true);
    setDisplayStatus(status);

    try {
      const success = await onStatusUpdate(status, reason);
      if (success) {
        lastSuccessfulUpdateRef.current = status;
      } else {
        setDisplayStatus(lastSuccessfulUpdateRef.current);
      }
    } catch {
      setDisplayStatus(lastSuccessfulUpdateRef.current);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirm = async () => {
    if (!pendingStatus) return;
    const status = pendingStatus;
    const reason = decisionReason.trim() || undefined;
    setPendingStatus(null);
    setDecisionReason('');
    await applyStatusUpdate(status, reason);
  };

  const handleSkip = async () => {
    if (!pendingStatus) return;
    const status = pendingStatus;
    setPendingStatus(null);
    setDecisionReason('');
    await applyStatusUpdate(status);
  };

  const handleCancel = () => {
    setPendingStatus(null);
    setDecisionReason('');
  };

  const showReasonField =
    pendingStatus !== null && REASON_SHOWN_STATUSES.includes(pendingStatus);

  const config = STATUS_CONFIG[displayStatus];
  const isDisabled = isLoading || isUpdating || !canUpdate;
  const normalizedExternalInvoiceStatus = externalInvoiceStatus?.toUpperCase();
  const isVoidDisabledByExternalStatus =
    Boolean(normalizedExternalInvoiceStatus) &&
    normalizedExternalInvoiceStatus !== 'SUBMITTED' &&
    normalizedExternalInvoiceStatus !== 'AUTHORISED' &&
    normalizedExternalInvoiceStatus !== 'AUTHORIZED';
  const isExternalInvoiceProvider =
    externalSource === 'xero' || externalSource === 'ramp';

  const buttonContent = (
    <Button
      variant="ghost"
      className={cn(
        'h-6 gap-1 rounded-full border py-0 pl-1 pr-2 text-xs disabled:cursor-not-allowed disabled:opacity-50',
        config.className,
      )}
      style={
        config.borderColor
          ? {
              borderColor: config.borderColor,
              backgroundColor: config.bgColor,
              color: config.textColor,
            }
          : undefined
      }
      disabled={isDisabled}
    >
      <span className="flex gap-2 px-2 pr-0">
        {config.label}
        {(isLoading || isUpdating) && (
          <Loader2 className="h-3 w-3 animate-spin" />
        )}
      </span>
      <ChevronDownIcon className="h-3 w-3" />
    </Button>
  );

  if (isDisabled) {
    return buttonContent;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{buttonContent}</DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Invoice Status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={displayStatus}
            onValueChange={handleStatusUpdate}
          >
            <DropdownMenuRadioItem value="review">
              In Review
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="incomplete">
              Incomplete
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="declined">
              Declined
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="void"
              disabled={isVoidDisabledByExternalStatus}
            >
              Void
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="paid"
              disabled={isExternalInvoiceProvider}
            >
              Paid
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="approved">
              Approved
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => {
          if (!open) handleCancel();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark invoice as{' '}
              {pendingStatus ? STATUS_CONFIG[pendingStatus].label : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {showReasonField
                ? 'Add a reason for this decision, or skip it.'
                : 'This invoice will be removed from the discrepancies report.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {showReasonField && (
            <div className="space-y-1.5 px-1">
              <Label htmlFor="decision-reason" className="text-sm">
                Reason (optional)
              </Label>
              <Textarea
                id="decision-reason"
                placeholder="Enter reason for decision..."
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                rows={3}
                className="resize-none text-sm"
              />
            </div>
          )}
          <AlertDialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            {showReasonField && (
              <Button variant="secondary" onClick={handleSkip}>
                Skip
              </Button>
            )}
            <Button
              onClick={handleConfirm}
              disabled={showReasonField && !decisionReason.trim()}
            >
              Confirm
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default InvoiceStatusDropdown;
