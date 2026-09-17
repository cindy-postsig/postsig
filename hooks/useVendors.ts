'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchVendorList } from '@/app/lib/dashboard/actions';
import { vendorCache } from '@/utils/cache';

const VENDOR_CACHE_KEY = 'vendor_list';

interface UseVendorsReturn {
  vendors: any[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useVendors(userMetadata?: any): UseVendorsReturn {
  const [vendors, setVendors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVendors = useCallback(async () => {
    if (!userMetadata) {
      return;
    }

    try {
      setError(null);

      const cachedVendors = vendorCache.get(VENDOR_CACHE_KEY, userMetadata);
      if (cachedVendors) {
        setVendors(cachedVendors);
        return;
      }

      setIsLoading(true);
      const { vendors: vendorsList } = await fetchVendorList(userMetadata);

      if (vendorsList && Array.isArray(vendorsList)) {
        const sortedVendors = [...vendorsList].sort((a, b) =>
          a.name && b.name ? a.name.localeCompare(b.name) : 0,
        );

        setVendors(sortedVendors);
        vendorCache.set(VENDOR_CACHE_KEY, sortedVendors, userMetadata);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch vendors');
    } finally {
      setIsLoading(false);
    }
  }, [userMetadata]);

  const refetch = useCallback(async () => {
    await fetchVendors();
  }, [fetchVendors]);

  useEffect(() => {
    if (userMetadata && !vendorCache.isValid(VENDOR_CACHE_KEY, userMetadata)) {
      fetchVendors();
    } else if (userMetadata) {
      const cachedVendors = vendorCache.get(VENDOR_CACHE_KEY, userMetadata);
      if (cachedVendors) {
        setVendors(cachedVendors);
      }
    }
  }, [userMetadata, fetchVendors]);

  return {
    vendors,
    isLoading,
    error,
    refetch,
  };
}
