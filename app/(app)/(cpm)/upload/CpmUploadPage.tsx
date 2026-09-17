'use client';

import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { UserMetadata } from '@/constants/types';
import {
  FileDropZone,
  type FileDropZoneHandle,
} from '@/components/documents/FileDropZone';
import type { UploadingFile } from '@/components/documents/types';
import { UploadQueueShell } from '@/components/documents/UploadQueueShell';
import { useUploadQueue } from '@/components/documents/useUploadQueue';
import { useCpmUploadProcessor } from './useCpmUploadProcessor';
import { useCpmUploadColumns } from './useCpmUploadColumns';
import { CpmRowEditProvider } from './CpmRowEditContext';
import { CpmDocumentsList } from './CpmDocumentsList';

import { DocuSignService } from '@/lib/api/docusign';
import DocuSignBrowser from '@/components/DocuSignBrowser';
import { useToast } from '@/components/ui/use-toast';
import { createClient } from '@/utils/supabase/client';
import { fetchDocuSignStatus as fetchDocuSignStatusUtils } from '@/lib/docusign/utils';
import { useWarnBeforeUnload } from '@/hooks/useWarnBeforeUnload';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const isDocuSignEnabled = process.env.DOCUSIGN_ENABLED === 'true';

interface AppDocuSignDocument {
  documentId: string;
  name: string;
  envelopeId: string;
  subject: string;
  status: string;
  createdDateTime: string;
  completedDateTime?: string;
  appUniqueId: string;
}

export interface CpmUploadFile extends UploadingFile {
  dbContractId?: number;
}

const MAX_FILES = 500;
const MAX_CONCURRENCY = 1;

interface ConfirmState {
  open: boolean;
  title: string;
  description: React.ReactNode;
}

