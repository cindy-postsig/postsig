import type { ReactNode } from 'react';

export type UploadStatus =
  | 'ready'
  | 'uploading'
  | 'processing'
  | 'uploaded'
  | 'error'
  | 'unsupported';

export interface UploadingFile {
  id: string;
  fileName: string;
  status: UploadStatus;
  errorMessage?: string;
  progress?: number;
  meta?: Record<string, unknown>;
}

export interface UploadProcessorResult {
  success: boolean;
  documentId?: string | number;
}

export interface UploadProcessorCallbacks {
  onProgress: (
    computable: boolean,
    loaded: number,
    total: number | string,
  ) => void;
  onStatusChange: (status: UploadStatus) => void;
  confirmDialog: (title: string, description: ReactNode) => Promise<boolean>;
}

export type UploadProcessor = (
  file: File,
  callbacks: UploadProcessorCallbacks,
) => Promise<UploadProcessorResult>;
