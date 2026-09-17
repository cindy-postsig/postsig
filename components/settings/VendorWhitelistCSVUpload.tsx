'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, X } from 'lucide-react';
import { CheckCircledIcon, Cross2Icon, TableIcon } from '@radix-ui/react-icons';
import { useToast } from '@/components/ui/use-toast';
import { useUploadVendorWhitelistCSV } from '@/hooks/api/useVendorWhitelist';

interface VendorWhitelistCSVUploadProps {
  canUpdate: boolean;
  currentCount: number;
  existingEntries?: string[];
  onSuccess?: () => void;
}

interface ParsedEntry {
  value: string;
  vendorName?: string;
  status: 'valid' | 'skip' | 'error';
  message?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function VendorWhitelistCSVUpload({
  canUpdate,
  currentCount,
  existingEntries = [],
  onSuccess,
}: VendorWhitelistCSVUploadProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewData, setPreviewData] = useState<ParsedEntry[]>([]);
  const uploadCSV = useUploadVendorWhitelistCSV();

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateDomainWildcard = (value: string): boolean => {
    const wildcardRegex = /^\*@[^\s@]+\.[^\s@]+$/;
    return wildcardRegex.test(value);
  };

  const validateEntry = (
    value: string,
  ): { valid: boolean; message?: string } => {
    if (!value.trim()) {
      return { valid: false, message: 'Empty entry' };
    }
    if (validateEmail(value) || validateDomainWildcard(value)) {
      return { valid: true };
    }
    return { valid: false, message: 'Invalid format' };
  };

