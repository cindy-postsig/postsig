'use client';

import { Input } from '@/components/ui/input';
import { useEdit } from './EditContext';
import { cn } from '@/lib/utils';

interface EditableMetadataFieldProps {
  fieldKey: string;
  value: string | null;
}

/**
 * Text input for a contract field stored inside `contracts.metadata`
 * (Contract No. / Invoice No.). Rendered in the Key Terms tiles while full edit
 * mode is on; the edit toolbar saves it with the rest of the pending changes.
 */
export function EditableMetadataField({
  fieldKey,
  value,
}: EditableMetadataFieldProps) {
  const edit = useEdit();
  const contractId = edit?.contractId ?? 0;

  const currentValue =
    (edit?.getFieldValue('contracts_metadata', contractId, fieldKey, value) as
      | string
      | null) ?? '';

  const isModified =
    edit?.isFieldModified('contracts_metadata', contractId, fieldKey) ?? false;

  return (
    <Input
      value={currentValue}
      onChange={(e) =>
        edit?.setFieldValue(
          'contracts_metadata',
          contractId,
          fieldKey,
          value,
          e.target.value.trim() === '' ? null : e.target.value,
        )
      }
      placeholder="Not set"
      className={cn(
        'h-8 font-serif text-base',
        isModified && 'border-blue-500',
      )}
    />
  );
}
