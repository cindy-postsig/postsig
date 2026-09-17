'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Plus, Trash2, Undo2, X } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { useCanEditInvestor } from '@/hooks/useCanEditInvestor';
import {
  updateBoardSeats,
  addBoardSeat,
  removeBoardSeat,
  type BoardSeatChange,
} from '@/app/lib/actions/investor/board-seats';
import { OverridableValue } from '@/components/investor/OverrideBadge';
import type { AppliedOverrideMeta } from '@/lib/v2/inv/overrides/applyOverrides';
import { Section } from './companyDetailsPrimitives';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BoardEntry {
  id?: number;
  name: string;
  title: string | null;
  kind: 'director' | 'observer';
  fund?: string;
  designatingFundId?: number | null;
  isLead?: boolean;
  seatType?: string;
  overridden?: Record<string, AppliedOverrideMeta>;
}

interface FundOption {
  id: number;
  name: string;
  shortName: string;
}

interface BoardEditableSectionProps {
  companyId: number;
  entries: BoardEntry[];
  funds: FundOption[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBoardInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

/** Fallback label for a seat with no explicit title, based on its kind. */
function kindLabel(kind: 'director' | 'observer'): string {
  return kind === 'observer' ? 'Observer' : 'Director';
}

/** Display label: the explicit title if present, else the seat-kind fallback. */
function seatLabel(entry: BoardEntry): string {
  return entry.title?.trim() || kindLabel(entry.kind);
}

/**
 * Map the UI's Director/Observer choice to a `seat_type` value, mirroring the
 * Add path: observers -> 'observer'; directors -> 'investor_designated' when a
 * designating fund is set, otherwise 'independent'.
 */
function kindToSeatType(
  kind: 'director' | 'observer',
  fundId: number | null,
): string {
  if (kind === 'observer') return 'observer';
  return fundId != null ? 'investor_designated' : 'independent';
}

/**
 * Human-readable label for a raw `seat_type` value (override tooltip). Collapses
 * the many raw seat types to the Director/Observer kind shown in the cell —
 * observer variants map to "Observer", everything else to "Director" — matching
 * how `kind` is derived in the board transforms.
 */
function humanSeatType(seatType: string): string {
  return seatType === 'observer' || seatType === 'board_observer'
    ? 'Observer'
    : 'Director';
}

/**
 * A board `seat_type` override is always a Director<->Observer toggle, so when
 * the stored original value is missing (older overrides, or seats that had no
 * raw seat_type) we recover it as the opposite of the override value. This lets
 * the tooltip show a default Director/Observer instead of a blank.
 */
function oppositeSeatType(overrideValue: unknown): string {
  const overrideIsObserver =
    overrideValue === 'observer' || overrideValue === 'board_observer';
  return overrideIsObserver ? 'director' : 'observer';
}

// ---------------------------------------------------------------------------
// Edit state per row
// ---------------------------------------------------------------------------

interface RowEditState {
  key: string;
  entry: BoardEntry | null;
  name: string;
  title: string;
  fundId: number | null;
  kind: 'director' | 'observer';
  removed: boolean;
}

let rowKeySeq = 0;
function nextRowKey(): string {
  rowKeySeq += 1;
  return `new-${rowKeySeq}`;
}

function initEditState(entries: BoardEntry[]): RowEditState[] {
  return entries.map((e) => ({
    key: e.id != null ? `seat-${e.id}` : nextRowKey(),
    entry: e,
    name: e.name,
    title: e.title ?? '',
    fundId: e.designatingFundId ?? null,
    kind: e.kind,
    removed: false,
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BoardEditableSection({
  companyId,
  entries,
  funds,
}: BoardEditableSectionProps) {
  const canEdit = useCanEditInvestor();
  const showEdit = canEdit;

  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<RowEditState[]>(() =>
    initEditState(entries),
  );
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function startEditing() {
    setRows(initEditState(entries));
    setSaveAttempted(false);
    setReason('');
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setRows(initEditState(entries));
    setSaveAttempted(false);
    setReason('');
  }

  function updateRow(key: string, patch: Partial<RowEditState>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        key: nextRowKey(),
        entry: null,
        name: '',
        title: '',
        fundId: null,
        kind: 'director',
        removed: false,
      },
    ]);
  }

  function toggleRemove(key: string) {
    setRows((prev) =>
      prev.flatMap((r) => {
        if (r.key !== key) return [r];
        // New (unsaved) rows are simply dropped; existing rows toggle removed.
        if (r.entry == null) return [];
        return [{ ...r, removed: !r.removed }];
      }),
    );
  }

  // Compute validation errors (skip removed rows)
  function getErrors(): Map<string, string> {
    const errors = new Map<string, string>();
    rows.forEach((row) => {
      if (row.removed) return;
      if (!row.name.trim()) {
        errors.set(row.key, 'Name is required');
      } else if (row.name.trim().length > 200) {
        errors.set(row.key, 'Name must be 200 characters or less');
      }
    });
    return errors;
  }

  function handleSave() {
    setSaveAttempted(true);
    const errors = getErrors();
    if (errors.size > 0) return;

    const trimmedReason = reason.trim();

    // Existing rows flagged for removal.
    const removals = rows.filter((r) => r.entry?.id != null && r.removed);

    // New rows to insert.
    const additions = rows.filter((r) => r.entry == null && !r.removed);

    // Field-level edits on existing, kept rows -> value overrides.
    const changes: BoardSeatChange[] = [];
    rows.forEach((row) => {
      const entry = row.entry;
      if (!entry?.id || row.removed) return;

      if (row.name.trim() !== entry.name) {
        changes.push({
          seatId: entry.id,
          fieldKey: 'holder_name',
          originalValue: entry.name,
          overrideValue: row.name.trim(),
        });
      }

      const originalTitle = entry.title?.trim() ? entry.title.trim() : null;
      const newTitle = row.title.trim() || null;
      if (newTitle !== originalTitle) {
        changes.push({
          seatId: entry.id,
          fieldKey: 'holder_title',
          originalValue: originalTitle ?? '',
          overrideValue: newTitle ?? '',
        });
      }

      const originalFundId = entry.designatingFundId ?? null;
      if (row.fundId !== originalFundId) {
        changes.push({
          seatId: entry.id,
          fieldKey: 'designating_fund_id',
          originalValue: originalFundId ?? '',
          overrideValue: row.fundId ?? '',
        });
      }

      // Type change: only when the user actually switched Director/Observer,
      // so we don't clobber a granular seat_type (e.g. executive) on an
      // unrelated edit. Mirrors the Add path's kind -> seat_type mapping.
      if (row.kind !== entry.kind) {
        changes.push({
          seatId: entry.id,
          fieldKey: 'seat_type',
          // Existing seats often have no raw `seat_type`; fall back to the
          // default derived from the original kind/fund so the tooltip shows a
          // real value ("Independent Director", "Observer") instead of a blank.
          originalValue:
            entry.seatType ||
            kindToSeatType(entry.kind, entry.designatingFundId ?? null),
          overrideValue: kindToSeatType(row.kind, row.fundId),
        });
      }
    });

    if (
      removals.length === 0 &&
      additions.length === 0 &&
      changes.length === 0
    ) {
      setSaveAttempted(false);
      setEditing(false);
      return;
    }

    startTransition(async () => {
      const errorMessages: string[] = [];
      let applied = 0;

      for (const row of removals) {
        const result = await removeBoardSeat({
          seatId: row.entry!.id!,
          reason: trimmedReason,
        });
        if ('error' in result) errorMessages.push(result.error);
        else applied += 1;
      }

      for (const row of additions) {
        const title = row.title.trim();
        const result = await addBoardSeat({
          companyId,
          name: row.name.trim(),
          title: title || null,
          designatingFundId: row.fundId,
          kind: row.kind,
          reason: trimmedReason,
        });
        if ('error' in result) errorMessages.push(result.error);
        else applied += 1;
      }

      if (changes.length > 0) {
        const result = await updateBoardSeats({
          changes,
          reason: trimmedReason,
        });
        if ('error' in result) errorMessages.push(result.error);
        else applied += result.count;
      }

      if (errorMessages.length > 0 && applied === 0) {
        toast({
          variant: 'destructive',
          title: 'Failed to save',
          description: errorMessages[0],
        });
        return;
      }

      if (errorMessages.length > 0) {
        toast({
          variant: 'destructive',
          title: 'Some changes failed',
          description: errorMessages[0],
        });
      } else {
        toast({
          title: 'Board updated',
          description: `${applied} change(s) saved.`,
        });
      }
      setSaveAttempted(false);
      setEditing(false);
      router.refresh();
    });
  }

  const validationErrors =
    editing && saveAttempted ? getErrors() : new Map<string, string>();
  const hasErrors = validationErrors.size > 0;

  // Read-only view
  if (!editing) {
    const boardPerColumn = Math.ceil(entries.length / 3);
    const boardColumns = [
      entries.slice(0, boardPerColumn),
      entries.slice(boardPerColumn, boardPerColumn * 2),
      entries.slice(boardPerColumn * 2),
    ];

    const fundNameById = new Map(
      funds.map((f) => [f.id, f.shortName || f.name]),
    );
    const formatFund = (v: unknown): string =>
      fundNameById.get(Number(v)) ?? String(v ?? '—');
    const formatSeatType = (v: unknown): string =>
      humanSeatType(String(v ?? ''));

    return (
      <section className="space-y-5">
        <div className="group flex items-center gap-1.5">
          <h3 className="font-medium font-sans-neue text-base leading-none">
            Board
          </h3>
          {showEdit && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={startEditing}
                    className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">
                    Board data is extracted from legal documents. Click to edit.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {entries.length > 0 ? (
          <div className="grid grid-cols-3 gap-x-12">
            {boardColumns.map((column, colIdx) => (
              <div key={colIdx} className="divide-y divide-foreground/10">
                {column.map((entry, idx) => {
                  const titleMeta = entry.overridden?.holder_title;
                  const rawTypeMeta = entry.overridden?.seat_type;
                  // Backfill a missing original so the tooltip shows a default
                  // Director/Observer rather than a blank.
                  const typeMeta =
                    rawTypeMeta &&
                    (rawTypeMeta.originalValue == null ||
                      rawTypeMeta.originalValue === '')
                      ? {
                          ...rawTypeMeta,
                          originalValue: oppositeSeatType(
                            rawTypeMeta.overrideValue,
                          ),
                        }
                      : rawTypeMeta;
                  const labelMeta = titleMeta ?? typeMeta;
                  return (
                    <div
                      key={`${colIdx}-${idx}`}
                      className="flex items-center gap-2.5 py-2 font-sans-neue text-sm leading-tight"
                    >
                      <Avatar className="h-8 w-8 shrink-0 rounded-md">
                        <AvatarFallback className="font-medium rounded-md bg-muted text-[0.7rem] text-foreground">
                          {getBoardInitials(entry.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium truncate text-foreground">
                        <OverridableValue
                          meta={entry.overridden?.holder_name}
                          label="Name"
                        >
                          {entry.name}
                        </OverridableValue>
                      </span>
                      <span className="text-muted-foreground">
                        <OverridableValue
                          meta={labelMeta}
                          label={titleMeta ? 'Title' : 'Type'}
                          formatValue={titleMeta ? undefined : formatSeatType}
                        >
                          {seatLabel(entry)}
                        </OverridableValue>
                        {entry.fund ? (
                          <>
                            {' · '}
                            <OverridableValue
                              meta={entry.overridden?.designating_fund_id}
                              label="Fund"
                              formatValue={formatFund}
                            >
                              {entry.fund}
                            </OverridableValue>
                          </>
                        ) : null}
                      </span>
                      {entry.isLead && (
                        <Badge
                          size="xs"
                          className="bg-foreground text-background"
                        >
                          LEAD
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No board members listed.
          </p>
        )}
      </section>
    );
  }

  // Edit mode
  return (
    <Section title="Board">
      <div className="space-y-3">
        <div className="font-medium grid grid-cols-[1.2fr_1fr_1fr_0.9fr_auto] gap-3 text-xs text-muted-foreground">
          <span>Name *</span>
          <span>Title</span>
          <span>Fund</span>
          <span>Type</span>
          <span className="sr-only">Actions</span>
        </div>

        {rows.map((row) => {
          const error = validationErrors.get(row.key);
          return (
            <div
              key={row.key}
              className={`grid grid-cols-[1.2fr_1fr_1fr_0.9fr_auto] items-start gap-3 ${
                row.removed ? 'opacity-50' : ''
              }`}
            >
              <div>
                <Input
                  value={row.name}
                  onChange={(e) => updateRow(row.key, { name: e.target.value })}
                  placeholder="Name"
                  disabled={row.removed}
                  className={error ? 'border-destructive' : ''}
                />
                {error && (
                  <p className="mt-1 text-xs text-destructive">{error}</p>
                )}
              </div>
              <Input
                value={row.title}
                onChange={(e) => updateRow(row.key, { title: e.target.value })}
                placeholder={kindLabel(row.kind)}
                disabled={row.removed}
              />
              <Select
                value={row.fundId != null ? String(row.fundId) : 'none'}
                disabled={row.removed}
                onValueChange={(val) =>
                  updateRow(row.key, {
                    fundId: val === 'none' ? null : Number(val),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select fund" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {funds.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.shortName || f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={row.kind}
                disabled={row.removed}
                onValueChange={(val) =>
                  updateRow(row.key, {
                    kind: val as 'director' | 'observer',
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="director">Director</SelectItem>
                  <SelectItem value="observer">Observer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => toggleRemove(row.key)}
                aria-label={row.removed ? 'Undo remove' : 'Remove board member'}
              >
                {row.removed ? (
                  <Undo2 className="h-4 w-4" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          className="w-full border-dashed"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add board member
        </Button>

        <div className="space-y-2 pt-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Justification for changes (optional)"
            rows={2}
            className="resize-none text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={cancelEditing}
              disabled={isPending}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              <Check className="mr-1 h-3.5 w-3.5" />
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
