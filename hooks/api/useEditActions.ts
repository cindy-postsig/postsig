'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  SaveEditsResult,
  UnifiedFieldChange,
} from '@/lib/v2/contracts/edit/types';
import type { JsonEditableTable } from '@/lib/v2/contracts/edit/field-registry';
import {
  saveEdits,
  revertContractField,
  revertProductField,
} from '@/app/lib/contracts/edit-actions';

interface UseSaveEditsParams {
  changes: UnifiedFieldChange[];
  actor?: 'user' | 'system';
}

export function useSaveEdits(contractId: number) {
  const queryClient = useQueryClient();

  return useMutation<SaveEditsResult, Error, UseSaveEditsParams>({
    mutationFn: async (params) => {
      return saveEdits({
        contractId,
        changes: params.changes,
        actor: params.actor,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contracts', contractId] });
    },
  });
}

interface RevertContractFieldParams {
  fieldKey: string;
  targetValue: string | null;
}

export function useRevertContractField(contractId: number) {
  const queryClient = useQueryClient();

  return useMutation<SaveEditsResult, Error, RevertContractFieldParams>({
    mutationFn: ({ fieldKey, targetValue }) =>
      revertContractField(contractId, fieldKey, targetValue),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contracts', contractId] });
    },
  });
}

interface RevertProductFieldParams {
  table:
    | 'vendor_products_details'
    | 'vendor_products_users'
    | 'vendor_products'
    | JsonEditableTable;
  recordId: number;
  fieldKey: string;
  targetValue: string | number | null;
}

export function useRevertProductField(contractId: number) {
  const queryClient = useQueryClient();

  return useMutation<SaveEditsResult, Error, RevertProductFieldParams>({
    mutationFn: ({ table, recordId, fieldKey, targetValue }) =>
      revertProductField(contractId, table, recordId, fieldKey, targetValue),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contracts', contractId] });
    },
  });
}
