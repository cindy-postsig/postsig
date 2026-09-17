'use client';

import { useState, useCallback, useRef } from 'react';
import { FilePond, registerPlugin } from 'react-filepond';
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';
import 'filepond/dist/filepond.min.css';
import '@/components/upload/FileUpload.css';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { createClient } from '@/utils/supabase/client';
import {
  sanitizeFileName,
  buildSafePath,
  PathTraversalError,
} from '@/utils/helpers';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUploadContractVersion } from '@/hooks/api/useUploadContractVersion';
import { UploadIcon } from '@radix-ui/react-icons';

registerPlugin(FilePondPluginFileValidateType);

interface UploadContractVersionButtonProps {
  contractId: number;
  originalUserId: string | null | undefined;
  variant?: 'text' | 'icon';
  tooltip?: string;
}

const UploadContractVersionButton = ({
  contractId,
  originalUserId,
  variant = 'text',
  tooltip = 'Upload Executed Version',
}: UploadContractVersionButtonProps) => {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  const filePondRef = useRef<FilePond | null>(null);
  const { toast } = useToast();
  const supabase = createClient();
  const router = useRouter();
  const uploadVersionMutation = useUploadContractVersion();

  const uploadFile = useCallback(
    async (
      file: File,
      load: (id: string) => void,
      error: (message: string) => void,
      progress: (computable: boolean, loaded: number, total: number) => void,
    ) => {
      if (!originalUserId) {
        error('Original contract owner not found.');
        return;
      }

      try {
        progress(true, 0, 100);
        const sanitized = sanitizeFileName(file.name);
        const timestamp = new Date().toISOString().replace(/[:]/g, '-');
        const fileName = `${timestamp}-${sanitized}`;
        let path: string;
        try {
          path = buildSafePath([originalUserId, fileName]);
        } catch (pathError) {
          if (pathError instanceof PathTraversalError) {
            error('Invalid file path');
            return;
          }
          throw pathError;
        }

        progress(true, 30, 100);

        const { error: uploadError } = await supabase.storage
          .from('contract_docs')
          .upload(path, file, { contentType: 'application/pdf' });

        if (uploadError) throw uploadError;

        progress(true, 70, 100);

        await uploadVersionMutation.mutateAsync({
          contractId,
          filePath: path,
          fileName: sanitized,
          description: 'executed copy',
        });

        progress(true, 100, 100);
        load(path);

        toast({
          title: 'Version Uploaded',
          description: 'New executed version stored successfully.',
        });

        setOpen(false);
        router.refresh();
      } catch (err: any) {
        error(err.message);
        toast({
          variant: 'destructive',
          title: 'Upload failed',
          description: err.message,
        });
      }
    },
    [
      originalUserId,
      contractId,
      supabase,
      toast,
      uploadVersionMutation,
      router,
    ],
  );

  const handleUpload = useCallback(() => {
    if (!hasFile || !filePondRef.current) {
      toast({
        variant: 'destructive',
        title: 'No file selected',
        description: 'Choose a PDF to upload.',
      });
      return;
    }
    if (!originalUserId) {
      toast({
        variant: 'destructive',
        title: 'Missing owner',
        description: 'Original contract owner not found.',
      });
      return;
    }
    setUploading(true);
    filePondRef.current.processFiles().finally(() => {
      setUploading(false);
    });
  }, [hasFile, originalUserId, toast]);

  const handleDialogChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setHasFile(false);
    }
  };

  return (
    <>
      {variant === 'text' ? (
        <Button variant={'outline'} onClick={() => setOpen(true)}>
          Upload Executed Version
        </Button>
      ) : (
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setOpen(true)}
            title={tooltip}
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-background text-foreground hover:bg-muted disabled:opacity-50"
            aria-label="Upload executed version"
            disabled={uploading}
          >
            <UploadIcon className="h-4 w-4" />
          </button>
        </div>
      )}
      <Dialog open={open} onOpenChange={handleDialogChange}>
        <DialogContent
          className="flex max-w-md flex-col gap-0"
          onContextMenu={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Upload Executed Version</DialogTitle>
            <DialogDescription>
              Provide the executed PDF. It will be stored alongside prior
              versions.
            </DialogDescription>
          </DialogHeader>
          <div className="upload-version-dialog space-y-4 pt-4">
            <FilePond
              ref={filePondRef}
              allowMultiple={false}
              maxFiles={1}
              credits={false}
              acceptedFileTypes={['application/pdf']}
              instantUpload={false}
              allowProcess={false}
              allowRevert={false}
              labelIdle='Drag & drop a PDF or <span class="filepond--label-action">Browse</span>'
              labelFileProcessingComplete="Uploaded"
              disabled={uploading}
              server={{
                process: (
                  _fieldName,
                  file,
                  _metadata,
                  load,
                  error,
                  progress,
                ) => {
                  uploadFile(file as File, load, error, progress);
                  return {
                    abort: () => {},
                  };
                },
              }}
              onupdatefiles={(fileItems) => {
                setHasFile(fileItems.length > 0);
              }}
            />
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => handleDialogChange(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={uploading || !hasFile}>
                {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {uploading ? 'Uploading…' : 'Upload'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UploadContractVersionButton;
