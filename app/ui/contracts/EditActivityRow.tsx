'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow as InnerTableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ContractActivity as Activity } from '@/lib/v2';
import { FieldsEditedActivityData } from '@/constants/types';
import {
  useRevertContractField,
  useRevertProductField,
} from '@/hooks/api/useEditActions';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { JsonEditableTable } from '@/lib/v2/contracts/edit/field-registry';
import { useAbility } from '@/components/providers/AbilityProvider';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';

interface DeliveryMethod {
  id: number;
  name: string;
}

type FieldValueKey = `${string}:${number}:${string}`;

interface EditActivityRowProps {
  activity: Activity;
  contractId: number;
  formatLocalDateTime: (date: string) => string;
  getUserName: (activity: Activity) => string;
  currentFieldValues?: Record<FieldValueKey, string | number | null>;
  deliveryMethods?: DeliveryMethod[];
}

function ClampedText({
  text,
  isExpanded,
  onToggle,
}: {
  text: string | null;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [isClamped, setIsClamped] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (el && !isExpanded) {
      setIsClamped(el.scrollHeight > el.clientHeight);
    }
  }, [text, isExpanded]);

  return (
    <div>
      <span ref={textRef} className={isExpanded ? '' : 'line-clamp-[10]'}>
        {text || '(empty)'}
      </span>
      {(isClamped || isExpanded) && (
        <button
          className="mt-1 block text-xs text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

interface RevertTarget {
  table: string;
  recordId: number;
  fieldKey: string;
  fieldTitle: string;
  targetValue: string | number | null;
}

export default function EditActivityRow({
  activity,
  contractId,
  formatLocalDateTime,
  getUserName,
  currentFieldValues,
  deliveryMethods = [],
}: EditActivityRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [confirmRevert, setConfirmRevert] = useState<RevertTarget | null>(null);
  const router = useRouter();
  const ability = useAbility();
  const { toast } = useToast();
  const revertContractMutation = useRevertContractField(contractId);
  const revertProductMutation = useRevertProductField(contractId);

  const canRevert = ability.can('update', 'Contract');
  const data = activity.activity_data as FieldsEditedActivityData;
  const isPending =
    revertContractMutation.isPending || revertProductMutation.isPending;

  const resolveDisplayValue = (
    fieldKey: string,
    value: string | number | null,
  ): string | null => {
    if (value === null) return null;

    if (fieldKey === 'delivery_method_id' && typeof value === 'number') {
      const method = deliveryMethods.find((m) => m.id === value);
      return method?.name ?? `Unknown (ID: ${value})`;
    }

    return String(value);
  };

  const toggleFieldExpand = (fieldKey: string, column: 'old' | 'new') => {
    const key = `${fieldKey}-${column}`;
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isFieldExpanded = (fieldKey: string, column: 'old' | 'new') => {
    return expandedFields.has(`${fieldKey}-${column}`);
  };

  const handleRevert = async (target: RevertTarget) => {
    try {
      let result;
      if (target.table === 'contracts') {
        result = await revertContractMutation.mutateAsync({
          fieldKey: target.fieldKey,
          targetValue: target.targetValue as string | null,
        });
      } else {
        result = await revertProductMutation.mutateAsync({
          table: target.table as
            | 'vendor_products_details'
            | 'vendor_products_users'
            | 'vendor_products'
            | JsonEditableTable,
          recordId: target.recordId,
          fieldKey: target.fieldKey,
          targetValue: target.targetValue,
        });
      }

      if (result.success) {
        setConfirmRevert(null);
        router.refresh();
      } else {
        toast(
          generateToastError(
            result.error || 'Failed to revert field',
            'Revert failed',
          ),
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An unexpected error occurred';
      toast(generateToastError(message, 'Revert failed'));
    }
  };

  const isRevertDisabled = (field: {
    table: string;
    recordId: number;
    fieldKey: string;
    oldValue: string | number | null;
  }): boolean => {
    if (!currentFieldValues) return false;
    const key =
      `${field.table}:${field.recordId}:${field.fieldKey}` as FieldValueKey;
    return currentFieldValues[key] === field.oldValue;
  };

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-transparent"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <TableCell className="whitespace-nowrap py-1.5 font-label text-[0.8rem] text-muted-foreground">
          {formatLocalDateTime(activity.created_at)}
        </TableCell>
        <TableCell className="whitespace-nowrap py-1.5 font-label text-[0.85rem]">
          {getUserName(activity)}
        </TableCell>
        <TableCell className="py-1.5 font-label text-[0.85rem]">
          <span className="flex items-center gap-1">
            Made{' '}
            <strong>
              {data.changeCount} change{data.changeCount !== 1 ? 's' : ''}
            </strong>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        </TableCell>
        <TableCell className="py-1.5 text-right"></TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={4} className="bg-muted/30">
            <div>
              <Table className="ml-auto w-2/3">
                <TableHeader>
                  <InnerTableRow className="hover:bg-transparent">
                    <TableHead className="w-1/4">Field</TableHead>
                    <TableHead className="w-1/3">Original</TableHead>
                    <TableHead className="w-1/3">Edit</TableHead>
                    {canRevert && <TableHead className="w-[100px]"></TableHead>}
                  </InnerTableRow>
                </TableHeader>
                <TableBody>
                  {data.changedFields.map((field, index) => {
                    const disabled = isRevertDisabled(field);
                    const rowKey = `${field.table}-${field.recordId}-${field.fieldKey}-${index}`;
                    const metadata = field.metadata as
                      | { productName?: string; year?: number }
                      | undefined;

                    const displayOldValue = resolveDisplayValue(
                      field.fieldKey,
                      field.oldValue,
                    );
                    const displayNewValue = resolveDisplayValue(
                      field.fieldKey,
                      field.newValue,
                    );

                    return (
                      <InnerTableRow
                        key={rowKey}
                        className="hover:bg-transparent"
                      >
                        <TableCell className="font-medium align-top">
                          {field.fieldTitle}
                          {metadata?.productName && (
                            <div className="font-normal text-xs text-muted-foreground">
                              {metadata.productName}
                              {metadata.year && ` (Year ${metadata.year})`}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[300px] align-top text-muted-foreground">
                          <ClampedText
                            text={displayOldValue}
                            isExpanded={isFieldExpanded(field.fieldKey, 'old')}
                            onToggle={() =>
                              toggleFieldExpand(field.fieldKey, 'old')
                            }
                          />
                        </TableCell>
                        <TableCell className="max-w-[300px] align-top">
                          <ClampedText
                            text={displayNewValue}
                            isExpanded={isFieldExpanded(field.fieldKey, 'new')}
                            onToggle={() =>
                              toggleFieldExpand(field.fieldKey, 'new')
                            }
                          />
                        </TableCell>
                        {canRevert && (
                          <TableCell className="align-top">
                            {disabled ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>
                                      <Button
                                        variant="link"
                                        size="sm"
                                        disabled
                                        className="font-normal h-auto text-xs"
                                      >
                                        Revert
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Field already has this value
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <Button
                                variant="link"
                                size="sm"
                                className="font-normal h-auto text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmRevert({
                                    table: field.table,
                                    recordId: field.recordId,
                                    fieldKey: field.fieldKey,
                                    fieldTitle: field.fieldTitle,
                                    targetValue: field.oldValue,
                                  });
                                }}
                              >
                                Revert
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </InnerTableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}

      <AlertDialog
        open={!!confirmRevert}
        onOpenChange={() => setConfirmRevert(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert Field?</AlertDialogTitle>
            <AlertDialogDescription>
              This will revert <strong>{confirmRevert?.fieldTitle}</strong> to a
              previous value. This action will create a new entry in the audit
              log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={() => confirmRevert && handleRevert(confirmRevert)}
            >
              {isPending ? 'Reverting...' : 'Revert'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
