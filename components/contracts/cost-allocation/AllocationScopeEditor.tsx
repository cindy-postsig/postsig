'use client';

import { useEffect, useState } from 'react';
import { Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import {
  ACTIVE_USERS_MODE_LABEL,
  activeUsersPreview,
  amountToPercent,
  applyEqualSplit,
  clampPercent,
  displayAmounts,
  scopeTotals,
  seatHolderTargets,
  unlinkedSeatsNote,
  type EditorLine,
  type EditorScope,
  type ScopeSeat,
  type SplitMethod,
} from '@/lib/v2/cost-allocation/editor';
import {
  targetKey,
  targetTypeLabel,
  type PickerCategory,
} from '@/lib/v2/cost-allocation/picker';
import type { OrgUnitLevel } from '@/lib/v2/org-units/levels';
import type { AllocationTargetRef } from '@/lib/v2/cost-allocation/types';
import { formatPercent } from '@/lib/v2/cost-allocation/activity-labels';
import { TargetPicker } from './TargetPicker';
import { TargetAvatar, TypeTag } from './allocationDisplay';

interface AllocationScopeEditorProps {
  scope: EditorScope;
  onChange: (next: EditorScope) => void;
  scopeValue: number | null;
  variant: 'contract' | 'product';
  title?: string;
  catalog: PickerCategory[];
  levelByUnitId: Record<number, OrgUnitLevel>;
  /** Seats already narrowed to this scope. */
  seats: ScopeSeat[];
  onCreateBusinessGroup: (name: string) => Promise<AllocationTargetRef | null>;
  formatAmount: (value: number | null) => string;
  pickerContainer?: HTMLElement | null;
}

function MethodToggle({
  value,
  onChange,
  disabled,
}: {
  value: SplitMethod;
  onChange: (method: SplitMethod) => void;
  disabled?: boolean;
}) {
  const options: { value: SplitMethod; label: string }[] = [
    { value: 'equal', label: 'Equal Split' },
    { value: 'manual', label: 'Manual' },
  ];
  return (
    <ToggleGroup
      type="single"
      variant="segmented"
      size="xs"
      aria-label="Split method"
      value={value}
      disabled={disabled}
      // Radix clears the value when the active item is pressed again; the two
      // methods are exhaustive, so the clear is ignored.
      onValueChange={(next) => next && onChange(next as SplitMethod)}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Keeps the typed text while editing so "33." survives the parse → re-render round trip. */
function PercentInput({
  value,
  onCommit,
  disabled,
  label,
}: {
  value: number;
  onCommit: (percent: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const [text, setText] = useState(String(Number(value.toFixed(4))));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(Number(value.toFixed(4))));
  }, [value, focused]);

  return (
    <div className="relative w-28">
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        aria-label={label}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          // A fresh line reads "0"; typing must replace it, not append to it.
          const next = e.target.value.replace(/^0+(?=\d)/, '');
          if (!/^\d*\.?\d{0,4}$/.test(next)) return;
          setText(next);
          const parsed = parseFloat(next);
          if (Number.isFinite(parsed)) onCommit(clampPercent(parsed));
        }}
        className="h-9 pr-7 tabular-nums"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        %
      </span>
    </div>
  );
}

