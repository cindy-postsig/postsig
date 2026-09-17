'use client';

import { useEffect, useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface ContractFieldInputProps {
  fieldKey: string;
  value: string | null;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  isModified?: boolean;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Shared textarea component for contract field editing.
 * Used by both EditableField (full edit mode) and InlineFieldEditor (inline edit mode).
 */
export function ContractFieldInput({
  fieldKey,
  value,
  onChange,
  isModified = false,
  className,
  autoFocus = false,
}: ContractFieldInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  return (
    <Textarea
      ref={textareaRef}
      value={value ?? ''}
      onChange={onChange}
      className={cn(
        'min-h-[80px] resize-none font-serif text-lg',
        'border-primary/20 focus:border-primary/40',
        isModified && 'bg-yellow/20 dark:bg-yellow/20',
        className,
      )}
      placeholder={`Enter ${fieldKey.replace(/_/g, ' ')}...`}
      autoFocus={autoFocus}
    />
  );
}
