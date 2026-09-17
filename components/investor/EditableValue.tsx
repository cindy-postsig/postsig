'use client';

import { useState, useTransition } from 'react';
import { useForm, type Resolver, type UseFormReturn } from 'react-hook-form';
import { Pencil } from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  findFieldOption,
  transactionAmountSign,
  type EditableFieldDef,
} from '@/lib/v2/inv/overrides/registry';
import {
  createOverride,
  type CreateOverrideInput,
} from '@/app/lib/actions/investor/overrides';
import { useReportEditing } from '@/components/investor/OverrideBadge';
import { useCanEditInvestor } from '@/hooks/useCanEditInvestor';

interface EditableValueProps {
  children: React.ReactNode;
  fieldDef: EditableFieldDef;
  entityId: number;
  /**
   * The field's current STORED value — not its formatted display value. Null
   * when the column is empty, which is the common case for the Legal Terms
   * fields: filling one in is the main reason to edit it.
   */
  currentRawValue: number | string | boolean | null;
  /**
   * Raw inv_transaction.transaction_type for amount edits. The amount cell shows
   * a magnitude (Entry Cost); the stored value is signed per the type's
   * ingestion convention (cost types negative, proceeds positive). When set, the
   * user types a magnitude and we apply the type's sign before writing.
   */
  rawTransactionType?: string;
  /**
   * Signed source value used when re-applying a sign — the row's true signed
   * inv_transaction.amount. Recorded as the override's original_value, and used
   * as the sign fallback when `rawTransactionType` is unknown.
   */
  signSource?: number;
  onSaved?: () => void;
  /**
   * Portal container for the edit popover. Pass the enclosing DialogContent
   * node when rendered inside a modal Dialog (e.g. ComputedMetricPanel) so the
   * popover counts as inside the dialog and clicking it doesn't dismiss it.
   */
  container?: HTMLElement | null;
  /**
   * Keep the edit pencil always visible instead of fading it in on hover. Used
   * where the value sits in a dedicated edit surface (e.g. the computed-metric
   * inputs panel) so its editability is obvious without hovering each row.
   */
  persistentPencil?: boolean;
  /**
   * Use a standalone icon trigger instead of making the value itself the edit
   * trigger. Useful when `children` contains its own interactive element.
   */
  triggerMode?: 'value' | 'icon';
}

// Justification is optional — empty is allowed; we only cap its length.
const justificationSchema = z.string().trim().max(500);

// Boolean fields ride through the string-typed form as these two literals.
const BOOLEAN_TRUE = 'true';
const BOOLEAN_FALSE = 'false';

/**
 * Validate-only edit-form schema for one field. The `value` input stays a string
 * (so RHF's input and output types match); we coerce + check it against the
 * field's registry rule via superRefine, mirroring the storage transform without
 * applying it here:
 *  - empty/whitespace is rejected (never silently persist Number('') === 0);
 *  - percent-displayed fields are converted to their stored fraction BEFORE the
 *    rule runs, so a rule like 0–1 sees what we actually store;
 *  - date fields are checked against the rule as-is.
 * Coercion + sign for storage happen in onSubmit, where the runtime props live.
 */
function addIssue(ctx: z.RefinementCtx, message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, message });
}

/**
 * Validate one typed value against its field. Friendly messages for the common
 * mistakes (empty, non-numeric) are produced here so the user never sees zod's
 * raw "expected number, received NaN"; range/domain failures fall through to the
 * registry rule's own message (e.g. "must be non-negative").
 */
