'use client';

import { useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { useProcessContract } from '@/hooks/api/useProcessContract';
import { useProcessContractZip } from '@/hooks/api/useProcessContractZip';
import {
  sanitizeFileName,
  buildSafePath,
  PathTraversalError,
} from '@/utils/helpers';
import { ValidationError, DatabaseError } from '@/lib/errors';
import { overrideContract } from '@/data/superuser/contracts';
import { ModelProvider } from '@/constants/types';
import { DocuSignService } from '@/lib/api/docusign';
import { apiClient } from '@/lib/api/v2-client';
import type {
  UploadProcessor,
  UploadProcessorResult,
} from '@/components/documents/types';
import * as tus from 'tus-js-client';
import {
  buildTusOptions,
  clearStaleTusFingerprint,
  isActiveUpload,
  isOffline,
  isNetworkError,
  isSessionExpired,
  registerActiveUpload,
  unregisterActiveUpload,
  type TusCallbacks,
  type TokenGetter,
} from '@/lib/upload/tus-upload';

const isDocuSignEnabled = process.env.DOCUSIGN_ENABLED === 'true';

function waitForOnline(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    window.addEventListener('online', () => resolve(), { once: true });
  });
}

function handleTusNetworkError(
  upload: tus.Upload,
  cbs: TusUploadCallbacks,
  onBeforeResume?: () => void,
): void {
  cbs.onPause?.(
    'Upload paused — waiting for network. Will resume automatically.',
  );
  waitForOnline().then(() => {
    // If the upload was aborted while we were waiting (e.g. SIGNED_OUT in
    // another tab triggered abortAllActiveUploads), do not resume — the
    // session is gone and starting again would 401, leading tus to discard
    // the upload URL and restart from byte 0.
    if (!isActiveUpload(upload)) return;
    onBeforeResume?.();
    cbs.onResume?.();
    upload.start();
  });
}

interface TusUploadCallbacks {
  onProgress: (loaded: number, total: number) => void;
  onPause?: (message: string) => void;
  onResume?: () => void;
}

function makeOnError(
  uploadRef: { current: tus.Upload | null },
  callbacks: TusUploadCallbacks,
  reject: (err: Error) => void,
  resetToAcceptedProgress?: () => void,
  cleanup?: () => void,
  onBeforeResume?: () => void,
) {
  return (message: string, rawErr: Error) => {
    const upload = uploadRef.current;
    if (isSessionExpired(rawErr)) {
      cleanup?.();
      if (upload) unregisterActiveUpload(upload);
      return reject(new DatabaseError(message));
    }
    if (isNetworkError(rawErr)) {
      resetToAcceptedProgress?.();
      if (upload) handleTusNetworkError(upload, callbacks, onBeforeResume);
      return;
    }
    cleanup?.();
    if (upload) unregisterActiveUpload(upload);
    reject(new DatabaseError(message));
  };
}

export interface TusUploadHandle {
  promise: Promise<void>;
  abort: () => void;
}

