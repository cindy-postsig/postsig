'use client';

import { useState, useEffect, useContext } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEdit } from './EditContext';
import { SaveConfirmationDialog } from './SaveConfirmationDialog';
import { ReloadIcon, ResetIcon } from '@radix-ui/react-icons';
import { getFieldDefinition } from '@/app/ui/contracts/contractFieldConfigs';
import { getEditableField } from '@/lib/v2/contracts/edit/field-registry';
import type { UnifiedFieldChange } from '@/lib/v2/contracts/edit/types';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { UserContext } from '@/app/userProvider';
import {
  getUserPreference,
  setUserPreference,
} from '@/app/lib/actions/preferences';
import logger from '@/utils/pino';

function getFieldDisplayName(change: UnifiedFieldChange): string {
  if (change.table === 'contracts') {
    return (
      getFieldDefinition(change.field)?.title || change.field.replace(/_/g, ' ')
    );
  }
  const fieldDef = getEditableField(change.table, change.field);
  return fieldDef?.title || change.field.replace(/_/g, ' ');
}

export function EditToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const edit = useEdit();
  const userContext = useContext(UserContext);
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [skipConfirmation, setSkipConfirmation] = useState(false);

  const userId = userContext?.userMetadata?.userId;

  // Load user preference for skipping confirmation
  useEffect(() => {
    if (!userId) return;
    getUserPreference(userId, 'contracts.skip_edit_confirmation')
      .then((value) => {
        setSkipConfirmation(value);
      })
      .catch((error) => {
        logger.error(
          { userId, error },
          'Failed to load skip confirmation preference',
        );
      });
  }, [userId]);

  // Should never happen - EditToolbar is only rendered inside EditProvider
  if (!edit) return null;

  const {
    editedFieldCount,
    hasChanges,
    contractId,
    clearAllChanges,
    revertField,
    isFieldModified,
    saveAllChanges,
    isSaving,
    getAllChanges,
  } = edit;

  const modifiedFields = getAllChanges();

  const handleCancel = () => {
    clearAllChanges();
    const params = new URLSearchParams(searchParams.toString());
    params.delete('edit');
    const queryString = params.toString() ? `?${params.toString()}` : '';
    router.push(pathname + queryString);
  };

  const handleSaveClick = () => {
    if (skipConfirmation) {
      handleConfirmSave();
    } else {
      setIsDialogOpen(true);
    }
  };

  const handleSkipPreferenceChange = async (skip: boolean) => {
    if (!userId) return;
    setSkipConfirmation(skip);
    try {
      const success = await setUserPreference(
        userId,
        'contracts.skip_edit_confirmation',
        skip,
      );
      if (!success) {
        setSkipConfirmation(!skip);
      }
    } catch (error) {
      logger.error(
        { userId, error },
        'Failed to save skip confirmation preference',
      );
      setSkipConfirmation(!skip);
    }
  };

  const handleConfirmSave = async () => {
    const result = await saveAllChanges();
    if (result.success) {
      setIsDialogOpen(false);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('edit');
      const queryString = params.toString() ? `?${params.toString()}` : '';
      router.push(pathname + queryString);
      router.refresh();
    } else {
      logger.error(
        {
          contractId,
          error: result.error,
          fields: modifiedFields.map((f) => `${f.table}:${f.field}`),
        },
        'Failed to save contract edits',
      );
      toast(
        generateToastError(
          result.error || 'Failed to save changes',
          'Save failed',
        ),
      );
    }
  };

  return (
    <>
      <div className="z-20 border-t bg-background">
        <div className="flex h-16 w-full items-center justify-between bg-yellow/30 px-6">
          <div className="flex items-center gap-3">
            <div className="font-medium flex items-center gap-2 text-sm">
              Editing
            </div>
            {editedFieldCount > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="cursor-pointer">
                    <Badge
                      variant={'notice'}
                      className={`tabular-nums ${editedFieldCount > 0 ? 'bg-yellow text-foreground' : ''}`}
                    >
                      {editedFieldCount}
                    </Badge>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-64">
                  <DropdownMenuLabel>Version Control</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {modifiedFields.map((change) => (
                    <DropdownMenuItem
                      key={`${change.table}:${change.recordId}:${change.field}`}
                      className="flex items-center justify-between"
                      onSelect={(e) => {
                        e.preventDefault();
                        revertField(
                          change.table,
                          change.recordId,
                          change.field,
                        );
                      }}
                    >
                      <span>{getFieldDisplayName(change)}</span>
                      <ResetIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveClick}
              disabled={!hasChanges || isSaving}
            >
              {isSaving && <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      </div>

      <SaveConfirmationDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onConfirm={handleConfirmSave}
        onSkipPreferenceChange={handleSkipPreferenceChange}
        isSaving={isSaving}
      />
    </>
  );
}