function validateEditValue(
  fieldDef: EditableFieldDef,
  raw: string,
  ctx: z.RefinementCtx,
): void {
  const trimmed = raw.trim();
  if (trimmed === '') {
    addIssue(
      ctx,
      fieldDef.dataType === 'boolean'
        ? 'Select Yes or No'
        : fieldDef.options
          ? 'Select a value'
          : `Enter a ${fieldDef.label.toLowerCase()}`,
    );
    return;
  }
  // Booleans reach the form as the strings the select emits; anything else is
  // a corrupt value that must not silently coerce to false.
  if (fieldDef.dataType === 'boolean') {
    if (trimmed !== BOOLEAN_TRUE && trimmed !== BOOLEAN_FALSE) {
      addIssue(ctx, 'Select Yes or No');
      return;
    }
    const parsed = fieldDef.rule.safeParse(trimmed === BOOLEAN_TRUE);
    if (!parsed.success) {
      addIssue(ctx, parsed.error.issues[0]?.message ?? 'Invalid value');
    }
    return;
  }
  // Options fields ride through the form as String(option.value); resolve back to
  // the typed value so a numeric rank is checked as a number, not as "2".
  if (fieldDef.options) {
    const match = findFieldOption(fieldDef, trimmed);
    if (!match) {
      addIssue(ctx, 'Select a value');
      return;
    }
    const parsed = fieldDef.rule.safeParse(match.value);
    if (!parsed.success) {
      addIssue(ctx, parsed.error.issues[0]?.message ?? 'Invalid value');
    }
    return;
  }
  if (fieldDef.dataType === 'number') {
    const num = Number(trimmed);
    if (Number.isNaN(num)) {
      addIssue(
        ctx,
        fieldDef.displayAsPercent
          ? 'Enter a number (e.g. 10 for 10%)'
          : 'Enter a valid number',
      );
      return;
    }
  }
  const candidate = isDomainField(fieldDef)
    ? normalizeDomainInput(trimmed)
    : fieldDef.dataType !== 'number'
      ? trimmed
      : fieldDef.displayAsPercent
        ? percentToFraction(Number(trimmed))
        : Number(trimmed);
  const parsed = fieldDef.rule.safeParse(candidate);
  if (!parsed.success) {
    addIssue(ctx, parsed.error.issues[0]?.message ?? 'Invalid value');
  }
}

/**
 * Validate-only edit-form schema for one field. The `value` input stays a string
 * (so RHF's input and output types match); we coerce + check it against the
 * field's registry rule, mirroring the storage transform without applying it
 * here:
 *  - empty/whitespace is rejected (never silently persist Number('') === 0);
 *  - percent-displayed fields are converted to their stored fraction BEFORE the
 *    rule runs, so a rule like 0–1 sees what we actually store;
 *  - date fields are checked against the rule as-is.
 * Coercion + sign for storage happen in onSubmit, where the runtime props live.
 */
export function buildEditValueSchema(fieldDef: EditableFieldDef) {
  return z.object({
    value: z
      .string()
      .superRefine((raw, ctx) => validateEditValue(fieldDef, raw, ctx)),
    justification: justificationSchema,
  });
}

// The schema only validates (no transform), so input === output: both fields
// stay strings.
type EditFormValues = z.infer<ReturnType<typeof buildEditValueSchema>>;

/**
 * RHF resolver for one field's edit form. A hand-written resolver (rather than
 * @hookform/resolvers' zodResolver) sidesteps a zod-4 ↔ resolvers-5 generic
 * incompatibility while staying fully typed and zod-driven.
 */
function buildEditResolver(
  fieldDef: EditableFieldDef,
): Resolver<EditFormValues> {
  const schema = buildEditValueSchema(fieldDef);
  return (values) => {
    const parsed = schema.safeParse(values);
    if (parsed.success) return { values: parsed.data, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !errors[key]) {
        errors[key] = { type: 'validation', message: issue.message };
      }
    }
    return { values: {}, errors };
  };
}

/**
 * Sign a user-typed amount magnitude for storage. The amount cell shows a
 * magnitude (Entry Cost) but inv_transaction.amount is stored signed: cost
 * types negative, proceeds positive. The sign comes from the transaction's
 * raw type (the ingestion convention); for an unrecognised type we fall back
 * to the existing stored value's sign so an unknown type never force-flips.
 * With neither signal available the magnitude is left positive.
 */
export function applyTransactionAmountSign(
  magnitude: number,
  rawTransactionType: string | undefined,
  signSource: number | undefined,
): number {
  const typeSign =
    rawTransactionType !== undefined
      ? transactionAmountSign(rawTransactionType)
      : null;
  const sign =
    typeSign ?? (signSource !== undefined && signSource < 0 ? -1 : 1);
  return Math.abs(magnitude) * sign;
}

/**
 * A stored fraction (0–1) shown to the user as a percent. The user types a
 * percent; we store the fraction. Display rounds to avoid float artefacts
 * (0.07 → "7", not "7.000000000000001"); storage keeps full precision.
 */
