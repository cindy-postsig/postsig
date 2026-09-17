'use client';

import { useQuery } from '@tanstack/react-query';
import { getAllDataDeliveryTypes } from '@/app/lib/actions/supabase_service';

export type DataDeliveryType = { id: number; name: string };

export function useDataDeliveryTypes() {
  return useQuery<DataDeliveryType[]>({
    queryKey: ['dataDeliveryTypes'],
    queryFn: () => getAllDataDeliveryTypes(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