export function AllocationScopeEditor({
  scope,
  onChange,
  scopeValue,
  variant,
  title,
  catalog,
  levelByUnitId,
  seats,
  onCreateBusinessGroup,
  formatAmount,
  pickerContainer,
}: AllocationScopeEditorProps) {
  const [editingAmountKey, setEditingAmountKey] = useState<string | null>(null);

  const isActiveUsers = scope.mode === 'active_users';
  const preview = activeUsersPreview(seats, catalog);
  const lines: EditorLine[] = isActiveUsers ? preview.lines : scope.lines;
  const { holders: seatHolders } = seatHolderTargets(seats, catalog);
  const canOfferActiveUsers = seatHolders.length > 0;

  const selectedKeys = new Set(lines.map((line) => targetKey(line.target)));
  const totals = scopeTotals(lines, scopeValue ?? 0);
  const amounts = displayAmounts(
    lines.map((line) => line.percent),
    scopeValue,
  );
  const unlinkedNote = unlinkedSeatsNote(preview.unlinkedCount);

  const commitManual = (next: EditorLine[], method: SplitMethod) =>
    onChange({
      ...scope,
      mode: 'manual',
      method,
      lines: method === 'equal' ? applyEqualSplit(next) : next,
    });

  const toggleTarget = (target: AllocationTargetRef) => {
    const key = targetKey(target);
    const next = selectedKeys.has(key)
      ? lines.filter((line) => targetKey(line.target) !== key)
      : [...lines, { target, percent: 0 }];
    commitManual(next, isActiveUsers ? 'equal' : scope.method);
  };

  const addMany = (targets: AllocationTargetRef[]) => {
    const fresh = targets.filter((t) => !selectedKeys.has(targetKey(t)));
    if (fresh.length === 0) return;
    commitManual(
      [...lines, ...fresh.map((target) => ({ target, percent: 0 }))],
      isActiveUsers ? 'equal' : scope.method,
    );
  };

  const setPercent = (key: string, percent: number) =>
    commitManual(
      lines.map((line) =>
        targetKey(line.target) === key ? { ...line, percent } : line,
      ),
      'manual',
    );

  const setAmount = (key: string, amount: number) =>
    setPercent(key, amountToPercent(amount, scopeValue ?? 0));

  const setMethod = (method: SplitMethod) => commitManual(lines, method);

  const setActiveUsers = (on: boolean) => {
    if (on) {
      onChange({ ...scope, mode: 'active_users', method: 'equal', lines: [] });
    } else {
      commitManual(preview.lines, 'equal');
    }
  };

  const picker = (
    <TargetPicker
      catalog={catalog}
      selectedKeys={selectedKeys}
      onToggle={toggleTarget}
      onCreateBusinessGroup={onCreateBusinessGroup}
      container={pickerContainer}
      triggerLabel={
        variant === 'contract' ? 'Add Allocation Target' : 'Add Allocation'
      }
    />
  );

  // The seat-holder shortcut sits beside the picker: for a contract with
  // active users it is typically the first action, not a branch of the
  // browse tree (product feedback 2026-08-25).
  const allSeatHoldersSelected = seatHolders.every((holder) =>
    selectedKeys.has(targetKey(holder)),
  );
  const addActiveUsers = canOfferActiveUsers && !isActiveUsers && (
    <Button
      variant="outline"
      size="sm"
      onClick={() => addMany(seatHolders)}
      disabled={allSeatHoldersSelected}
    >
      <Users className="h-4 w-4" />
      Add all active users ({seatHolders.length})
    </Button>
  );

  const activeUsersSwitch = canOfferActiveUsers && (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch
        checked={isActiveUsers}
        onCheckedChange={setActiveUsers}
        aria-label={ACTIVE_USERS_MODE_LABEL}
      />
      {ACTIVE_USERS_MODE_LABEL}
    </label>
  );

  const table = (
    <div className="mt-4">
      <Table
        stickyHeader
        scrollClassName="rounded border border-border"
        aria-label={
          variant === 'product' && title
            ? `${title} allocation`
            : 'Contract allocation'
        }
      >
        {/* The reports' header size; TableHeader's own .8em runs smaller. */}
        <TableHeader className="text-[0.75rem] 3xl:text-[0.8rem]">
          <TableRow className="hover:bg-transparent">
            <TableHead>Allocation Target</TableHead>
            <TableHead className="w-32">Type</TableHead>
            <TableHead className="w-36">Percentage</TableHead>
            <TableHead className="w-32">Amount</TableHead>
            <TableHead className="w-11 px-2">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  {isActiveUsers
                    ? 'No linked active users on this scope yet.'
                    : canOfferActiveUsers
                      ? `No allocation targets yet. Add all ${seatHolders.length} active users, or pick targets with Add Allocation Target.`
                      : 'No allocation targets added yet. Use the Add button to start allocating.'}
                </p>
              </TableCell>
            </TableRow>
          ) : (
            lines.map((line, index) => {
              const key = targetKey(line.target);
              const amount = amounts[index];
              return (
                <TableRow key={key} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <TargetAvatar target={line.target} />
                      <span className="font-medium font-sans text-sm text-foreground">
                        {line.target.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <TypeTag
                      label={targetTypeLabel(line.target, levelByUnitId)}
                    />
                  </TableCell>
                  <TableCell>
                    {isActiveUsers ? (
                      <button
                        type="button"
                        onClick={() => {
                          commitManual(preview.lines, 'manual');
                        }}
                        className="rounded px-1 py-0.5 text-sm tabular-nums hover:bg-muted"
                        aria-label={`Edit percentage for ${line.target.name}`}
                      >
                        {formatPercent(line.percent)}
                      </button>
                    ) : (
                      <PercentInput
                        value={line.percent}
                        label={`Percentage for ${line.target.name}`}
                        onCommit={(percent) => setPercent(key, percent)}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {editingAmountKey === key ? (
                      <Input
                        type="number"
                        min={0}
                        max={scopeValue ?? undefined}
                        step={1}
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        aria-label={`Amount for ${line.target.name}`}
                        defaultValue={Math.round(amount ?? 0)}
                        onChange={(e) => {
                          const parsed = parseFloat(e.target.value);
                          if (Number.isFinite(parsed)) setAmount(key, parsed);
                        }}
                        onBlur={() => setEditingAmountKey(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            setEditingAmountKey(null);
                          }
                        }}
                        className="h-9 w-28 tabular-nums"
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={scopeValue === null || scopeValue <= 0}
                        onClick={() => {
                          if (isActiveUsers)
                            commitManual(preview.lines, 'manual');
                          setEditingAmountKey(key);
                        }}
                        className="rounded px-1 py-0.5 text-sm tabular-nums text-foreground hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
                        aria-label={`Edit amount for ${line.target.name}`}
                      >
                        {formatAmount(amount)}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="px-2 text-right">
                    {!isActiveUsers && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleTarget(line.target)}
                        className="h-7 w-7 text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                        aria-label={`Remove ${line.target.name}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
        {lines.length > 0 && (
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="text-foreground">Total</TableCell>
              <TableCell />
              <TableCell>
                <span
                  className={cn(
                    'tabular-nums',
                    totals.balanced ? 'text-foreground' : 'text-destructive',
                  )}
                >
                  {formatPercent(totals.percent)}
                </span>
              </TableCell>
              <TableCell className="tabular-nums text-foreground">
                {formatAmount(scopeValue === null ? null : totals.amount)}
              </TableCell>
              <TableCell className="px-2" />
            </TableRow>
          </TableFooter>
        )}
      </Table>
      {isActiveUsers && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          Resolves live from the contract&apos;s linked seats; editing a
          percentage switches this scope to Manual.
          {unlinkedNote && ` ${unlinkedNote}`}
        </p>
      )}
    </div>
  );

  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      {activeUsersSwitch}
      {!isActiveUsers && lines.length > 0 && (
        <>
          <MethodToggle value={scope.method} onChange={setMethod} />
          <Button
            variant="ghost"
            size="xs"
            onClick={() => commitManual([], scope.method)}
            className="text-muted-foreground hover:text-destructive"
          >
            Clear all
          </Button>
        </>
      )}
    </div>
  );

  if (variant === 'product') {
    return (
      <div className="rounded border border-border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium text-sm text-foreground">{title}</span>
            <span className="text-xs text-muted-foreground">
              {formatAmount(scopeValue)}
            </span>
            {!isActiveUsers && picker}
            {addActiveUsers}
          </div>
          {controls}
        </div>
        {(lines.length > 0 || isActiveUsers) && table}
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {!isActiveUsers && picker}
          {addActiveUsers}
          <span className="text-xs text-muted-foreground">
            Contract value {formatAmount(scopeValue)}
          </span>
        </div>
        {controls}
      </div>
      {table}
    </>
  );
}