export function tusUpload(
  file: File,
  bucket: string,
  objectPath: string,
  accessToken: string,
  getToken: TokenGetter,
  callbacks: TusUploadCallbacks,
): TusUploadHandle {
  let abortFn: () => void = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    const uploadRef: { current: tus.Upload | null } = { current: null };
    let acceptedLoaded = 0;
    let knownTotal = file.size;
    let networkPaused = false;

    const reportAcceptedProgress = () => {
      if (knownTotal > 0) callbacks.onProgress(acceptedLoaded, knownTotal);
    };
    const pauseAtAcceptedProgress = () => {
      networkPaused = true;
      reportAcceptedProgress();
    };
    const handleOffline = () => pauseAtAcceptedProgress();
    if (typeof window !== 'undefined') {
      window.addEventListener('offline', handleOffline);
    }
    const cleanup = () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('offline', handleOffline);
      }
    };

    const tusCallbacks: TusCallbacks = {
      onError: makeOnError(
        uploadRef,
        callbacks,
        reject,
        pauseAtAcceptedProgress,
        cleanup,
        () => {
          networkPaused = false;
        },
      ),
      // Only server-confirmed chunk progress moves the percentage. tus
      // onProgress is browser-send progress and can include bytes that are
      // replayed after network interruptions.
      onProgress: (loaded, total) => {
        knownTotal = total;
        if (networkPaused || isOffline()) {
          pauseAtAcceptedProgress();
          return;
        }
      },
      onChunkComplete: (_chunkSize, bytesAccepted, bytesTotal) => {
        if (networkPaused || isOffline()) {
          pauseAtAcceptedProgress();
          return;
        }
        acceptedLoaded = bytesAccepted;
        knownTotal = bytesTotal;
        networkPaused = false;
        callbacks.onProgress(bytesAccepted, bytesTotal);
      },
      onSuccess: () => {
        cleanup();
        if (uploadRef.current) unregisterActiveUpload(uploadRef.current);
        resolve();
      },
    };
    const opts = buildTusOptions(
      file,
      bucket,
      objectPath,
      accessToken,
      tusCallbacks,
      getToken,
    );

    const upload = new tus.Upload(file, opts);
    uploadRef.current = upload;
    registerActiveUpload(upload);

    abortFn = () => {
      try {
        upload.abort(true);
      } catch {
        // best-effort
      }
      cleanup();
      unregisterActiveUpload(upload);
      reject(new Error('Upload cancelled'));
    };

    clearStaleTusFingerprint(upload)
      .then(() => {
        // If SIGNED_OUT fired between register and now, abortAllActiveUploads
        // already aborted this upload and removed it from the registry. Don't
        // call start() — that would issue a request with a stale token, which
        // tus would 401 → discard URL → restart from byte 0.
        if (!isActiveUpload(upload)) {
          return reject(
            new DatabaseError(
              'Upload stopped — session expired. Please sign in again.',
            ),
          );
        }
        upload.start();
      })
      .catch((err) => {
        cleanup();
        unregisterActiveUpload(upload);
        reject(err);
      });
  });
  return { promise, abort: () => abortFn() };
}

interface UseCpmUploadProcessorOptions {
  userId: string;
  organizationId: string;
  docuSignService?: DocuSignService;
}

export interface CpmUploadProcessorResult {
  processor: UploadProcessor;
  abortUpload: (fileName: string) => void;
}

function isCpmZipFile(file: File): boolean {
  return (
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed' ||
    file.name.toLowerCase().endsWith('.zip')
  );
}

function normalizeFileName(fileName: string): string {
  const ext = fileName.split('.').pop();
  if (!ext) throw new Error('Invalid file');
  if (ext.toLowerCase() === 'pdf') {
    return fileName.slice(0, -ext.length) + 'pdf';
  }
  return fileName;
}

export function useCpmUploadProcessor({
  userId,
  organizationId,
  docuSignService,
}: UseCpmUploadProcessorOptions): CpmUploadProcessorResult {
  const supabase = createClient();
  const { toast } = useToast();
  const { mutateAsync: processContract } = useProcessContract();
  const { mutateAsync: processZip } = useProcessContractZip();
  const tusHandlesRef = useRef(new Map<string, TusUploadHandle>());

  const processor: UploadProcessor = useCallback(
    async (file, callbacks) => {
      const name = file.name;
      const normalized = normalizeFileName(name);
      const onRegisterTusHandle = (h: TusUploadHandle) =>
        tusHandlesRef.current.set(name, h);

      const common = { ...callbacks, onRegisterTusHandle };
      const run = isCpmZipFile(file)
        ? handleZipUpload(file, normalized, {
            userId,
            organizationId,
            supabase,
            processZip,
            ...common,
          })
        : handlePdfUpload(file, normalized, {
            userId,
            organizationId,
            supabase,
            toast,
            processContract,
            docuSignService: isDocuSignEnabled ? docuSignService : undefined,
            ...common,
          });

      try {
        return await run;
      } finally {
        tusHandlesRef.current.delete(name);
      }
    },
    [
      userId,
      organizationId,
      supabase,
      toast,
      processContract,
      processZip,
      docuSignService,
    ],
  );

  const abortUpload = useCallback((fileName: string) => {
    const handle = tusHandlesRef.current.get(fileName);
    if (!handle) return;
    handle.abort();
    tusHandlesRef.current.delete(fileName);
  }, []);

  return { processor, abortUpload };
}