export default function CpmUploadPage({ user }: { user: UserMetadata }) {
  const dropZoneRef = useRef<FileDropZoneHandle>(null);
  const { toast } = useToast();
  const supabase = createClient();

  const docuSignService = useMemo(() => new DocuSignService(), []);
  const [docuSignConnected, setDocuSignConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [docuSignDocuments, setDocuSignDocuments] = useState<
    AppDocuSignDocument[]
  >([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [showDocuSignBrowser, setShowDocuSignBrowser] = useState(false);
  const [downloadingDocuments] = useState<Record<string, boolean>>({});
  const [docuSignPopup, setDocuSignPopup] = useState<Window | null>(null);
  const popupPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { processor, abortUpload } = useCpmUploadProcessor({
    userId: user.userId,
    organizationId: user.organizationId,
    docuSignService,
  });

  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    title: '',
    description: '',
  });
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);
  const confirmDialog = useCallback(
    (title: string, description: React.ReactNode): Promise<boolean> =>
      new Promise((resolve) => {
        confirmResolveRef.current = resolve;
        setConfirmState({ open: true, title, description });
      }),
    [],
  );
  const handleConfirmResponse = useCallback((confirmed: boolean) => {
    setConfirmState((prev) => ({ ...prev, open: false }));
    confirmResolveRef.current?.(confirmed);
    confirmResolveRef.current = null;
  }, []);

  // Ref so processor callbacks can reach patchFile, which doesn't exist until
  // after useUploadQueue runs.
  const patchFileRef = useRef<
    ((id: string, patch: Partial<CpmUploadFile>) => void) | null
  >(null);

  const runUpload = useCallback(
    async (file: File, id: string) => {
      patchFileRef.current?.(id, { status: 'uploading', progress: 0 });
      try {
        const result = await processor(file, {
          onProgress: (computable, loaded, total) => {
            if (computable && typeof total === 'number' && total > 0) {
              patchFileRef.current?.(id, {
                progress: Math.round((loaded / total) * 100),
                errorMessage: undefined,
              });
            } else if (!computable && typeof total === 'string') {
              patchFileRef.current?.(id, { errorMessage: total });
            }
          },
          onStatusChange: (status) => {
            patchFileRef.current?.(id, { status });
          },
          confirmDialog,
        });
        if (result.success) {
          const dbContractId =
            typeof result.documentId === 'number'
              ? result.documentId
              : undefined;
          patchFileRef.current?.(id, { status: 'uploaded', dbContractId });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Upload failed';
        patchFileRef.current?.(id, {
          status: 'error',
          errorMessage: message,
        });
      }
    },
    [processor, confirmDialog],
  );

  const queue = useUploadQueue<CpmUploadFile>({
    runUpload,
    abortInFlight: (row) => abortUpload(row.fileName),
    createRow: (base) => ({ ...base, dbContractId: undefined }),
    maxFiles: MAX_FILES,
    maxConcurrency: MAX_CONCURRENCY,
  });
  patchFileRef.current = queue.patchFile;

  useWarnBeforeUnload(queue.hasActiveUpload);

  const fetchDocuSignStatus = useCallback(async () => {
    try {
      const isConnected = await fetchDocuSignStatusUtils(supabase, user.userId);
      setDocuSignConnected(isConnected);
      return isConnected;
    } catch {
      return false;
    }
  }, [supabase, user.userId]);

  const fetchDocuSignDocuments = useCallback(async () => {
    if (!isDocuSignEnabled) return;
    try {
      setLoadingDocuments(true);
      const { data, error } = await docuSignService.listDocuments();
      if (error) throw error;
      const documentsWithUniqueId = (data?.documents || []).map(
        (doc: Omit<AppDocuSignDocument, 'appUniqueId'>) => ({
          ...doc,
          appUniqueId: `${doc.envelopeId}-${doc.documentId}`,
        }),
      );
      setDocuSignDocuments(documentsWithUniqueId);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch DocuSign documents',
      });
    } finally {
      setLoadingDocuments(false);
    }
  }, [docuSignService, toast]);

  useEffect(() => {
    if (isDocuSignEnabled) {
      fetchDocuSignStatus();
    }
  }, [fetchDocuSignStatus]);

  const openDocuSignBrowser = useCallback(() => {
    if (!isDocuSignEnabled) return;
    setShowDocuSignBrowser(true);
    fetchDocuSignDocuments();
  }, [fetchDocuSignDocuments]);

  useEffect(() => {
    if (
      isDocuSignEnabled &&
      typeof window !== 'undefined' &&
      docuSignConnected
    ) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('openDocuSign') === 'true') {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('openDocuSign');
        window.history.replaceState({}, '', newUrl);
        setTimeout(() => {
          openDocuSignBrowser();
        }, 500);
      }
    }
  }, [docuSignConnected, openDocuSignBrowser]);

  useEffect(() => {
    if (isDocuSignEnabled && docuSignPopup) {
      popupPollIntervalRef.current = setInterval(async () => {
        try {
          if (docuSignPopup.closed) {
            if (popupPollIntervalRef.current) {
              clearInterval(popupPollIntervalRef.current);
            }
            setDocuSignPopup(null);
            return;
          }
          const isConnected = await fetchDocuSignStatus();
          if (isConnected) {
            if (popupPollIntervalRef.current) {
              clearInterval(popupPollIntervalRef.current);
            }
            docuSignPopup.close();
            setDocuSignPopup(null);
            toast({
              title: 'DocuSign Connected',
              description: 'Your account is now connected.',
            });
          }
        } catch {
          // best-effort poll
        }
      }, 1000);
    }
    return () => {
      if (popupPollIntervalRef.current) {
        clearInterval(popupPollIntervalRef.current);
      }
    };
  }, [docuSignPopup, fetchDocuSignStatus, toast]);

  const connectDocuSign = async () => {
    if (!isDocuSignEnabled) return;
    try {
      setLoading(true);
      const returnUrl = window.location.pathname + window.location.search;
      const returnUrlObj = new URL(window.location.origin + returnUrl);
      returnUrlObj.searchParams.set('openDocuSign', 'true');
      const enhancedReturnUrl = returnUrlObj.pathname + returnUrlObj.search;

      const { data, error } =
        await docuSignService.getAuthUrl(enhancedReturnUrl);
      if (error) throw error;
      if (!data?.url) throw new Error('Failed to get DocuSign auth URL.');

      const popup = window.open(
        data.url,
        'docusign_auth',
        'width=600,height=700,menubar=no,toolbar=no,location=no,status=no',
      );
      setDocuSignPopup(popup);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to initiate DocuSign connection: ${message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDocuSignUpload = () => {
    if (!isDocuSignEnabled) return;
    if (!docuSignConnected) {
      connectDocuSign();
      return;
    }
    openDocuSignBrowser();
  };

  const handleDocumentSelect = useCallback((id: string, selected: boolean) => {
    setSelectedDocuments((prev) => {
      const index = prev.indexOf(id);
      const isCurrentlySelected = index !== -1;
      if (selected && !isCurrentlySelected) return [...prev, id];
      if (!selected && isCurrentlySelected) {
        const next = [...prev];
        next.splice(index, 1);
        return next;
      }
      return prev;
    });
  }, []);

  const importSelectedDocuments = useCallback(async () => {
    if (!isDocuSignEnabled) return;
    if (selectedDocuments.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Documents Selected',
        description: 'Please select at least one document to import',
      });
      return;
    }

    const selectedDocs = docuSignDocuments.filter((doc) =>
      selectedDocuments.includes(doc.appUniqueId),
    );

    // The processor sniffs DocuSign placeholders by parsing the file body as
    // JSON — the synthetic File's content IS the metadata.
    const placeholders: File[] = selectedDocs.map((doc) => {
      const payload = JSON.stringify({
        documentId: doc.documentId,
        envelopeId: doc.envelopeId,
        name: doc.name,
        isDocuSign: true,
      });
      return new File([payload], doc.name, { type: 'application/pdf' });
    });
    queue.handleFiles(placeholders);

    toast({
      title: 'Documents Added',
      description: `Added ${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''} to upload queue`,
    });

    setShowDocuSignBrowser(false);
  }, [docuSignDocuments, selectedDocuments, queue, toast]);

  useEffect(() => {
    if (!showDocuSignBrowser) {
      setSelectedDocuments([]);
    }
  }, [showDocuSignBrowser]);

  const columns = useCpmUploadColumns({ onRemove: queue.removeFile });

  const rowWrapper = useCallback(
    (file: CpmUploadFile, children: React.ReactNode) => (
      <CpmRowEditProvider
        key={file.id}
        file={file}
        organizationId={user.organizationId}
      >
        {children}
      </CpmRowEditProvider>
    ),
    [user.organizationId],
  );

  const displayFiles = useMemo(() => {
    const uploaded = queue.files.filter((f) => f.status === 'uploaded');
    const others = queue.files.filter((f) => f.status !== 'uploaded');
    return [...uploaded, ...others];
  }, [queue.files]);

  const headerText = queue.hasActiveUpload
    ? 'Upload in progress'
    : queue.hasUploaded
      ? "We're preparing your contract(s) for use."
      : 'Documents to upload';

  return (
    <div>
      <div id="uploadPanel">
        <div
          id="uploadHeader"
          className="sticky top-14 z-20 -mt-6 flex items-center justify-between bg-background py-6"
        >
          <div className="leading-tight">
            <h1 className="font-serif">Document Upload</h1>
            <span className="font-sans text-sm text-muted-foreground">
              {user.organizationName ||
                user.userProfile?.name ||
                user.userProfile?.email}
            </span>
          </div>
          {!queue.hasActiveUpload && (
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="lg"
                onClick={() => dropZoneRef.current?.browse()}
              >
                Browse Files
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => dropZoneRef.current?.browseFolder()}
              >
                Browse Folders
              </Button>
              {isDocuSignEnabled && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleDocuSignUpload}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : docuSignConnected ? (
                    'Import from DocuSign'
                  ) : (
                    'Connect DocuSign'
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        <UploadQueueShell<CpmUploadFile>
          queue={queue}
          columns={columns}
          rowWrapper={rowWrapper}
          displayFiles={displayFiles}
          headerText={headerText}
          maxHeightVh={66}
          dropZoneRef={dropZoneRef}
          variant="cpm"
          maxFiles={MAX_FILES}
        />
      </div>

      {isDocuSignEnabled && (
        <DocuSignBrowser
          isOpen={showDocuSignBrowser}
          onOpenChange={setShowDocuSignBrowser}
          isLoading={loadingDocuments}
          documents={docuSignDocuments}
          selectedDocuments={selectedDocuments}
          downloadingDocuments={downloadingDocuments}
          onFetchDocuments={fetchDocuSignDocuments}
          onSelectDocument={handleDocumentSelect}
          onImportSelected={importSelectedDocuments}
        />
      )}

      <AlertDialog
        open={confirmState.open}
        onOpenChange={(open) => {
          if (!open) handleConfirmResponse(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                {confirmState.description}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleConfirmResponse(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleConfirmResponse(true)}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CpmDocumentsList />
    </div>
  );
}
