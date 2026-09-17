'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from './ui/button';

type Props = ButtonProps & {
  pendingText?: string;
};

export function SubmitButton({ children, pendingText, ...props }: Props) {
  const { pending } = useFormStatus();
  const isDisabled = pending || props.disabled;

  return (
    <Button
      {...props}
      type="submit"
      disabled={isDisabled}
      aria-disabled={isDisabled}
    >
      {pending ? (pendingText ?? children) : children}
    </Button>
  );
}