async function handleZipUpload(
  file: File,
  fileName: string,
  {
    userId,
    organizationId,
    supabase,
    processZip,
    onProgress,
    onStatusChange,
    confirmDialog,
    onRegisterTusHandle,
  }: {
    userId: string;
    organizationId: string;
    supabase: ReturnType<typeof createClient>;
    processZip: (payload: {
      fileName: string;
      filePath: string;
      fileSize: number;
    }) => Promise<{ success: boolean }>;
    onProgress: (
      computable: boolean,
      loaded: number,
      total: number | string,
    ) => void;
    onStatusChange: (
      status: 'uploading' | 'processing' | 'uploaded' | 'error',
    ) => void;
    onRegisterTusHandle?: (handle: TusUploadHandle) => void;
    confirmDialog: (
      title: string,
      description: React.ReactNode,
    ) => Promise<boolean>;
  },
): Promise<UploadProcessorResult> {
  onStatusChange('uploading');
  onProgress(false, 0, 'Starting upload...');

  const sanitizedFileName = sanitizeFileName(fileName);

  onProgress(false, 30, 'Checking for duplicates...');
  const { exists, existingSize, existingNames } =
    await apiClient.contracts.verifyZipUpload({ fileName: sanitizedFileName });

  let finalFileName = sanitizedFileName;

  if (exists) {
    const sameSize = existingSize !== undefined && existingSize === file.size;
    const confirmUpload = await confirmDialog(
      'Duplicate File',
      <>
        A file named <strong>{sanitizedFileName}</strong> already exists
        {sameSize
          ? ', with the same file size — this may be the same file'
          : ''}
        . Would you like to upload anyway? The new file will be saved with a
        different name.
      </>,
    );
    if (!confirmUpload) {
      throw new ValidationError('File upload cancelled by user.');
    }

    const baseName = sanitizedFileName.replace(/\.zip$/i, '');
    let suffix = 2;
    const nameSet = new Set(existingNames);
    while (nameSet.has(`${baseName}-${suffix}.zip`)) {
      suffix++;
    }
    finalFileName = `${baseName}-${suffix}.zip`;
  }

  let bulkPath: string;
  try {
    bulkPath = buildSafePath([userId, 'bulk', finalFileName]);
  } catch (pathError) {
    if (pathError instanceof PathTraversalError) {
      throw new ValidationError('Invalid file path');
    }
    throw pathError;
  }

  onProgress(false, 0, 'Uploading ZIP to storage...');
  const zipFile = new File([file], finalFileName, { type: file.type });

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new DatabaseError('Session expired — please sign in again');
  }
  const getToken: TokenGetter = async () => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    return s?.access_token ?? null;
  };

  const tusHandle = tusUpload(
    zipFile,
    'contract_docs',
    bulkPath,
    session.access_token,
    getToken,
    {
      onProgress: (loaded, total) => onProgress(true, loaded, total),
      onPause: (msg) => onProgress(false, 0, msg),
      onResume: () => onProgress(false, 0, 'Resuming upload...'),
    },
  );
  onRegisterTusHandle?.(tusHandle);
  await tusHandle.promise;

  onProgress(false, 85, 'Triggering processing...');
  onStatusChange('processing');
  await processZip({
    fileName: finalFileName,
    filePath: bulkPath,
    fileSize: file.size,
  });

  onStatusChange('uploaded');
  onProgress(true, 100, 'Upload complete');

  return { success: true };
}

