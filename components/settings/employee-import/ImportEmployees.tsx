'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadIcon } from '@radix-ui/react-icons';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { apiClient, ApiRequestError } from '@/lib/api/v2-client';
import {
  MAX_IMPORT_FILE_SIZE,
  validateImportFile,
} from '@/lib/v2/employee-import/validate-file';
import type {
  EmployeeImportMapping,
  ImportTargetField,
} from '@/lib/v2/employee-import/types';
import type { PreviewResponse } from '@/lib/v2/employee-import/service';
import logger from '@/utils/pino';
import { ColumnMappingStep } from './ColumnMappingStep';
import { PreviewStep } from './PreviewStep';

const PREVIEW_DEBOUNCE_MS = 400;

type Step = 'upload' | 'map' | 'preview';

type Props = {
  savedMapping: EmployeeImportMapping | null;
  orgGroups: Array<{ id: number; name: string }>;
  onImportComplete: () => void;
  onMappingSaved?: (mapping: EmployeeImportMapping) => void;
};

function emptyMapping(hasHeaderRow: boolean): EmployeeImportMapping {
  return {
    version: 1,
    hasHeaderRow,
    fields: {},
  };
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export function ImportEmployees({
  savedMapping,
  orgGroups,
  onImportComplete,
  onMappingSaved,
}: Props) {
  const [groups, setGroups] = useState(orgGroups);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [response, setResponse] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<EmployeeImportMapping | null>(null);
  const [usingSaved, setUsingSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (selected: File) => {
    try {
      validateImportFile(selected);
    } catch (err) {
      toast({
        title: 'Error',
        description: errorMessage(err, 'Unsupported file'),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await apiClient.employeeImport.preview(selected);
      setFile(selected);
      setResponse(result);

      const initial =
        result.savedMapping ??
        ({
          ...emptyMapping(result.file.guessedHasHeaderRow),
          fields: result.autoDetected,
          sheetName: result.file.sheetName || undefined,
        } satisfies EmployeeImportMapping);

      setMapping(initial);
      setUsingSaved(!!result.savedMapping);
      // A saved mapping goes straight to the preview; without one there is
      // nothing to preview yet, so the mapping step comes first.
      setStep(result.savedMapping ? 'preview' : 'map');
    } catch (err) {
      logger.error({ err, fileName: selected.name }, 'Failed to read file');
      toast({
        title: 'Error',
        description: errorMessage(err, 'Could not read the file'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Re-resolve on the server whenever the mapping changes, so the preview the
  // user is verifying is produced by the same pipeline the import will run.
  // The mapping step keeps a small sample for responsiveness; the preview step
  // asks for every row so the whole file can be checked before importing.
  useEffect(() => {
    if (!file || !mapping) return;

    const wantsAllRows = step === 'preview';
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const result = await apiClient.employeeImport.preview(
          file,
          mapping,
          wantsAllRows,
        );
        if (!cancelled) {
          setResponse(result);
          setPreviewError(null);
        }
      } catch (err) {
        if (!cancelled) {
          logger.error({ err }, 'Failed to refresh import preview');
          // The rendered preview no longer reflects the mapping, so block the
          // import rather than let it run against stale numbers.
          setPreviewError(errorMessage(err, 'Could not refresh the preview'));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [file, mapping, step]);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setResponse(null);
    setMapping(null);
    setUsingSaved(false);
    setPreviewError(null);
  };

  const ignoreSavedMapping = () => {
    if (!response) return;
    setMapping({
      ...emptyMapping(response.file.guessedHasHeaderRow),
      fields: response.autoDetected,
      sheetName: response.file.sheetName || undefined,
    });
    setUsingSaved(false);
    setStep('map');
  };

  // Saving is always explicit: importing never writes the org's default
  // mapping, so a one-off or "ignore saved mapping" run cannot clobber it.
  const handleSaveMapping = async () => {
    if (!mapping) return;
    setIsSaving(true);
    try {
      const { mapping: saved } =
        await apiClient.employeeImport.saveMapping(mapping);
      toast({
        title: 'Import mapping saved',
        description: 'Future imports will use it automatically.',
      });
      onMappingSaved?.(saved);
    } catch (err) {
      toast({
        title: 'Error',
        description: errorMessage(err, 'Failed to save the mapping'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleImport = async () => {
    if (!file || !mapping) return;

    setIsImporting(true);
    try {
      const result = await apiClient.employeeImport.commit(file, mapping);

      const parts = [
        result.inserted > 0 && `${result.inserted} added`,
        result.updated > 0 && `${result.updated} updated`,
        result.skippedDuplicates > 0 &&
          `${result.skippedDuplicates} duplicate${result.skippedDuplicates > 1 ? 's' : ''} skipped`,
        result.errors.length > 0 && `${result.errors.length} failed`,
      ].filter(Boolean);

      const errorPreview = result.errors
        .slice(0, 3)
        .map((e) =>
          e.rowIndex >= 0 ? `Row ${e.rowIndex + 1}: ${e.reason}` : e.reason,
        )
        .join('\n');
      const moreErrors =
        result.errors.length > 3
          ? `\n…and ${result.errors.length - 3} more`
          : '';

      toast({
        title:
          result.errors.length > 0 && result.inserted + result.updated === 0
            ? 'Import failed'
            : 'Import complete',
        description: parts.length
          ? errorPreview
            ? `${parts.join(' · ')}\n${errorPreview}${moreErrors}`
            : parts.join(' · ')
          : 'No changes',
        variant: result.errors.length > 0 ? 'destructive' : 'default',
      });

      if (result.errors.length === 0) onImportComplete();
    } catch (err) {
      logger.error({ err }, 'Failed to import employees');
      toast({
        title: 'Error',
        description: errorMessage(err, 'Failed to import employees'),
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  if (step === 'upload') {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-12 transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped) handleFile(dropped);
        }}
      >
        <UploadIcon className="h-8 w-8 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium text-sm">
            {isLoading ? (
              'Reading file…'
            ) : (
              <>
                Drop a CSV or Excel file here, or{' '}
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  browse
                </button>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            .csv or .xlsx, up to {MAX_IMPORT_FILE_SIZE / 1024 / 1024} MB
          </p>
          {savedMapping && (
            <p className="mt-1 text-xs text-muted-foreground">
              Your saved column mapping will be applied automatically.
            </p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) handleFile(selected);
          }}
        />
      </div>
    );
  }

  if (!response || !mapping) return null;

  const unmappedValues: Partial<Record<ImportTargetField, string[]>> =
    response.preview?.unmappedValues ?? {};

  // min-w-0 all the way down: the dialog is a flex item, so without it every
  // ancestor grows to fit the widest child (overriding max-w-4xl) and the
  // preview table's horizontal scroll never engages.
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {usingSaved && step === 'preview' && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <p className="text-xs">Using your saved column mapping</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setStep('map')}
              >
                Edit mapping
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={ignoreSavedMapping}
              >
                Ignore saved mapping
              </Button>
            </div>
          </div>
        )}

        {step === 'map' && (
          <ColumnMappingStep
            columns={response.file.columns}
            mapping={mapping}
            onChange={setMapping}
            sourceValues={response.preview?.sourceValues ?? {}}
            unmappedValues={unmappedValues}
            orgGroups={groups}
            onGroupCreated={(group) =>
              setGroups((prev) =>
                prev.some((g) => g.id === group.id) ? prev : [...prev, group],
              )
            }
          />
        )}

        {response.preview && (
          <PreviewStep preview={response.preview} isLoading={isLoading} />
        )}
      </div>

      {previewError && (
        <p className="mt-3 text-xs text-destructive">
          {previewError} — change the mapping to retry.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={reset}>
          Back
        </Button>

        {step === 'map' ? (
          <>
            <Button
              variant="outline"
              onClick={handleSaveMapping}
              disabled={isSaving || isLoading}
            >
              {isSaving ? 'Saving…' : 'Save mapping'}
            </Button>
            <Button
              onClick={() => setStep('preview')}
              disabled={!response.preview}
            >
              Continue
            </Button>
          </>
        ) : (
          <Button
            onClick={handleImport}
            disabled={
              isImporting ||
              isLoading ||
              !!previewError ||
              !response.preview ||
              response.preview.valid === 0
            }
          >
            {isImporting
              ? 'Importing…'
              : `Import ${response.preview?.valid ?? 0} Employee${
                  response.preview?.valid === 1 ? '' : 's'
                }`}
          </Button>
        )}
      </div>
    </div>
  );
}
