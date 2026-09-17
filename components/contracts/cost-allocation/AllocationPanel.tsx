'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import type { CostAllocationTabPayload } from '@/app/api/v2/handlers/cost-allocation';
import { useSaveCostAllocation } from '@/hooks/api/useCostAllocation';
import {
  ACTIVE_USERS_MODE_LABEL,
  allocationProvenance,
  applicableScopes,
  displayAmounts,
  provenanceLabel,
  scopeTotals,
  scopeValueFor,
  unlinkedSeatsNote,
} from '@/lib/v2/cost-allocation/editor';
import { targetTypeLabel } from '@/lib/v2/cost-allocation/picker';
import { formatPercent } from '@/lib/v2/cost-allocation/activity-labels';
import type { ResolvedScope } from '@/lib/v2/cost-allocation/types';
import { AllocationEditor } from './AllocationEditor';
import { TargetAvatar, TypeTag } from './allocationDisplay';

function ResolvedScopeTable({
  scope,
  scopeValue,
  title,
  data,
  formatAmount,
}: {
  scope: ResolvedScope;
  scopeValue: number | null;
  title: string;
  data: CostAllocationTabPayload;
  formatAmount: (value: number | null) => string;
}) {
  const totals = scopeTotals(scope.lines, scopeValue ?? 0);
  const amounts = displayAmounts(
    scope.lines.map((line) => line.percent),
    scopeValue,
  );
  const unlinked = unlinkedSeatsNote(scope.unlinkedUserCount);
  return (
    <div className="rounded border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">
            {formatAmount(scopeValue)}
          </span>
        </div>
        {scope.mode === 'active_users' && (
          <span className="text-xs text-muted-foreground">
            {ACTIVE_USERS_MODE_LABEL}
          </span>
        )}
      </div>
      <Table stickyHeader aria-label={`${title} allocation`}>
        {/* The reports' header size; TableHeader's own .8em runs smaller. */}
        <TableHeader className="text-[0.75rem] 3xl:text-[0.8rem]">
          <TableRow className="hover:bg-transparent">
            <TableHead>Allocation Target</TableHead>
            <TableHead className="w-40">Type</TableHead>
            <TableHead className="w-32 text-right">Percentage</TableHead>
            <TableHead className="w-40 text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scope.lines.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={4}
                className="py-6 text-center text-muted-foreground"
              >
                No linked active users to split across.
              </TableCell>
            </TableRow>
          ) : (
            scope.lines.map((line, index) => (
              <TableRow key={`${line.target.kind}:${line.target.id}`}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <TargetAvatar target={line.target} />
                    <span className="font-sans text-sm text-foreground">
                      {line.target.name}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <TypeTag
                    label={targetTypeLabel(line.target, data.levelByUnitId)}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(line.percent)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatAmount(amounts[index])}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {scope.lines.length > 0 && (
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell>Total</TableCell>
              <TableCell />
              <TableCell className="text-right tabular-nums">
                {formatPercent(totals.percent)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatAmount(scopeValue === null ? null : totals.amount)}
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
      {unlinked && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {unlinked}
        </p>
      )}
    </div>
  );
}

function ResolvedView({
  data,
  canEdit,
  onEdit,
  onRemoveOverride,
  removing,
  formatAmount,
}: {
  data: CostAllocationTabPayload;
  canEdit: boolean;
  onEdit: () => void;
  onRemoveOverride: () => void;
  removing: boolean;
  formatAmount: (value: number | null) => string;
}) {
  const provenance = allocationProvenance(data.resolved);
  const recordNoun = data.isInvoice ? 'invoice' : 'contract';
  const productName = (id: number) =>
    data.products.find((p) => p.id === id)?.name ?? `Product #${id}`;
  const scopes = applicableScopes(
    data.resolved.scopes,
    new Set(data.products.map((p) => p.id)),
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {provenance.kind === 'inherited' && data.sourceContract ? (
              <>
                Inherited from{' '}
                <Link
                  href={`/contracts/${data.sourceContract.id}`}
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  {data.sourceContract.label}
                </Link>
              </>
            ) : (
              provenanceLabel(provenance, { isInvoice: data.isInvoice })
            )}
          </p>
          {data.valuesFromSource && data.sourceContract && (
            <p className="text-xs text-muted-foreground">
              {`Amounts shown are from ${data.sourceContract.label} — this ${recordNoun} has no value of its own.`}
            </p>
          )}
        </div>
        {canEdit && provenance.kind !== 'none' && (
          <div className="flex items-center gap-2">
            {provenance.kind === 'own' && data.isInvoice && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRemoveOverride}
                disabled={removing}
              >
                {removing ? 'Removing…' : 'Remove override'}
              </Button>
            )}
            <Button size="sm" onClick={onEdit}>
              {provenance.kind === 'own'
                ? 'Edit allocation'
                : `Override for this ${recordNoun}`}
            </Button>
          </div>
        )}
      </div>

      {scopes.map((scope) => (
        <ResolvedScopeTable
          key={scope.productId ?? 'contract'}
          scope={scope}
          scopeValue={scopeValueFor(data.values, scope.productId)}
          title={
            scope.productId === null
              ? 'Entire contract'
              : productName(scope.productId)
          }
          data={data}
          formatAmount={formatAmount}
        />
      ))}
      {data.resolved.scopes.length > 0 && scopes.length === 0 && (
        <p className="rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          The inherited allocation is by product, and this {recordNoun} carries
          none of the products it allocates.
        </p>
      )}
      {data.resolved.scopes.length === 0 && (
        <div className="rounded border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {/* One text node rather than text/expression/text: the split form
              renders the noun as its own segment, which showed up in the sheet
              as "invoiceis". The sourceContract line above already builds its
              copy this way. */}
          <p>
            {`This ${recordNoun} is unassigned — its spend reports under \u201CUnassigned\u201D.`}
          </p>
          {canEdit && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <Button size="sm" onClick={onEdit}>
                Allocate this {recordNoun}
              </Button>
              {data.parentContract && (
                <p className="text-xs">
                  or set up on{' '}
                  <Link
                    href={`/contracts/${data.parentContract.id}?view=cost-allocation`}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {data.parentContract.label}
                  </Link>{' '}
                  to cover all its {data.isInvoice ? 'invoices' : 'records'}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AllocationPanelProps {
  data: CostAllocationTabPayload;
  canEdit: boolean;
  formatAmount: (value: number | null) => string;
  /** After a save or a removed override — the report sheet refreshes its server-loaded rows. */
  onChanged?: () => void;
  /** The enclosing Sheet/Dialog content node, so the target picker's popover portals inside it. */
  pickerContainer?: HTMLElement | null;
}

/**
 * The resolved allocation with the override/edit flow — one component for the
 * contract tab and the invoice report sheet, so both write through the same
 * server action and gate.
 */
export function AllocationPanel({
  data,
  canEdit,
  formatAmount,
  onChanged,
  pickerContainer,
}: AllocationPanelProps) {
  const { toast } = useToast();
  const save = useSaveCostAllocation(data.contractId);
  // Always lands read-only (QA 2026-08-26): the editor is entered through
  // Edit allocation or Allocate this contract, never opened on arrival.
  const [isEditing, setEditing] = useState(false);

  const removeOverride = async () => {
    try {
      await save.mutateAsync([]);
      toast({ title: 'Override removed' });
      onChanged?.();
    } catch (err) {
      toast({
        title: 'Could not remove override',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    }
  };

  if (isEditing) {
    return (
      <AllocationEditor
        key={data.resolved.scopes.length + (data.hasOwnAllocation ? 1 : 0)}
        data={data}
        formatAmount={formatAmount}
        pickerContainer={pickerContainer}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged?.();
        }}
      />
    );
  }
  return (
    <ResolvedView
      data={data}
      canEdit={canEdit}
      onEdit={() => setEditing(true)}
      onRemoveOverride={() => void removeOverride()}
      removing={save.isPending}
      formatAmount={formatAmount}
    />
  );
}