async function handlePdfUpload(
  file: File,
  fileName: string,
  {
    userId,
    supabase,
    toast,
    processContract,
    onProgress,
    onStatusChange,
    confirmDialog,
    docuSignService,
    onRegisterTusHandle,
  }: {
    userId: string;
    organizationId: string;
    supabase: ReturnType<typeof createClient>;
    toast: ReturnType<
      typeof import('@/components/ui/use-toast').useToast
    >['toast'];
    processContract: (payload: {
      fileName: string;
      modelProvider: ModelProvider;
      processType: string;
    }) => Promise<{ contractId?: number }>;
    onProgress: (
      computable: boolean,
      loaded: number,
      total: number | string,
    ) => void;
    onStatusChange: (
      status: 'uploading' | 'processing' | 'uploaded' | 'error',
    ) => void;
    confirmDialog: (
      title: string,
      description: React.ReactNode,
    ) => Promise<boolean>;
    docuSignService?: DocuSignService;
    onRegisterTusHandle?: (handle: TusUploadHandle) => void;
  },
): Promise<UploadProcessorResult> {
  onStatusChange('uploading');
  onProgress(false, 30, 'Processing file...');

  let isDocuSign = false;
  let docuSignData:
    | {
        documentId: string;
        envelopeId: string;
        name: string;
        isDocuSign: boolean;
      }
    | undefined;

  if (docuSignService) {
    try {
      const fileContent = await file.text();
      const data = JSON.parse(fileContent);
      if (data.isDocuSign) {
        isDocuSign = true;
        docuSignData = data;
      }
    } catch {
      // Not a DocuSign file placeholder, continue with normal upload
    }
  }

  let parsedFile: File;
  if (isDocuSign && docuSignData && docuSignService) {
    onProgress(false, 50, 'Downloading DocuSign document...');
    const { data, error } = await docuSignService.downloadDocument(
      docuSignData.documentId,
      docuSignData.envelopeId,
      docuSignData.name,
    );

    if (error) throw error;
    if (!data) throw new Error('Failed to download DocuSign document');

    onProgress(false, 70, 'Processing document...');
    parsedFile = new File([data], fileName, { type: 'application/pdf' });
  } else {
    onProgress(false, 50, 'Checking for duplicates...');
    parsedFile = new File([file], fileName, { type: file.type });
  }

  const sanitizedFileName = sanitizeFileName(fileName);
  let filePath: string;
  try {
    filePath = buildSafePath([userId, sanitizedFileName]);
  } catch (pathError) {
    if (pathError instanceof PathTraversalError) {
      throw new ValidationError('Invalid file path');
    }
    throw pathError;
  }

  const checkResponse = await fetch('/api/contract/verify-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: sanitizedFileName }),
  });

  if (!checkResponse.ok) {
    throw new Error(
      'Sorry, something went wrong while trying to upload the file. Please try again later.',
    );
  }

  const {
    isDuplicate,
    contractId: existingContractId,
    currentFilePath,
  } = await checkResponse.json();

  if (isDuplicate) {
    const confirmOverride = await confirmDialog(
      'Duplicate File',
      `A file with the same name as "${fileName}" already exists. Do you want to override it? This will archive the existing file.`,
    );
    if (!confirmOverride) {
      throw new ValidationError('File upload cancelled by user.');
    }

    onProgress(false, 70, 'Archiving existing file...');
    const { success } = await overrideContract(
      sanitizedFileName,
      existingContractId,
      currentFilePath,
    );
    if (!success) {
      throw new DatabaseError(
        'Failed to override the existing file. Please try again.',
      );
    }
    toast({
      title: 'File Overridden',
      description: `The existing file ${fileName} has been successfully archived. It will no longer be available to view in the dashboard`,
    });
  }

  onProgress(false, 0, 'Uploading to storage...');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new DatabaseError('Session expired — please sign in again');
  }
  const getToken: TokenGetter = async () => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    return s?.access_token ?? null;
  };

  const tusHandle = tusUpload(
    parsedFile,
    'contract_docs',
    filePath,
    session.access_token,
    getToken,
    {
      onProgress: (loaded, total) => onProgress(true, loaded, total),
      onPause: (msg) => onProgress(false, 0, msg),
      onResume: () => onProgress(false, 0, 'Resuming upload...'),
    },
  );
  onRegisterTusHandle?.(tusHandle);
  await tusHandle.promise;

  onProgress(false, 95, 'Processing upload...');
  onStatusChange('processing');
  const { contractId: dbContractId } = await processContract({
    fileName: sanitizedFileName,
    modelProvider: ModelProvider.google,
    processType: 'initial',
  });

  onStatusChange('uploaded');
  onProgress(true, 100, 'Upload complete');

  return { success: true, documentId: dbContractId };
}
