'use client';

import * as React from 'react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { Button } from '@/components/ui/button';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

interface MfaCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  disabled?: boolean;
  buttonLabel?: string;
  loadingLabel?: string;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}

export function MfaCodeInput({
  value,
  onChange,
  onSubmit,
  loading = false,
  disabled = false,
  buttonLabel = 'Verify & Enable',
  loadingLabel = 'Verifying...',
  autoFocus = false,
  inputRef,
}: MfaCodeInputProps) {
  return (
    <div className="flex items-center gap-3">
      <InputOTP
        ref={inputRef}
        maxLength={6}
        value={value}
        onChange={onChange}
        onComplete={onSubmit}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        disabled={loading || disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        data-bwignore="true"
        data-form-type="other"
      >
        <InputOTPGroup>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />
          ))}
        </InputOTPGroup>
      </InputOTP>
      <Button
        onClick={onSubmit}
        disabled={loading || disabled || value.length !== 6}
        className="flex-1"
        size="lg"
      >
        {loading ? loadingLabel : buttonLabel}
      </Button>
    </div>
  );
}