export function fractionToPercentDisplay(fraction: number): string {
  return String(Number((fraction * 100).toFixed(4)));
}

/** Convert a user-typed percent to the stored fraction (10 → 0.1). */
export function percentToFraction(percent: number): number {
  return percent / 100;
}

/**
 * The form value representing a field's current stored value. Selects (boolean
 * and options) are seeded with it so the popover opens showing the current
 * state, and so the `unchanged` guard below can spot a no-op re-selection; the
 * text-input types keep an empty field and show the current value as a
 * placeholder instead.
 */
export function toFormValue(
  fieldDef: EditableFieldDef,
  currentRawValue: number | string | boolean | null,
): string {
  // A null boolean is "not recorded", not false. Seeding it as 'false' would both
  // misreport it as a No and make the `unchanged` guard treat picking No as a
  // no-op — leaving the user unable to set the flag to false at all.
  if (fieldDef.dataType === 'boolean') {
    return currentRawValue == null ? '' : String(currentRawValue === true);
  }
  if (fieldDef.options) {
    return currentRawValue == null ? '' : String(currentRawValue);
  }
  return '';
}

interface EditFormProps {
  form: UseFormReturn<EditFormValues>;
  fieldDef: EditableFieldDef;
  currentRawValue: number | string | boolean | null;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

function EditForm({
  form,
  fieldDef,
  currentRawValue,
  isPending,
  onSubmit,
  onCancel,
}: EditFormProps) {
  // A seeded select is valid from the outset, so validity alone would leave
  // Save enabled on an unchanged value and write a no-op override.
  const unchanged =
    form.watch('value') === toFormValue(fieldDef, currentRawValue);
  const valuePlaceholder =
    currentRawValue == null
      ? '—'
      : fieldDef.displayAsPercent && typeof currentRawValue === 'number'
        ? fractionToPercentDisplay(currentRawValue)
        : String(currentRawValue);

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <p className="font-medium text-sm">Edit {fieldDef.label}</p>

        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-1 space-y-0">
              <FormLabel className="text-xs">New value</FormLabel>
              {fieldDef.dataType === 'boolean' ? (
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select Yes or No" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={BOOLEAN_TRUE}>Yes</SelectItem>
                    <SelectItem value={BOOLEAN_FALSE}>No</SelectItem>
                  </SelectContent>
                </Select>
              ) : fieldDef.options ? (
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select a value" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {fieldDef.options.map((option) => (
                      <SelectItem
                        key={String(option.value)}
                        value={String(option.value)}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : fieldDef.multiline ? (
                <FormControl>
                  <Textarea
                    className="min-h-28 resize-y"
                    placeholder={valuePlaceholder}
                    autoFocus
                    {...field}
                  />
                </FormControl>
              ) : (
                <FormControl>
                  <Input
                    className="h-9"
                    placeholder={valuePlaceholder}
                    autoFocus
                    {...field}
                  />
                </FormControl>
              )}
              {fieldDef.hint && (
                <FormDescription className="text-xs">
                  {fieldDef.hint}
                </FormDescription>
              )}
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="justification"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-1 space-y-0">
              <FormLabel className="text-xs">Justification</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. Confirmed via wire receipt"
                  className="h-9"
                  {...field}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isPending || !form.formState.isValid || unchanged}
          >
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function EditableValue(props: EditableValueProps) {
  const canEdit = useCanEditInvestor();
  // Non-admin users render read-only. The matching server-side auth gate lives
  // in overrides.ts.
  if (!canEdit) return <>{props.children}</>;
  return <EditableValueEditor {...props} />;
}

/**
 * Convert a validated typed value into the value to store: booleans parse back
 * from the select's string literal, numeric fields coerce (percent → fraction)
 * and then amount fields re-apply the transaction's sign; date/string fields
 * pass through. Runs only after the schema accepted the input.
 */
export function toStoredValue(
  raw: string,
  fieldDef: EditableFieldDef,
  rawTransactionType: string | undefined,
  signSource: number | undefined,
): number | string | boolean {
  if (fieldDef.dataType === 'boolean') return raw.trim() === BOOLEAN_TRUE;
  // Store the option's typed value, never the label or the form's string form —
  // applyOverrides re-validates every override against the registry rule on
  // read, so a numeric rank stored as "2" would be silently dropped.
  if (fieldDef.options) {
    const match = findFieldOption(fieldDef, raw.trim());
    if (match) return match.value;
  }
  if (isDomainField(fieldDef)) return normalizeDomainInput(raw);
  if (fieldDef.dataType !== 'number') return raw.trim();
  const numeric = fieldDef.displayAsPercent
    ? percentToFraction(Number(raw.trim()))
    : Number(raw.trim());
  const isSignedAmount =
    rawTransactionType !== undefined || signSource !== undefined;
  return isSignedAmount
    ? applyTransactionAmountSign(numeric, rawTransactionType, signSource)
    : numeric;
}

function isDomainField(fieldDef: EditableFieldDef): boolean {
  return (
    fieldDef.entityType === 'inv_company' && fieldDef.fieldKey === 'domain'
  );
}

function normalizeDomainInput(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(withProtocol).hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^https?:\/\//, '').split('/')[0] ?? trimmed;
  }
}

function EditableValueEditor({
  children,
  fieldDef,
  entityId,
  currentRawValue,
  rawTransactionType,
  signSource,
  onSaved,
  container,
  persistentPencil,
  triggerMode = 'value',
}: EditableValueProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const reportEditing = useReportEditing();

  const form = useForm<EditFormValues>({
    resolver: buildEditResolver(fieldDef),
    // Validate on every change so errors surface as the user types, and clear
    // as soon as the input becomes valid.
    mode: 'onChange',
    defaultValues: {
      value: toFormValue(fieldDef, currentRawValue),
      justification: '',
    },
  });

  function close() {
    setOpen(false);
    reportEditing(false);
    form.reset();
  }

  const handleSubmit = form.handleSubmit((values) => {
    const input: CreateOverrideInput = {
      entityType: fieldDef.entityType,
      entityId,
      fieldKey: fieldDef.fieldKey,
      // original_value is the row's true signed amount when available.
      originalValue: signSource !== undefined ? signSource : currentRawValue,
      overrideValue: toStoredValue(
        values.value,
        fieldDef,
        rawTransactionType,
        signSource,
      ),
      reason: values.justification.trim(),
    };
    startTransition(async () => {
      const result = await createOverride(input);
      if ('error' in result) {
        toast({
          title: 'Failed to save',
          description: result.error,
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Value updated', description: fieldDef.label });
      close();
      onSaved?.();
    });
  });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Tell an enclosing OverrideBadge to suppress its hover tooltip while
        // this edit popover is open (no-op when rendered outside one).
        if (next) {
          setOpen(true);
          reportEditing(true);
        } else if (!isPending) {
          // Ignore dismissal (outside click / Esc) mid-save so the form isn't
          // torn down before createOverride resolves; it closes on success.
          close();
        }
      }}
    >
      {triggerMode === 'icon' ? (
        <span className="group inline-flex items-center">
          {children}
          <span className="relative w-0">
            <PopoverTrigger asChild>
              <button
                type="button"
                className="absolute left-0 top-1/2 ml-1 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-colors transition-opacity group-hover:opacity-60 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Edit ${fieldDef.label}`}
                title={`Edit ${fieldDef.label}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
          </span>
        </span>
      ) : (
        <PopoverTrigger asChild>
          <button
            type="button"
            className="group inline-flex cursor-pointer items-center text-left"
          >
            {children}
            {persistentPencil ? (
              <Pencil className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              // Zero-width slot so the hover pencil sits just past the value's
              // trailing edge without reserving layout width (which would widen
              // the override underline that wraps this trigger).
              <span className="relative w-0" aria-hidden>
                <Pencil className="absolute left-0 top-1/2 ml-1 h-4 w-4 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-60" />
              </span>
            )}
          </button>
        </PopoverTrigger>
      )}

      <PopoverContent className="w-96" align="start" container={container}>
        <EditForm
          form={form}
          fieldDef={fieldDef}
          currentRawValue={currentRawValue}
          isPending={isPending}
          onSubmit={handleSubmit}
          onCancel={close}
        />
      </PopoverContent>
    </Popover>
  );
}
