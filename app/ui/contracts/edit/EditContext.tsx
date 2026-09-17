'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type {
  UnifiedFieldChange,
  ChangeKey,
  UnifiedPendingChanges,
  SaveEditsResult,
} from '@/lib/v2/contracts/edit/types';
import { makeChangeKey } from '@/lib/v2/contracts/edit/types';
import type { FieldValue } from '@/lib/v2/contracts/edit/field-registry';
import { useSaveEdits } from '@/hooks/api/useEditActions';

interface EditContextValue {
  isEditMode: boolean;
  canEdit: boolean;
  contractId: number;
  hasChanges: boolean;
  editedFieldCount: number;
  isSaving: boolean;

  inlineEditingFields: Set<ChangeKey>;

  setFieldValue: (
    table: string,
    recordId: number,
    field: string,
    oldValue: FieldValue,
    newValue: FieldValue,
    context?: Record<string, unknown>,
  ) => void;

  getFieldValue: (
    table: string,
    recordId: number,
    field: string,
    originalValue: FieldValue,
  ) => FieldValue;

  isFieldModified: (table: string, recordId: number, field: string) => boolean;

  revertField: (table: string, recordId: number, field: string) => void;

  startInlineEdit: (
    table: string,
    recordId: number,
    field: string,
    currentValue: FieldValue,
  ) => void;

  cancelInlineEdit: (table: string, recordId: number, field: string) => void;

  saveInlineEdit: (
    table: string,
    recordId: number,
    field: string,
  ) => Promise<SaveEditsResult>;

  isFieldInlineEditing: (
    table: string,
    recordId: number,
    field: string,
  ) => boolean;

  saveAllChanges: () => Promise<SaveEditsResult>;
  clearAllChanges: () => void;

  getAllChanges: () => UnifiedFieldChange[];
}

const EditContext = createContext<EditContextValue | null>(null);

interface EditProviderProps {
  children: ReactNode;
  contractId: number;
  isEditMode: boolean;
  canEdit: boolean;
  /** Used to detect when server data has refreshed, clearing saved changes */
  contractUpdatedAt?: string | null;
}

