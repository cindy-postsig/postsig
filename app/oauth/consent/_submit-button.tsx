'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from '@/components/ui/button';

interface SubmitButtonProps extends Omit<ButtonProps, 'type' | 'disabled'> {
  pendingLabel: string;
  children: React.ReactNode;
}

export function SubmitButton({
  pendingLabel,
  children,
  ...rest
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...rest}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
