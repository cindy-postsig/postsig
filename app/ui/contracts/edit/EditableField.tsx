'use client';

import { useCallback, ReactNode } from 'react';
import { useEdit } from './EditContext';
import { isEditableField } from '@/lib/v2/contracts/edit/utils';
import { ContractFieldInput } from './ContractFieldInput';

interface EditableFieldProps {
  fieldKey: string;
  value: string | null;
  children: ReactNode;
  className?: string;
  inputClassName?: string;
}

export function EditableField({
  fieldKey,
  value,
  children,
  className,
  inputClassName,
}: EditableFieldProps) {
  const edit = useEdit();
  const contractId = edit?.contractId ?? 0;

  const isEditMode = edit?.isEditMode ?? false;
  const isEditable = isEditableField(fieldKey);

  const currentValue =
    (edit?.getFieldValue('contracts', contractId, fieldKey, value) as string) ??
    value ??
    '';

  const isModified =
    edit?.isFieldModified('contracts', contractId, fieldKey) ?? false;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!edit) return;
      const newValue = e.target.value || null;
      edit.setFieldValue('contracts', contractId, fieldKey, value, newValue);
    },
    [edit, contractId, fieldKey, value],
  );

  if (!isEditMode || !isEditable) {
    return <div className={className}>{children}</div>;
  }

  return (
    <ContractFieldInput
      fieldKey={fieldKey}
      value={currentValue}
      onChange={handleChange}
      isModified={isModified}
      className={inputClassName}
    />
  );
}
