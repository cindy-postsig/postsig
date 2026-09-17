'use client';

import * as React from 'react';
import { RefreshCwIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MfaCodeInput } from '@/components/auth/MfaCodeInput';
import { cn } from '@/lib/utils';

interface MfaCodeCardProps {
  title: string;
  description: React.ReactNode;

  // MfaCodeInput wiring
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  disabled?: boolean;
  buttonLabel?: string;
  loadingLabel?: string;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;

  // Optional Resend button rendered in the header
  onResend?: () => void;
  resending?: boolean;

  // Slots
  beforeInput?: React.ReactNode; // failed-attempts alert, QR section, etc.
  afterInput?: React.ReactNode; // expiry note, etc.
  extraActions?: React.ReactNode; // Cancel button, etc.
  footer?: React.ReactNode; // CardFooter content

  className?: string;
  contentClassName?: string;
}

export function MfaCodeCard({
  title,
  description,
  value,
  onChange,
  onSubmit,
  loading = false,
  disabled = false,
  buttonLabel,
  loadingLabel,
  autoFocus,
  inputRef,
  onResend,
  resending = false,
  beforeInput,
  afterInput,
  extraActions,
  footer,
  className,
  contentClassName,
}: MfaCodeCardProps) {
  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          {onResend && (
            <Button
              variant="outline"
              size="xs"
              onClick={onResend}
              disabled={loading || resending}
              className="h-7 gap-1.5 [&_svg]:size-3"
            >
              <RefreshCwIcon />
              {resending ? 'Sending...' : 'Resend Code'}
            </Button>
          )}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={cn('space-y-4', contentClassName)}>
        {beforeInput}
        <MfaCodeInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          loading={loading}
          disabled={disabled}
          buttonLabel={buttonLabel}
          loadingLabel={loadingLabel}
          autoFocus={autoFocus}
          inputRef={inputRef}
        />
        {afterInput}
        {extraActions && <div className="flex gap-2">{extraActions}</div>}
      </CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  );
}