  const parseCSV = (text: string, isReplaceMode: boolean): ParsedEntry[] => {
    const lines = text.split('\n');
    const seenValues = new Set<string>();
    const existingSet = new Set(existingEntries.map((e) => e.toLowerCase()));

    let emailColIndex = 0;
    let vendorNameColIndex = -1;
    const firstLine = lines[0]?.toLowerCase().trim() || '';
    const headers = firstLine.split(',').map((h) => h.trim());

    const emailIndex = headers.findIndex(
      (h) => h === 'email' || h === 'email_address',
    );
    const vendorIndex = headers.findIndex(
      (h) =>
        h === 'vendor_name' ||
        h === 'vendorname' ||
        h === 'vendor name' ||
        h === 'vendor',
    );

    const hasHeaders = emailIndex !== -1;
    if (hasHeaders) {
      emailColIndex = emailIndex;
      vendorNameColIndex = vendorIndex;
    }

    return lines
      .slice(hasHeaders ? 1 : 0)
      .map((line) => line.trim())
      .filter((line) => line)
      .map((line) => {
        const columns = line.split(',').map((col) => col.trim());
        const value = columns[emailColIndex]?.toLowerCase() || '';
        const vendorName =
          vendorNameColIndex >= 0 ? columns[vendorNameColIndex] : undefined;
        const validation = validateEntry(value);

        if (!validation.valid) {
          return {
            value,
            vendorName,
            status: 'error' as const,
            message: validation.message,
          };
        }

        if (seenValues.has(value)) {
          return {
            value,
            vendorName,
            status: 'skip' as const,
            message: 'Duplicate in CSV',
          };
        }

        if (!isReplaceMode && existingSet.has(value)) {
          return {
            value,
            vendorName,
            status: 'skip' as const,
            message: 'Already exists',
          };
        }

        seenValues.add(value);
        return { value, vendorName, status: 'valid' as const };
      });
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Please select a CSV file',
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Maximum file size is 5MB',
      });
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        toast({
          variant: 'destructive',
          title: 'Error reading file',
          description: 'The file appears to be empty',
        });
        return;
      }
      setPreviewData(parseCSV(text, replaceMode));
    };
    reader.onerror = () => {
      toast({
        variant: 'destructive',
        title: 'Error reading file',
        description: 'Failed to read the CSV file',
      });
      setSelectedFile(null);
      setPreviewData([]);
    };
    reader.readAsText(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreviewData([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const revalidatePreview = (newReplaceMode: boolean) => {
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      setPreviewData(parseCSV(text, newReplaceMode));
    };
    reader.onerror = () => {
      toast({
        variant: 'destructive',
        title: 'Error reading file',
        description: 'Failed to re-read the CSV file',
      });
    };
    reader.readAsText(selectedFile);
  };

  const handleReplaceModeChange = (newMode: boolean) => {
    setReplaceMode(newMode);
    revalidatePreview(newMode);
  };

  const validCount = previewData.filter((e) => e.status === 'valid').length;
  const skippedCount = previewData.filter(
    (e) => e.status === 'skip' || e.status === 'error',
  ).length;

  const handleUpload = async () => {
    if (!selectedFile) return;

    if (replaceMode && currentCount > 0) {
      setShowConfirmDialog(true);
      return;
    }

    await performUpload();
  };

  const performUpload = async () => {
    if (!selectedFile) return;

    try {
      const result = await uploadCSV.mutateAsync({
        file: selectedFile,
        replace: replaceMode,
      });

      const { summary } = result;
      const message = replaceMode
        ? `Replaced whitelist with ${summary.total} vendors`
        : `Added ${summary.added} new vendors${summary.updated > 0 ? `, updated ${summary.updated}` : ''}`;

      toast({
        title: 'Success',
        description: message,
      });

      clearFile();
      setReplaceMode(false);
      onSuccess?.();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to upload CSV';
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: errorMessage,
      });
    }
  };

  const handleConfirmReplace = async () => {
    setShowConfirmDialog(false);
    await performUpload();
  };

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv"
        onChange={handleInputChange}
        className="hidden"
      />

      {!selectedFile ? (
        <div
          className={`rounded border-[1.5px] border-dashed px-8 py-12 text-center transition-colors
            ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
            ${canUpdate ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
          onClick={() => canUpdate && fileInputRef.current?.click()}
          onDragOver={canUpdate ? handleDragOver : undefined}
          onDragLeave={canUpdate ? handleDragLeave : undefined}
          onDrop={canUpdate ? handleDrop : undefined}
        >
          <div className="flex flex-col items-center gap-2">
            <TableIcon className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm">
              Drop your CSV file here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Email addresses or domain wildcards (e.g., *@vendor.com)
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 py-2 pl-3 pr-2">
          <div className="flex flex-1 gap-2 text-sm">
            <span className="whitespace-nowrap border-r pr-2">
              {previewData.length} entries
            </span>
            <span className="truncate">{selectedFile.name}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFile}
            disabled={uploadCSV.isPending}
            className="px-2"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {previewData.length > 0 && (
        <div className="rounded-md border">
          <ScrollArea className="h-60">
            <Table stickyHeader scrollClassName={null}>
              <TableHeader>
                <TableRow>
                  <TableHead>Email / Domain</TableHead>
                  <TableHead>Vendor Name</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData.map((entry, index) => (
                  <TableRow key={index}>
                    <TableCell className="flex items-center gap-2 py-2">
                      {entry.status === 'valid' && (
                        <CheckCircledIcon className="text-green-500 h-4 w-4 shrink-0" />
                      )}
                      {(entry.status === 'error' ||
                        entry.status === 'skip') && (
                        <Cross2Icon className="h-4 w-4 shrink-0 text-destructive" />
                      )}
                      <span className="truncate">{entry.value}</span>
                    </TableCell>
                    <TableCell className="py-2">
                      <span className="truncate text-muted-foreground">
                        {entry.vendorName || '—'}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-muted-foreground">
                      {entry.message}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}

      {selectedFile && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="uploadMode"
                checked={!replaceMode}
                onChange={() => handleReplaceModeChange(false)}
                disabled={!canUpdate || uploadCSV.isPending}
                className="h-4 w-4"
              />
              Merge with existing
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="uploadMode"
                checked={replaceMode}
                onChange={() => handleReplaceModeChange(true)}
                disabled={!canUpdate || uploadCSV.isPending}
                className="h-4 w-4"
              />
              Replace existing
            </label>
          </div>
        </div>
      )}

      {selectedFile && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {skippedCount > 0 &&
              validCount > 0 &&
              `Skipping ${skippedCount} entries`}
            {skippedCount > 0 && validCount === 0 && 'No valid entries'}
          </p>
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={!canUpdate || uploadCSV.isPending || validCount === 0}
          >
            {uploadCSV.isPending
              ? 'Uploading...'
              : `Upload ${validCount} Entries`}
          </Button>
        </div>
      )}

      {!selectedFile && (
        <p className="text-xs text-muted-foreground">Max 5MB, 1000 entries.</p>
      )}

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace entire whitelist?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all {currentCount} existing vendor
              {currentCount !== 1 ? 's' : ''} and replace them with the contents
              of your CSV file. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReplace}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Replace All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
