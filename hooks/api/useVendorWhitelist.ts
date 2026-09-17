'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';
import type {
  VendorWhitelistResponse,
  VendorWhitelistEntry,
  VendorWhitelist,
  VendorWhitelistUploadResponse,
} from '@/app/api/v2/types/api';

const QUERY_KEYS = {
  vendorWhitelist: ['organization-preferences', 'vendor-whitelist'] as const,
};

export function useVendorWhitelist() {
  return useQuery<VendorWhitelistResponse>({
    queryKey: QUERY_KEYS.vendorWhitelist,
    queryFn: () => apiClient.organizationPreferences.getVendorWhitelist(),
  });
}

export function useAddVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entry: Omit<VendorWhitelistEntry, 'addedAt'>) =>
      apiClient.organizationPreferences.addVendor(entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vendorWhitelist });
    },
  });
}

export function useAddVendors() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vendors: Omit<VendorWhitelistEntry, 'addedAt'>[]) =>
      apiClient.organizationPreferences.addVendors(vendors),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vendorWhitelist });
    },
  });
}

export function useRemoveVendor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (email: string) =>
      apiClient.organizationPreferences.removeVendor(email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vendorWhitelist });
    },
  });
}

export function useRemoveVendors() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      emails,
      currentWhitelist,
    }: {
      emails: string[];
      currentWhitelist: VendorWhitelistEntry[];
    }) => {
      const emailsToRemove = new Set(emails.map((e) => e.toLowerCase()));
      const newWhitelist = currentWhitelist.filter(
        (entry) => !emailsToRemove.has(entry.email.toLowerCase()),
      );
      return apiClient.organizationPreferences.replaceVendorWhitelist(
        newWhitelist,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vendorWhitelist });
    },
  });
}

export function useReplaceVendorWhitelist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (whitelist: VendorWhitelist) =>
      apiClient.organizationPreferences.replaceVendorWhitelist(whitelist),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vendorWhitelist });
    },
  });
}

export function useUploadVendorWhitelistCSV() {
  const queryClient = useQueryClient();

  return useMutation<
    VendorWhitelistUploadResponse,
    Error,
    { file: File; replace: boolean }
  >({
    mutationFn: ({ file, replace }) =>
      apiClient.organizationPreferences.uploadVendorWhitelistCSV(file, replace),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vendorWhitelist });
    },
  });
}
