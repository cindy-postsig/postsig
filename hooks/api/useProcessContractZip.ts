'use client';

import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/v2-client';

interface ProcessZipPayload {
  fileName: string;
  filePath: string;
  fileSize: number;
}

export function useProcessContractZip() {
  return useMutation({
    mutationFn: (payload: ProcessZipPayload) =>
      apiClient.contracts.processZip(payload),
  });
}
