'use client';

import { useState, useCallback, useContext, useEffect, ReactNode } from 'react';
import { useEdit } from './EditContext';
import { isEditableField } from '@/lib/v2/contracts/edit/utils';
import { ContractFieldInput } from './ContractFieldInput';
import { FieldEditMenu } from './FieldEditMenu';
import { InlineEditControls } from './InlineEditControls';
import { SaveConfirmationDialog } from './SaveConfirmationDialog';
import { UserContext } from '@/app/userProvider';
import {
  getUserPreference,
  setUserPreference,
} from '@/app/lib/actions/preferences';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import logger from '@/utils/pino';

export function useInlineEdit(fieldKey: string, value: string | null) {
  const edit = useEdit();
  const contractId = edit?.contractId ?? 0;
  const [isSaving, setIsSaving] = useState(false);

  const isInlineEditing =
    edit?.isFieldInlineEditing('contracts', contractId, fieldKey) ?? false;
  const isFullEditMode = edit?.isEditMode ?? false;
  const isEditable = isEditableField(fieldKey);

  const currentValue =
    (edit?.getFieldValue('contracts', contractId, fieldKey, value) as string) ??
    value ??
    '';
  const isModified =
    edit?.isFieldModified('contracts', contractId, fieldKey) ?? false;

  const handleStartEdit = useCallback(() => {
    if (!edit) return;
    edit.startInlineEdit('contracts', contractId, fieldKey, value);
  }, [edit, contractId, fieldKey, value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!edit) return;
      const newValue = e.target.value || null;
      edit.setFieldValue('contracts', contractId, fieldKey, value, newValue);
    },
    [edit, contractId, fieldKey, value],
  );

  const handleSave = useCallback(async () => {
    if (!edit) return;
    setIsSaving(true);
    try {
      await edit.saveInlineEdit('contracts', contractId, fieldKey);
    } finally {
      setIsSaving(false);
    }
  }, [edit, contractId, fieldKey]);

  const handleCancel = useCallback(() => {
    if (!edit) return;
    edit.cancelInlineEdit('contracts', contractId, fieldKey);
  }, [edit, contractId, fieldKey]);

  return {
    isInlineEditing,
    isFullEditMode,
    isEditable,
    currentValue,
    isModified,
    isSaving,
    handleStartEdit,
    handleChange,
    handleSave,
    handleCancel,
  };
}

interface InlineFieldEditorProps {
  fieldKey: string;
  value: string | null;
  className?: string;
  inputClassName?: string;
}

/**
 * Inline editor component with save/cancel controls.
 * Uses shared ContractFieldInput for the input rendering.
 */
export function InlineFieldEditor({
  fieldKey,
  value,
  className,
  inputClassName,
}: InlineFieldEditorProps) {
  const {
    currentValue,
    isModified,
    isSaving,
    handleChange,
    handleSave,
    handleCancel,
  } = useInlineEdit(fieldKey, value);

  const userContext = useContext(UserContext);
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [skipConfirmation, setSkipConfirmation] = useState(false);
  const [isConfirmSaving, setIsConfirmSaving] = useState(false);

  const userId = userContext?.userMetadata?.userId;

  // Load user preference for skipping confirmation
  useEffect(() => {
    if (!userId) return;
    getUserPreference(userId, 'contracts.skip_edit_confirmation')
      .then((value) => {
        setSkipConfirmation(value);
      })
      .catch((error) => {
        logger.error(
          { userId, error },
          'Failed to load skip confirmation preference',
        );
      });
  }, [userId]);

  const handleSaveClick = () => {
    if (skipConfirmation) {
      handleConfirmSave();
    } else {
      setIsDialogOpen(true);
    }
  };

  const handleConfirmSave = async () => {
    setIsConfirmSaving(true);
    try {
      await handleSave();
      setIsDialogOpen(false);
    } catch (error) {
      logger.error({ fieldKey, error }, 'Failed to save inline edit');
      const message =
        error instanceof Error ? error.message : 'An unexpected error occurred';
      toast(generateToastError(message, 'Save failed'));
    } finally {
      setIsConfirmSaving(false);
    }
  };

  const handleSkipPreferenceChange = async (skip: boolean) => {
    if (!userId) return;
    setSkipConfirmation(skip);
    try {
      const success = await setUserPreference(
        userId,
        'contracts.skip_edit_confirmation',
        skip,
      );
      if (!success) {
        setSkipConfirmation(!skip);
      }
    } catch (error) {
      logger.error(
        { userId, error },
        'Failed to save skip confirmation preference',
      );
      setSkipConfirmation(!skip);
    }
  };

  return (
    <div className={className}>
      <ContractFieldInput
        fieldKey={fieldKey}
        value={currentValue}
        onChange={handleChange}
        isModified={isModified}
        className={inputClassName}
        autoFocus
      />
      <InlineEditControls
        onSave={handleSaveClick}
        onCancel={handleCancel}
        isSaving={isSaving || isConfirmSaving}
        hasChanges={isModified}
      />
      <SaveConfirmationDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onConfirm={handleConfirmSave}
        onSkipPreferenceChange={handleSkipPreferenceChange}
        isSaving={isConfirmSaving}
      />
    </div>
  );
}

interface InlineEditWrapperProps {
  fieldKey: string;
  value: string | null;
  children: ReactNode;
  className?: string;
  inputClassName?: string;
}

/**
 * Wrapper component for inline editing.
 * Shows children normally, switches to InlineFieldEditor when editing.
 */
export function InlineEditWrapper({
  fieldKey,
  value,
  children,
  className,
  inputClassName,
}: InlineEditWrapperProps) {
  const { isInlineEditing, isFullEditMode, isEditable } = useInlineEdit(
    fieldKey,
    value,
  );

  // Don't show inline edit wrapper in full edit mode or for non-editable fields
  if (isFullEditMode || !isEditable) {
    return <div className={className}>{children}</div>;
  }

  // When in inline edit mode, show input and controls
  if (isInlineEditing) {
    return (
      <InlineFieldEditor
        fieldKey={fieldKey}
        value={value}
        className={className}
        inputClassName={inputClassName}
      />
    );
  }

  // Default: just show children (parent handles hover/menu)
  return <div className={className}>{children}</div>;
}

// Re-export FieldEditMenu for use in parent components
export { FieldEditMenu } from './FieldEditMenu';
