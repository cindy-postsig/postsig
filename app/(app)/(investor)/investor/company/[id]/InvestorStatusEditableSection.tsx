'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { useCanEditInvestor } from '@/hooks/useCanEditInvestor';
import {
  OverridableValue,
  RecomputedMarker,
} from '@/components/investor/OverrideBadge';
import {
  createOverride,
  createInvestorStatusRecords,
  type CreateOverrideInput,
  type CreateInvestorStatusRecordsInput,
} from '@/app/lib/actions/investor/overrides';
import type { Json } from '@/database.types';
import type { InvestorStatusOverrideContext } from '@/lib/v2/inv';

import { Section, BooleanDot } from './companyDetailsPrimitives';

interface InvestorStatusEditableSectionProps {
  context: InvestorStatusOverrideContext;
  /** Derived from board membership — read-only here. */
  hasBoardSeat: boolean;
  /** Whether any legal-terms data exists for this company. */
  hasInvestorData: boolean;
  /**
   * Whether `context` is the resolved server override context (true only in the
   * unfiltered 'all' view). When false the section is intentionally read-only
   * (round-filtered views don't wire overrides), so the edit control is hidden
   * rather than shown disabled.
   */
  statusResolved: boolean;
}

interface StatusDraft {
  isMajorInvestor: boolean;
  infoRightsForMajor: boolean;
  infoRightsForAll: boolean;
  proRataRightsMajor: boolean;
  proRataRightsAll: boolean;
}

/**
 * Information Rights is derived: granted to major investors (when we are a
 * major investor) or granted to all investors. Mirrors getInvInvestorStatus.
 */
function deriveInformationRights(d: StatusDraft): boolean {
  return (d.infoRightsForMajor && d.isMajorInvestor) || d.infoRightsForAll;
}

/**
 * Pro Rata Rights is derived: granted to major investors (when we are a major
 * investor) or granted to all investors. Mirrors getInvInvestorStatus.
 */
function deriveProRataRights(d: StatusDraft): boolean {
  return (d.proRataRightsMajor && d.isMajorInvestor) || d.proRataRightsAll;
}

/** Render a boolean override value the way the row shows it. */
const formatBool = (v: Json): string => (v ? 'Yes' : 'No');

function toDraft(context: InvestorStatusOverrideContext): StatusDraft {
  return {
    isMajorInvestor: context.values.isMajorInvestor,
    infoRightsForMajor: context.values.infoRightsForMajor,
    infoRightsForAll: context.values.infoRightsForAll,
    proRataRightsMajor: context.values.proRataRightsMajor,
    proRataRightsAll: context.values.proRataRightsAll,
  };
}

function ReadRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="font-sans-neue text-sm text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

