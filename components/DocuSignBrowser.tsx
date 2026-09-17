import { useCallback, useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AppDocuSignDocument as DocuSignDocument } from '@/lib/api/docusign';
import { Checkbox } from './ui/checkbox';
import { useDateFormat } from '@/hooks/useDateFormat';

interface DocuSignBrowserProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isLoading: boolean;
  documents: DocuSignDocument[];
  selectedDocuments: string[];
  downloadingDocuments: Record<string, boolean>;
  onFetchDocuments: () => void;
  onSelectDocument: (appUniqueId: string, selected: boolean) => void;
  onImportSelected: () => void;
}

const DocumentItem = ({
  doc,
  isSelected,
  isDownloading,
  onToggleSelect,
}: {
  doc: DocuSignDocument;
  isSelected: boolean;
  isDownloading: boolean;
  onToggleSelect: (appUniqueId: string) => void;
}) => {
  const { formatDate } = useDateFormat();
  return (
    <div className="flex items-center justify-between rounded-lg p-2 hover:bg-muted">
      <div className="flex items-center space-x-2">
        <Checkbox
          id={doc.appUniqueId}
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(doc.appUniqueId)}
        />
        <label
          htmlFor={doc.appUniqueId}
          className="flex cursor-pointer flex-col text-sm"
          onClick={(e) => {
            e.preventDefault();
            onToggleSelect(doc.appUniqueId);
          }}
        >
          <span className="font-medium">{doc.name}</span>
          <span className="text-xs text-muted-foreground">
            Status: {doc.status} • {formatDate(doc.createdDateTime)}
          </span>
        </label>
      </div>
      {isDownloading && (
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      )}
    </div>
  );
};

const DocuSignBrowser = ({
  isOpen,
  onOpenChange,
  isLoading,
  documents,
  selectedDocuments: externalSelectedDocuments,
  downloadingDocuments,
  onFetchDocuments,
  onSelectDocument,
  onImportSelected,
}: DocuSignBrowserProps) => {
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());

  // Sync local state with external state when the dialog opens
  useEffect(() => {
    if (isOpen) {
      setLocalSelected(new Set(externalSelectedDocuments));
    }
  }, [isOpen, externalSelectedDocuments]);

  const toggleSelection = useCallback(
    (id: string) => {
      setLocalSelected((prev) => {
        const newSet = new Set(prev);
        const isCurrentlySelected = newSet.has(id);
        if (isCurrentlySelected) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        onSelectDocument(id, !isCurrentlySelected);
        return newSet;
      });
    },
    [onSelectDocument],
  );

  const selectedArray = Array.from(localSelected);

  const handleDialogChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setLocalSelected(new Set());
      }
      onOpenChange(open);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-md md:max-w-lg">
        <div className="flex items-center justify-between border-b pb-4">
          <h2 className="font-medium text-lg">DocuSign Documents</h2>
          {/* Use handleDialogChange(false) for explicit close actions */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDialogChange(false)}
          ></Button>
        </div>

        {isLoading ? (
          <div className="flex h-60 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading documents...</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex h-60 items-center justify-center text-center">
            <div>
              <p className="text-muted-foreground">
                No documents found in your DocuSign account
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={onFetchDocuments}
              >
                Refresh Documents
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ScrollArea className="h-60 rounded-md border p-2">
              <div className="space-y-1">
                {documents.map((doc) => {
                  const isSelected = localSelected.has(doc.appUniqueId);
                  return (
                    <DocumentItem
                      key={doc.appUniqueId}
                      doc={doc}
                      isSelected={isSelected}
                      isDownloading={
                        !!downloadingDocuments[doc.appUniqueId] ||
                        !!downloadingDocuments[doc.documentId]
                      }
                      onToggleSelect={toggleSelection}
                    />
                  );
                })}
              </div>
            </ScrollArea>

            <div className="flex justify-end space-x-2 pt-4">
              {/* Use handleDialogChange(false) for explicit close actions */}
              <Button
                variant="outline"
                onClick={() => handleDialogChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={onImportSelected}
                disabled={
                  selectedArray.length === 0 ||
                  Object.values(downloadingDocuments).some((v) => v)
                }
                className="w-2/5"
              >
                Import Selected ({selectedArray.length})
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DocuSignBrowser;
export type { DocuSignDocument };