export function EditProvider({
  children,
  contractId,
  isEditMode,
  canEdit,
  contractUpdatedAt,
}: EditProviderProps) {
  const router = useRouter();
  const [pendingChanges, setPendingChanges] = useState<UnifiedPendingChanges>(
    () => new Map(),
  );
  // Track changes that were saved but not yet reflected in server data
  const [savedChanges, setSavedChanges] = useState<UnifiedPendingChanges>(
    () => new Map(),
  );
  const [inlineEditingFields, setInlineEditingFields] = useState<
    Set<ChangeKey>
  >(() => new Set());

  const saveEditsMutation = useSaveEdits(contractId);

  // Clear all state when exiting edit mode
  useEffect(() => {
    if (!isEditMode) {
      setPendingChanges(new Map());
      setSavedChanges(new Map());
      setInlineEditingFields(new Set());
    }
  }, [isEditMode]);

  // Clear saved changes when server data updates (contractUpdatedAt changes)
  useEffect(() => {
    setSavedChanges(new Map());
  }, [contractUpdatedAt]);

  // ---------------------------------------------------------------------------
  // Core Field Operations
  // ---------------------------------------------------------------------------

  const setFieldValue = useCallback(
    (
      table: string,
      recordId: number,
      field: string,
      oldValue: FieldValue,
      newValue: FieldValue,
      context?: Record<string, unknown>,
    ) => {
      const key = makeChangeKey(table, recordId, field);

      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(key, {
          table: table as UnifiedFieldChange['table'],
          recordId,
          field,
          oldValue,
          newValue,
          context,
        });
        return next;
      });
    },
    [],
  );

  const getFieldValue = useCallback(
    (
      table: string,
      recordId: number,
      field: string,
      originalValue: FieldValue,
    ): FieldValue => {
      const key = makeChangeKey(table, recordId, field);
      // Check pending changes first, then saved changes (optimistic)
      const pendingChange = pendingChanges.get(key);
      if (pendingChange) return pendingChange.newValue;
      const savedChange = savedChanges.get(key);
      if (savedChange) return savedChange.newValue;
      return originalValue;
    },
    [pendingChanges, savedChanges],
  );

  const isFieldModified = useCallback(
    (table: string, recordId: number, field: string): boolean => {
      const key = makeChangeKey(table, recordId, field);
      const change = pendingChanges.get(key);
      if (!change) return false;
      return change.oldValue !== change.newValue;
    },
    [pendingChanges],
  );

  const revertField = useCallback(
    (table: string, recordId: number, field: string) => {
      const key = makeChangeKey(table, recordId, field);
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Inline Edit Operations
  // ---------------------------------------------------------------------------

  const startInlineEdit = useCallback(
    (
      table: string,
      recordId: number,
      field: string,
      currentValue: FieldValue,
    ) => {
      const key = makeChangeKey(table, recordId, field);

      setInlineEditingFields((prev) => new Set(prev).add(key));

      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(key, {
          table: table as UnifiedFieldChange['table'],
          recordId,
          field,
          oldValue: currentValue,
          newValue: currentValue,
        });
        return next;
      });
    },
    [],
  );

  const cancelInlineEdit = useCallback(
    (table: string, recordId: number, field: string) => {
      const key = makeChangeKey(table, recordId, field);

      setInlineEditingFields((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });

      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    },
    [],
  );

  const saveInlineEdit = useCallback(
    async (
      table: string,
      recordId: number,
      field: string,
    ): Promise<SaveEditsResult> => {
      const key = makeChangeKey(table, recordId, field);
      const change = pendingChanges.get(key);

      if (!change || change.oldValue === change.newValue) {
        cancelInlineEdit(table, recordId, field);
        return { success: true };
      }

      try {
        const result = await saveEditsMutation.mutateAsync({
          changes: [change],
          actor: 'user',
        });

        if (result.success) {
          setInlineEditingFields((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          // Move from pending to saved (optimistic - keeps showing until server refreshes)
          setPendingChanges((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
          setSavedChanges((prev) => {
            const next = new Map(prev);
            next.set(key, change);
            return next;
          });
          router.refresh();
        }

        return result;
      } catch (error) {
        console.error('Failed to save inline edit', {
          error,
          contractId,
          table,
          recordId,
          field,
        });
        return { success: false, error: 'Failed to save' };
      }
    },
    [pendingChanges, cancelInlineEdit, saveEditsMutation, router, contractId],
  );

  const isFieldInlineEditing = useCallback(
    (table: string, recordId: number, field: string): boolean => {
      const key = makeChangeKey(table, recordId, field);
      return inlineEditingFields.has(key);
    },
    [inlineEditingFields],
  );

  // ---------------------------------------------------------------------------
  // Batch Operations
  // ---------------------------------------------------------------------------

  const getAllChanges = useCallback((): UnifiedFieldChange[] => {
    return Array.from(pendingChanges.values()).filter(
      (change) => change.oldValue !== change.newValue,
    );
  }, [pendingChanges]);

  const saveAllChanges = useCallback(async (): Promise<SaveEditsResult> => {
    const changes = getAllChanges();

    if (changes.length === 0) {
      return { success: true };
    }

    try {
      const result = await saveEditsMutation.mutateAsync({
        changes,
        actor: 'user',
      });

      if (result.success) {
        // Move all pending changes to saved (optimistic - keeps showing until server refreshes)
        setSavedChanges((prev) => {
          const next = new Map(prev);
          for (const change of changes) {
            const key = makeChangeKey(
              change.table,
              change.recordId,
              change.field,
            );
            next.set(key, change);
          }
          return next;
        });
        setPendingChanges(new Map());
        router.refresh();
      }

      return result;
    } catch (error) {
      console.error('Failed to save all changes', {
        error,
        contractId,
        changeCount: changes.length,
      });
      return { success: false, error: 'Failed to save changes' };
    }
  }, [getAllChanges, saveEditsMutation, router, contractId]);

  const clearAllChanges = useCallback(() => {
    setPendingChanges(new Map());
    setInlineEditingFields(new Set());
  }, []);

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  const editedFieldCount = useMemo(() => {
    return Array.from(pendingChanges.values()).filter(
      (change) => change.oldValue !== change.newValue,
    ).length;
  }, [pendingChanges]);

  const hasChanges = editedFieldCount > 0;

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value = useMemo(
    () => ({
      isEditMode,
      canEdit,
      contractId,
      hasChanges,
      editedFieldCount,
      isSaving: saveEditsMutation.isPending,
      inlineEditingFields,
      setFieldValue,
      getFieldValue,
      isFieldModified,
      revertField,
      startInlineEdit,
      cancelInlineEdit,
      saveInlineEdit,
      isFieldInlineEditing,
      saveAllChanges,
      clearAllChanges,
      getAllChanges,
    }),
    [
      isEditMode,
      canEdit,
      contractId,
      hasChanges,
      editedFieldCount,
      saveEditsMutation.isPending,
      inlineEditingFields,
      setFieldValue,
      getFieldValue,
      isFieldModified,
      revertField,
      startInlineEdit,
      cancelInlineEdit,
      saveInlineEdit,
      isFieldInlineEditing,
      saveAllChanges,
      clearAllChanges,
      getAllChanges,
    ],
  );

  return <EditContext.Provider value={value}>{children}</EditContext.Provider>;
}

export function useEdit(): EditContextValue | null {
  return useContext(EditContext);
}

// Convenience hook for contract fields (table is always 'contracts', recordId is contractId)
export function useContractFieldEdit(
  field: string,
  originalValue: string | null,
) {
  const edit = useEdit();
  const contractId = edit?.contractId ?? 0;

  return useMemo(
    () => ({
      value: edit?.getFieldValue(
        'contracts',
        contractId,
        field,
        originalValue,
      ) as string | null,
      isModified:
        edit?.isFieldModified('contracts', contractId, field) ?? false,
      setValue: (newValue: string | null) =>
        edit?.setFieldValue(
          'contracts',
          contractId,
          field,
          originalValue,
          newValue,
        ),
      revert: () => edit?.revertField('contracts', contractId, field),
      isInlineEditing:
        edit?.isFieldInlineEditing('contracts', contractId, field) ?? false,
      startEdit: () =>
        edit?.startInlineEdit('contracts', contractId, field, originalValue),
      cancelEdit: () => edit?.cancelInlineEdit('contracts', contractId, field),
      saveEdit: () =>
        edit?.saveInlineEdit('contracts', contractId, field) ??
        Promise.resolve({ success: false, error: 'No edit context' }),
    }),
    [edit, contractId, field, originalValue],
  );
}

// Convenience hook for product detail fields (fees)
export function useProductDetailFieldEdit(
  detailsId: number,
  productId: number,
  year: number,
  field: 'fees',
  originalValue: number | null,
) {
  const edit = useEdit();

  return useMemo(
    () => ({
      value: edit?.getFieldValue(
        'vendor_products_details',
        detailsId,
        field,
        originalValue,
      ) as number | null,
      isModified:
        edit?.isFieldModified('vendor_products_details', detailsId, field) ??
        false,
      setValue: (newValue: number | null) =>
        edit?.setFieldValue(
          'vendor_products_details',
          detailsId,
          field,
          originalValue,
          newValue,
          { productId, year },
        ),
      revert: () =>
        edit?.revertField('vendor_products_details', detailsId, field),
    }),
    [edit, detailsId, productId, year, field, originalValue],
  );
}

// Convenience hook for product user fields (number_of_users)
export function useProductUsersFieldEdit(
  usersId: number,
  productId: number,
  field: 'number_of_users',
  originalValue: number | null,
) {
  const edit = useEdit();

  return useMemo(
    () => ({
      value: edit?.getFieldValue(
        'vendor_products_users',
        usersId,
        field,
        originalValue,
      ) as number | null,
      isModified:
        edit?.isFieldModified('vendor_products_users', usersId, field) ?? false,
      setValue: (newValue: number | null) =>
        edit?.setFieldValue(
          'vendor_products_users',
          usersId,
          field,
          originalValue,
          newValue,
          { productId },
        ),
      revert: () => edit?.revertField('vendor_products_users', usersId, field),
    }),
    [edit, usersId, productId, field, originalValue],
  );
}

// Convenience hook for product fields (delivery_method_id)
export function useProductFieldEdit(
  productId: number,
  field: 'delivery_method_id',
  originalValue: number | null,
) {
  const edit = useEdit();

  return useMemo(
    () => ({
      value: edit?.getFieldValue(
        'vendor_products',
        productId,
        field,
        originalValue,
      ) as number | null,
      isModified:
        edit?.isFieldModified('vendor_products', productId, field) ?? false,
      setValue: (newValue: number | null) =>
        edit?.setFieldValue(
          'vendor_products',
          productId,
          field,
          originalValue,
          newValue,
        ),
      revert: () => edit?.revertField('vendor_products', productId, field),
    }),
    [edit, productId, field, originalValue],
  );
}