export function InvestorStatusEditableSection({
  context,
  hasBoardSeat,
  hasInvestorData,
  statusResolved,
}: InvestorStatusEditableSectionProps) {
  const canEdit = useCanEditInvestor();
  const infoId = context.informationRightsId;
  const roundId = context.roundTermsId;
  const createTarget = context.createTarget;
  const canCreate = createTarget != null;
  const infoEditable = infoId != null || canCreate;
  const roundEditable = roundId != null || canCreate;
  const hasEditableTarget = infoEditable || roundEditable;
  // Show the edit control whenever the user is allowed to edit and the context
  // is resolved. When there is nothing to attach to (no existing row and no
  // financing round to create one against — droid forbids investor tokens from
  // creating rounds), the control is shown disabled with an explanatory tooltip
  // rather than hidden. In round-filtered views (unresolved) it stays hidden.
  const showEdit =
    canEdit && hasInvestorData && (hasEditableTarget || statusResolved);
  const editDisabled = !hasEditableTarget;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<StatusDraft>(() => toDraft(context));
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function openDialog() {
    setDraft(toDraft(context));
    setReason('');
    setOpen(true);
  }

  /** Build an override for one changed boolean flag, or null if unchanged. */
  function flagChange(
    entityType: 'inv_information_rights' | 'inv_round_terms',
    entityId: number | null,
    fieldKey:
      | 'is_major_investor'
      | 'info_rights_for_major'
      | 'info_rights_for_all'
      | 'pro_rata_rights_major'
      | 'pro_rata_rights_all',
    draftValue: boolean,
    currentValue: boolean,
  ): CreateOverrideInput | null {
    if (entityId == null || draftValue === currentValue) return null;
    return {
      entityType,
      entityId,
      fieldKey,
      originalValue: currentValue,
      overrideValue: draftValue,
      reason,
    };
  }

  function buildChanges(): CreateOverrideInput[] {
    const c = context.values;
    return [
      flagChange(
        'inv_information_rights',
        infoId,
        'is_major_investor',
        draft.isMajorInvestor,
        c.isMajorInvestor,
      ),
      flagChange(
        'inv_information_rights',
        infoId,
        'info_rights_for_major',
        draft.infoRightsForMajor,
        c.infoRightsForMajor,
      ),
      flagChange(
        'inv_information_rights',
        infoId,
        'info_rights_for_all',
        draft.infoRightsForAll,
        c.infoRightsForAll,
      ),
      flagChange(
        'inv_round_terms',
        roundId,
        'pro_rata_rights_major',
        draft.proRataRightsMajor,
        c.proRataRightsMajor,
      ),
      flagChange(
        'inv_round_terms',
        roundId,
        'pro_rata_rights_all',
        draft.proRataRightsAll,
        c.proRataRightsAll,
      ),
    ].filter((x): x is CreateOverrideInput => x != null);
  }

  /**
   * Build the create-on-edit payload for a company with no source rows yet.
   * Only includes a nested sub-record when its row is missing and the draft
   * turns on at least one of its flags. Returns null when there is nothing to
   * create (no create target, or the relevant rows already exist).
   */
  function buildCreate(): CreateInvestorStatusRecordsInput | null {
    if (createTarget == null) return null;

    const needInfo =
      infoId == null &&
      (draft.isMajorInvestor ||
        draft.infoRightsForMajor ||
        draft.infoRightsForAll);
    const needTerms =
      roundId == null && (draft.proRataRightsMajor || draft.proRataRightsAll);

    if (!needInfo && !needTerms) return null;

    return {
      companyId: createTarget.companyId,
      financingRoundId: createTarget.financingRoundId,
      effectiveDate: createTarget.effectiveDate,
      reason,
      ...(needInfo && {
        informationRights: {
          isMajorInvestor: draft.isMajorInvestor,
          infoRightsForMajor: draft.infoRightsForMajor,
          infoRightsForAll: draft.infoRightsForAll,
        },
      }),
      ...(needTerms && {
        terms: {
          proRataRightsMajor: draft.proRataRightsMajor,
          proRataRightsAll: draft.proRataRightsAll,
        },
      }),
    };
  }

  function handleSave() {
    const create = buildCreate();
    const changes = buildChanges();
    if (create == null && changes.length === 0) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      if (create != null) {
        const result = await createInvestorStatusRecords(create);
        if ('error' in result) {
          toast({
            title: 'Failed to save',
            description: result.error,
            variant: 'destructive',
          });
          return;
        }
      }
      for (const change of changes) {
        const result = await createOverride(change);
        if ('error' in result) {
          toast({
            title: 'Failed to save',
            description: result.error,
            variant: 'destructive',
          });
          return;
        }
      }
      toast({ title: 'Investor status updated' });
      setOpen(false);
      router.refresh();
    });
  }

  if (!hasInvestorData) {
    return (
      <Section title="Investor Status">
        <p className="text-sm text-muted-foreground">
          Investor status data not available.
        </p>
      </Section>
    );
  }

  const values = toDraft(context);
  const infoRightsValue = deriveInformationRights(values);
  const proRataValue = deriveProRataRights(values);
  const informationRightsOverridden =
    context.overridden.is_major_investor != null ||
    context.overridden.info_rights_for_major != null ||
    context.overridden.info_rights_for_all != null;
  const proRataOverridden =
    context.overridden.is_major_investor != null ||
    context.overridden.pro_rata_rights_major != null ||
    context.overridden.pro_rata_rights_all != null;

  return (
    <section className="space-y-5">
      <div className="group flex items-center gap-1.5">
        <h3 className="font-medium font-sans-neue text-base leading-none">
          Investor Status
        </h3>
        {showEdit && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={editDisabled ? undefined : openDialog}
                  aria-disabled={editDisabled}
                  aria-label="Edit investor status"
                  className={`text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 ${
                    editDisabled
                      ? 'cursor-not-allowed group-hover:opacity-60'
                      : 'hover:text-foreground'
                  }`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">
                  {editDisabled
                    ? 'This company has no financing round on record yet, so investor status can’t be edited. Editing becomes available once a financing round is added.'
                    : 'Investor status is derived from legal documents. Click to edit.'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <div className="divide-y divide-foreground/10">
        <ReadRow label="Major Investor">
          <OverridableValue
            meta={context.overridden.is_major_investor}
            label="Major Investor"
            align="end"
            formatValue={formatBool}
            onReverted={() => router.refresh()}
          >
            <BooleanDot value={values.isMajorInvestor} />
          </OverridableValue>
        </ReadRow>

        <ReadRow label="Information Rights">
          {informationRightsOverridden ? (
            <RecomputedMarker align="end">
              <BooleanDot value={infoRightsValue} />
            </RecomputedMarker>
          ) : (
            <BooleanDot value={infoRightsValue} />
          )}
        </ReadRow>

        <ReadRow label="Pro Rata Rights">
          {proRataOverridden ? (
            <RecomputedMarker align="end">
              <BooleanDot value={proRataValue} />
            </RecomputedMarker>
          ) : (
            <BooleanDot value={proRataValue} />
          )}
        </ReadRow>

        <ReadRow label="Board Seat">
          <BooleanDot value={hasBoardSeat} />
        </ReadRow>
      </div>

      <InvestorStatusEditDialog
        open={open}
        onOpenChange={setOpen}
        draft={draft}
        setDraft={setDraft}
        reason={reason}
        setReason={setReason}
        infoEditable={infoEditable}
        roundEditable={roundEditable}
        hasBoardSeat={hasBoardSeat}
        isPending={isPending}
        onSave={handleSave}
      />
    </section>
  );
}

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: StatusDraft;
  setDraft: React.Dispatch<React.SetStateAction<StatusDraft>>;
  reason: string;
  setReason: (v: string) => void;
  infoEditable: boolean;
  roundEditable: boolean;
  hasBoardSeat: boolean;
  isPending: boolean;
  onSave: () => void;
}

function InvestorStatusEditDialog({
  open,
  onOpenChange,
  draft,
  setDraft,
  reason,
  setReason,
  infoEditable,
  roundEditable,
  hasBoardSeat,
  isPending,
  onSave,
}: EditDialogProps) {
  const set = (patch: Partial<StatusDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-medium text-base">
            Edit Investor Status
          </DialogTitle>
          <DialogDescription className="text-sm">
            Update the underlying terms — derived statuses recompute
            automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Major Investor — single stored flag */}
          <ToggleRow
            label="Major Investor"
            checked={draft.isMajorInvestor}
            disabled={!infoEditable || isPending}
            disabledReason="No information-rights record to edit."
            onChange={(v) => set({ isMajorInvestor: v })}
          />

          {/* Information Rights — derived */}
          <DerivedStatus
            label="Information Rights"
            result={deriveInformationRights(draft)}
            disabled={!infoEditable}
            disabledReason="No information-rights record to edit."
          >
            <ToggleRow
              label="Granted to major investors"
              checked={draft.infoRightsForMajor}
              disabled={!infoEditable || isPending}
              onChange={(v) => set({ infoRightsForMajor: v })}
            />
            <ToggleRow
              label="Granted to all investors"
              checked={draft.infoRightsForAll}
              disabled={!infoEditable || isPending}
              onChange={(v) => set({ infoRightsForAll: v })}
            />
          </DerivedStatus>

          {/* Pro Rata Rights — derived */}
          <DerivedStatus
            label="Pro Rata Rights"
            result={deriveProRataRights(draft)}
            disabled={!roundEditable}
            disabledReason="No round-terms record to edit."
          >
            <ToggleRow
              label="Granted to major investors"
              checked={draft.proRataRightsMajor}
              disabled={!roundEditable || isPending}
              onChange={(v) => set({ proRataRightsMajor: v })}
            />
            <ToggleRow
              label="Granted to all investors"
              checked={draft.proRataRightsAll}
              disabled={!roundEditable || isPending}
              onChange={(v) => set({ proRataRightsAll: v })}
            />
          </DerivedStatus>

          {/* Board Seat — relational, read-only */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="font-medium text-sm">Board Seat</span>
              <span className="text-xs text-muted-foreground">
                Managed in the Board section.
              </span>
            </div>
            <BooleanDot value={hasBoardSeat} />
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">
              Justification (optional)
            </span>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Confirmed in side letter"
              maxLength={500}
              rows={2}
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A labelled switch row used for both direct and base-input flags. */
function ToggleRow({
  label,
  checked,
  disabled,
  disabledReason,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (value: boolean) => void;
}) {
  const row = (
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-label={label}
      />
    </label>
  );
  if (!disabled || !disabledReason) return row;
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{row}</TooltipTrigger>
        <TooltipContent side="top">{disabledReason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** A derived status: base-input toggles plus a highlighted result line. */
function DerivedStatus({
  label,
  result,
  disabled,
  disabledReason,
  children,
}: {
  label: string;
  result: boolean;
  disabled?: boolean;
  disabledReason?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {result ? 'Yes' : 'No'}
          </span>
          <BooleanDot value={result} />
        </div>
      </div>
      <div className="space-y-2 border-t border-foreground/10 pt-2">
        {disabled && disabledReason ? (
          <p className="text-xs text-muted-foreground">{disabledReason}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
