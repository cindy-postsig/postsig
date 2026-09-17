'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { apiClient } from '@/lib/api/v2-client';
import { formatCurrency } from '@/app/lib/utils';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { costMethodLabels } from '@/components/budget/costMethod';
import { SummaryCard } from '@/components/cards/SummaryCard';
import { InlineExpandToggle } from '@/components/contracts/InlineExpandToggle';
import { AllocationSheet } from '@/components/contracts/cost-allocation/AllocationSheet';
import { TypeTag } from '@/components/contracts/cost-allocation/allocationDisplay';
import VendorIcon from '@/components/vendors/VendorIcon';
import { DateRangeControl } from '@/components/reports/DateRangeControl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { formatDate } from '@/lib/date-format';
import { cn } from '@/lib/utils';
import { TARGET_TYPE_LABELS } from '@/lib/v2/cost-allocation/picker';
import { DEFAULT_ROLLUP_REPORT_PERIOD } from '@/lib/v2/cost-allocation/report-window';
import {
  OUTSIDE_HIERARCHY_LABEL,
  UNASSIGNED_LABEL,
  applyBudgetEdit,
  flattenRollupView,
  isFlatRollup,
  searchRollupRows,
  type AllocationRollupData,
  type RollupRow,
  type RollupView,
  type RollupViewKey,
} from '@/lib/v2/cost-allocation/rollup-report-rows';

interface AllocationRollupReportProps {
  data: AllocationRollupData;
  canEdit: boolean;
  baseCurrency: string;
  dateFormat: string;
  showBudgets?: boolean;
  initialExpandUnassigned?: boolean;
}

function LevelSlicer({
  views,
  active,
  onChange,
}: {
  views: RollupView[];
  active: RollupViewKey;
  onChange: (key: RollupViewKey) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="segmented"
      size="xs"
      aria-label="Level"
      value={active}
      // Radix clears the value when the active item is pressed again; a slicer
      // has no unselected state, so the clear is ignored.
      onValueChange={(key) => key && onChange(key as RollupViewKey)}
      className="flex-wrap justify-start"
    >
      {views.map((view) => (
        <ToggleGroupItem
          key={view.key}
          value={view.key}
          className="whitespace-nowrap"
        >
          {view.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function BudgetCell({
  row,
  fiscalYear,
  canEdit,
  formatAmount,
  onCommit,
}: {
  row: RollupRow;
  fiscalYear: number | null;
  canEdit: boolean;
  formatAmount: (value: number | null) => string;
  onCommit: (row: RollupRow, amount: number | null) => Promise<boolean>;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!canEdit || fiscalYear === null) {
    return (
      <span
        className="tabular-nums text-foreground"
        title={
          fiscalYear === null
            ? 'Budgets span several fiscal years; choose a range inside one fiscal year to edit'
            : undefined
        }
      >
        {formatAmount(row.budget)}
      </span>
    );
  }

  const commit = () => {
    if (draft === null) return;
    const digits = draft.replace(/[^\d.]/g, '');
    const amount = digits === '' ? null : Number(digits);
    if (amount !== null && !Number.isFinite(amount)) {
      toast({
        variant: 'destructive',
        title: 'Budget not saved',
        description: 'Enter a number, for example 1000.',
      });
      return;
    }
    if (amount === row.budget) {
      setDraft(null);
      return;
    }
    setPending(true);
    void onCommit(
      row,
      amount === null ? null : Math.round(amount * 100) / 100,
    ).then((saved) => {
      setPending(false);
      // A failed save keeps the draft in place for correction.
      if (saved) setDraft(null);
    });
  };

  return (
    <Input
      inputMode="decimal"
      aria-label={`Budget for ${row.name}`}
      value={draft ?? (row.budget === null ? '' : String(row.budget))}
      placeholder="—"
      disabled={pending}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="h-8 w-28 text-right tabular-nums"
    />
  );
}

function DifferenceCell({
  value,
  formatAmount,
}: {
  value: number | null;
  formatAmount: (value: number | null) => string;
}) {
  return (
    <span
      className={cn(
        'tabular-nums',
        value === null
          ? 'text-muted-foreground'
          : value >= 0
            ? 'text-emerald-600'
            : 'text-red-600',
      )}
    >
      {formatAmount(value)}
    </span>
  );
}

/**
 * Budgets are hidden from the summary for now (product, 2026-08-26): the
 * inline Budget input and everything derived from it — Rolled-up Budget, the
 * Difference column, the Total Budget and Budget Difference cards. Everything
 * behind the gate still builds and still saves, so restoring it is this one
 * line; `rollup-report-rows` keeps computing the numbers either way. Tests
 * force the surfaces on through `showBudgets` so they stay covered meanwhile.
 */
const BUDGETS_VISIBLE = false;

export const OUTSIDE_HIERARCHY_ROW_KEY = 'catch-all:outside-hierarchy';
export const UNASSIGNED_ROW_KEY = 'catch-all:unassigned';

function AttentionDot() {
  return (
    <span
      role="img"
      aria-label="Needs attention"
      className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
    />
  );
}

interface CatchAllChild {
  key: string;
  name: ReactNode;
  amount: number | null;
  onOpen?: () => void;
  ariaLabel?: string;
}

function CatchAllRow({
  name,
  amount,
  columns,
  formatAmount,
  hint,
  showBudgets,
  childRows,
  expanded,
  onToggle,
}: {
  name: string;
  amount: number;
  columns: number;
  formatAmount: (value: number | null) => string;
  hint: string;
  showBudgets: boolean;
  childRows: CatchAllChild[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasChildren = childRows.length > 0;
  const fillerCount = columns - (showBudgets ? 3 : 2);
  const filler = Array.from({ length: fillerCount }, (_, i) => (
    <TableCell key={i} className="text-right">
      —
    </TableCell>
  ));

  return (
    <>
      <TableRow
        onClick={hasChildren ? onToggle : undefined}
        className={cn(
          'border-border/60 bg-muted/60 hover:bg-muted/60',
          hasChildren && 'cursor-pointer hover:bg-muted',
        )}
      >
        <TableCell className="w-11">
          <div className="flex items-center justify-center">
            {hasChildren && (
              <InlineExpandToggle expanded={expanded} onToggle={onToggle} />
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <span className="font-medium font-sans text-sm text-foreground">
              {name}
            </span>
            {amount > 0 && <AttentionDot />}
            <span className="text-xs text-muted-foreground">{hint}</span>
          </div>
        </TableCell>
        {filler}
        <TableCell className="font-medium text-right tabular-nums text-foreground">
          {formatAmount(amount)}
        </TableCell>
        {showBudgets && <TableCell className="text-right">—</TableCell>}
      </TableRow>
      {expanded &&
        childRows.map((child) => (
          <TableRow
            key={child.key}
            tabIndex={child.onOpen ? 0 : undefined}
            aria-label={child.ariaLabel}
            onClick={child.onOpen}
            onKeyDown={
              child.onOpen &&
              ((event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  child.onOpen?.();
                }
              })
            }
            className={cn(
              'border-border/60 bg-muted/25 hover:bg-muted/40',
              child.onOpen &&
                'cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none',
            )}
          >
            <TableCell className="w-11" />
            <TableCell>
              <div
                className="flex items-center gap-1.5"
                style={{ paddingLeft: 20 }}
              >
                <span className="w-[18px] shrink-0" aria-hidden />
                {child.name}
              </div>
            </TableCell>
            {filler}
            <TableCell className="text-right tabular-nums text-foreground">
              {formatAmount(child.amount)}
            </TableCell>
            {showBudgets && <TableCell className="text-right">—</TableCell>}
          </TableRow>
        ))}
    </>
  );
}

export function AllocationRollupReport({
  data: serverData,
  canEdit,
  baseCurrency,
  dateFormat,
  showBudgets = BUDGETS_VISIBLE,
  initialExpandUnassigned = false,
}: AllocationRollupReportProps) {
  const router = useRouter();
  const pathname = usePathname();
  // Budget edits land on this copy optimistically (applyBudgetEdit) — spend
  // does not depend on budgets, so a save never re-runs the engine. A server
  // reload (window change) replaces it wholesale.
  const [data, setData] = useState(serverData);
  // Each server reload (window change) is a new generation; a save started
  // against an earlier generation must not revert rows it never edited.
  const reportGeneration = useRef(0);
  useEffect(() => {
    reportGeneration.current += 1;
    setData(serverData);
  }, [serverData]);
  const { toast } = useToast();

  const flat = isFlatRollup(data);
  // A search-param push does not re-enter loading.tsx, so without this the
  // report sits unchanged while the server re-renders and the click reads as
  // ignored. The results dim and the trigger spins instead.
  const [isPending, startTransition] = useTransition();
  const navigate = (query: string) =>
    startTransition(() => router.push(`${pathname}?${query}`));
  // A custom range is its own period, so this covers a typed range too.
  const windowDeviatesFromDefault =
    data.period !== DEFAULT_ROLLUP_REPORT_PERIOD;
  const resetWindow = () => startTransition(() => router.push(pathname));

  const [viewKey, setViewKey] = useState<RollupViewKey | null>(
    data.views[0]?.key ?? null,
  );
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    initialExpandUnassigned ? new Set([UNASSIGNED_ROW_KEY]) : new Set(),
  );
  // A search spans every level, so it replaces the slicer's tree with its
  // matches rather than filtering one view. The view and what is expanded
  // under it are left alone, and come back when the query is cleared.
  const [search, setSearch] = useState('');
  const query = search.trim();
  const unallocated = data.unallocatedContracts;
  const searching = query !== '';
  const [selectedContractId, setSelectedContractId] = useState<number | null>(
    null,
  );

  const view = data.views.find((v) => v.key === viewKey) ?? data.views[0];
  const displayRows = useMemo(
    () =>
      searching
        ? searchRollupRows(data.rows, query).map((row) => ({ row, depth: 0 }))
        : view
          ? flattenRollupView(data.rows, view.rootKeys, (key) =>
              expanded.has(key),
            )
          : [],
    [data.rows, view, expanded, searching, query],
  );

  const formatAmount = (value: number | null) =>
    value === null ? '—' : (formatCurrency(value, baseCurrency) ?? '');

  const outsideHierarchyChildren: CatchAllChild[] = (
    view?.outsideHierarchyRows ?? []
  ).map((target) => ({
    key: target.key,
    // The bucket is the one place kinds mix, so each row is tagged with its
    // own — the column header names the view's level, not these.
    name: (
      <>
        <span className="font-sans text-sm text-foreground">{target.name}</span>
        {target.levelLabel && <TypeTag label={target.levelLabel} />}
      </>
    ),
    amount: target.amount,
  }));
  const unallocatedChildren: CatchAllChild[] = unallocated.map((contract) => ({
    key: String(contract.id),
    onOpen: () => setSelectedContractId(contract.id),
    ariaLabel: `Open cost allocation for ${contract.vendor ?? contract.name}`,
    name: (
      <div className="flex min-w-0 items-center gap-3">
        <VendorIcon
          name={contract.vendor ?? ''}
          domain={contract.vendorDomain}
          width={24}
          height={24}
          lazy
        />
        <span className="font-medium truncate font-sans text-sm text-foreground">
          {contract.vendor ?? contract.name}
        </span>
        {contract.product && (
          <span className="truncate font-sans text-sm text-muted-foreground">
            {contract.product}
            {contract.products.length > 1 && (
              <span className="ml-1 text-xs">
                +{contract.products.length - 1}
              </span>
            )}
          </span>
        )}
      </div>
    ),
    amount: contract.amount,
  }));
  const selectedContract =
    unallocated.find((contract) => contract.id === selectedContractId) ?? null;

  if (!view) {
    return (
      <div className="rounded border border-border p-12 text-center text-sm text-muted-foreground">
        No org structure to report on yet. Import employees under{' '}
        <Link href="/settings/employees" className="underline">
          Settings › Employees
        </Link>{' '}
        or create business groups from a contract&apos;s Owner tab.
      </div>
    );
  }

  // Deliberately pessimistic: the cell stays disabled until the save settles
  // (no same-row races to referee), and only a confirmed save touches the
  // rows. The save is just the gated upsert — no revalidate, no
  // router.refresh(), no engine re-run — so "pending" is the upsert's
  // round-trip, and applyBudgetEdit keeps the totals in step without
  // reloading the report.
  const commitBudget = async (
    row: RollupRow,
    amount: number | null,
  ): Promise<boolean> => {
    const fiscalYear = data.budgetFiscalYear;
    if (fiscalYear === null) return false;
    const generation = reportGeneration.current;
    let failure: string | undefined;
    try {
      await apiClient.costAllocation.saveBudget({
        target: row.target,
        fiscalYear,
        amount,
      });
    } catch (error) {
      failure =
        error instanceof Error && error.message
          ? error.message
          : 'Something went wrong; the budget was not saved.';
    }
    if (failure !== undefined) {
      toast({
        variant: 'destructive',
        title: 'Budget not saved',
        description: failure,
      });
      return false;
    }
    // A success landing after a window switch belongs to the previous
    // report; the new window's rows must not absorb it.
    if (generation === reportGeneration.current) {
      setData((current) => ({
        ...current,
        ...applyBudgetEdit(current, row.key, amount),
      }));
    }
    return true;
  };

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const expandAll = () =>
    setExpanded(
      new Set([
        ...flattenRollupView(data.rows, view.rootKeys).map((r) => r.row.key),
        OUTSIDE_HIERARCHY_ROW_KEY,
        UNASSIGNED_ROW_KEY,
      ]),
    );
  const collapseAll = () => setExpanded(new Set());

  // The catch-alls answer "where is the rest of the money", which only the
  // landing view is asking; drilling into a level is a filter. The headline
  // deliberately does not follow them: spendTotal has always been the same
  // number on every view, and Projected FY Spend is a single org-wide figure,
  // so filtering one of the pair would compare unlike things.
  const isLandingView = view.key === data.views[0]?.key;

  const difference = view.budgetTotal - view.spendTotal;
  const budgetColumns = showBudgets;
  const breakdownColumns = !flat;
  const columnCount = showBudgets ? (flat ? 4 : 7) : flat ? 2 : 4;
  // Cost centers are flat and parentless — the one non-tree level — so
  // "outside the hierarchy" names nothing there. Kept when it holds money:
  // the Total Spend card counts that money either way, and dropping the row
  // would leave the gap between card and rows unexplained.
  const showOutsideHierarchy =
    isLandingView &&
    (view.key !== 'cost_center' || view.outsideHierarchy !== 0);
  // Named for what the bucket means, not how it is computed: "lines" and
  // "targets" are allocation-engine words, and "org unit" is a table. The row
  // expands to name what is actually in it, so the hint need not list causes.
  const outsideHint =
    view.key === 'user'
      ? 'Not allocated to a person'
      : `Allocated outside any ${TARGET_TYPE_LABELS[view.key].toLowerCase()}`;

  return (
    <div className="pb-10">
      <div className="mb-10 font-sans text-foreground/70">
        Direct and rolled-up spend across the allocation hierarchy. Spend basis:{' '}
        {costMethodLabels[data.costMethod]}.
        {data.bloombergSeatRenewalIncreasePercent !== null
          ? ` Bloomberg seat renewals are projected at an estimated ${data.bloombergSeatRenewalIncreasePercent}% price increase, and months after the latest import are at the latest report's rate.`
          : null}
      </div>

      <div
        className={cn(
          'mb-10 grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-3',
          isPending && 'opacity-50',
        )}
      >
        {showBudgets && (
          <SummaryCard
            title="Total Budget"
            description={`Every budget in this view for FY${data.fiscalYears[0]}${
              data.fiscalYears.length > 1
                ? `–FY${data.fiscalYears[data.fiscalYears.length - 1]}`
                : ''
            }`}
            amount={view.budgetTotal}
            currency={baseCurrency}
          />
        )}
        {data.projected !== null ? (
          <>
            <SummaryCard
              title="Current FY Spend"
              description="Direct and rolled-up spend in the selected date range"
              amount={view.spendTotal}
              currency={baseCurrency}
            />
            <SummaryCard
              title="Projected FY Spend"
              description="Direct and rolled-up spend for the next fiscal year"
              amount={data.projected}
              currency={baseCurrency}
            />
          </>
        ) : (
          <SummaryCard
            title="Total Spend"
            description="Direct and rolled-up spend in the selected date range"
            amount={view.spendTotal}
            currency={baseCurrency}
          />
        )}
        {showBudgets && (
          <SummaryCard
            title="Budget Difference"
            description={
              difference >= 0 ? 'Remaining under budget' : 'Over budget'
            }
            amount={difference}
            currency={baseCurrency}
          />
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <DateRangeControl
          // The typed dates seed from data.custom, so a window change is a new
          // control: without this, leaving a custom range for a preset would
          // leave the old dates in the fields and let Apply navigate back to a
          // range the user already left. Same reset BudgetCell uses.
          key={`${data.period}|${data.custom?.from ?? ''}|${data.custom?.to ?? ''}`}
          period={data.period}
          window={data.window}
          custom={data.custom}
          dateFormat={dateFormat}
          onNavigate={navigate}
          pending={isPending}
        />
        {windowDeviatesFromDefault && (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={resetWindow}
          >
            Reset
          </Button>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search levels and users"
            aria-label="Search levels and users"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 w-[220px] pl-8 text-sm"
          />
        </div>
        {!flat && !searching && (
          <LevelSlicer
            views={data.views}
            active={view.key}
            onChange={(key) => {
              setViewKey(key);
              setExpanded(new Set());
            }}
          />
        )}
        {!flat && !searching && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="font-normal h-8"
              onClick={expandAll}
            >
              Expand all
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="font-normal h-8"
              onClick={collapseAll}
            >
              Collapse all
            </Button>
          </div>
        )}
      </div>

      <div
        aria-busy={isPending}
        className={cn(
          'rounded border border-border transition-opacity',
          isPending && 'pointer-events-none opacity-50',
        )}
      >
        <Table stickyHeader>
          <caption className="sr-only">
            {`${showBudgets ? 'Spend and budget' : 'Spend'} by ${
              searching ? 'name' : TARGET_TYPE_LABELS[view.key].toLowerCase()
            }`}
          </caption>
          {/* Matches ColumnHeader, the size Contracts and Inventory render. */}
          <TableHeader className="text-[0.75rem] 3xl:text-[0.8rem]">
            <TableRow>
              {/* The expander gutter, as in Contracts and Inventory: a column
                  of its own so a childless row's name still starts where every
                  other name does. */}
              <TableHead className="w-11" />
              {/* Matches cross every level, so the active view's label would
                  name only some of them. */}
              <TableHead>
                {searching ? 'Name' : TARGET_TYPE_LABELS[view.key]}
              </TableHead>
              {budgetColumns && (
                <TableHead className="text-right">Budget</TableHead>
              )}
              {budgetColumns && !flat && (
                <TableHead className="text-right">Rolled-up Budget</TableHead>
              )}
              {breakdownColumns && (
                <TableHead className="text-right">Direct Spend</TableHead>
              )}
              {breakdownColumns && (
                <TableHead className="text-right">Rolled-up Spend</TableHead>
              )}
              <TableHead className="text-right">
                {flat ? 'Spend' : 'Total Spend'}
              </TableHead>
              {budgetColumns && (
                <TableHead className="text-right">Difference</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {searching && displayRows.length === 0 && (
              <TableRow>
                <TableCell
                  // columnCount leaves out the expander gutter, which
                  // CatchAllRow renders itself.
                  colSpan={columnCount + 1}
                  className="p-8 text-center text-muted-foreground"
                >
                  No matches
                </TableCell>
              </TableRow>
            )}
            {displayRows.map(({ row, depth }) => {
              // A match list is flat: its rows carry no subtree to open.
              const hasChildren = !searching && row.childKeys.length > 0;
              const isOpen = expanded.has(row.key);
              return (
                <TableRow
                  key={row.key}
                  // Clicking anywhere on an expandable row opens it, as the
                  // contracts and inventory tables do for their group rows.
                  // The control itself stops propagation, so it never double
                  // toggles.
                  onClick={hasChildren ? () => toggle(row.key) : undefined}
                  className={cn(
                    'border-border/60',
                    hasChildren && 'cursor-pointer',
                    isOpen && hasChildren
                      ? 'bg-gray-700/5 hover:bg-gray-700/10 dark:bg-black/15 dark:hover:bg-black/20'
                      : 'hover:bg-muted/30',
                  )}
                >
                  <TableCell className="w-11">
                    {/* The gutter carries top-level rows only. A subrow's
                        control sits inline after its indent, so it travels
                        with the row rather than detaching to the far left. */}
                    <div className="flex items-center justify-center">
                      {depth === 0 && hasChildren && (
                        <InlineExpandToggle
                          expanded={isOpen}
                          onToggle={() => toggle(row.key)}
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div
                      className="flex items-center gap-1.5"
                      style={{ paddingLeft: depth * 20 }}
                    >
                      {depth > 0 &&
                        (hasChildren ? (
                          <InlineExpandToggle
                            size="sm"
                            expanded={isOpen}
                            onToggle={() => toggle(row.key)}
                          />
                        ) : (
                          // Keeps same-depth siblings' names on one line.
                          <span className="w-[18px] shrink-0" aria-hidden />
                        ))}
                      {/* Top of the tree carries the weight, whatever level
                          that happens to be — in a flat org every row is one. */}
                      <span
                        className={cn(
                          'font-sans text-sm text-foreground',
                          depth === 0 && 'font-medium',
                        )}
                      >
                        {row.name}
                      </span>
                      {/* Only at the top: below it, the parent is the row above. */}
                      {depth === 0 && row.breadcrumb && (
                        <span className="text-xs text-muted-foreground">
                          · {row.breadcrumb}
                        </span>
                      )}
                      {/* A match has no view context to read the level off. */}
                      {(searching || row.level !== view.key) && (
                        <TypeTag label={row.levelLabel} />
                      )}
                    </div>
                  </TableCell>
                  {showBudgets && (
                    <TableCell className="text-right">
                      {/* Editing a budget must not toggle the row underneath. */}
                      <div
                        className="flex justify-end"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <BudgetCell
                          // A window change is a new report: drafts and pending
                          // state from the previous one must not carry over.
                          key={`${data.window.start}|${data.window.end}|${data.budgetFiscalYear}`}
                          row={row}
                          fiscalYear={data.budgetFiscalYear}
                          canEdit={canEdit}
                          formatAmount={formatAmount}
                          onCommit={commitBudget}
                        />
                      </div>
                    </TableCell>
                  )}
                  {showBudgets && !flat && (
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {hasChildren ? formatAmount(row.rolledUpBudget) : '—'}
                    </TableCell>
                  )}
                  {!flat && (
                    <TableCell className="text-right tabular-nums text-foreground">
                      {formatAmount(row.direct)}
                    </TableCell>
                  )}
                  {/* Never gated on children: a leaf carries rolled-up spend
                      too, since employee lines land on their team as rollup. */}
                  {!flat && (
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatAmount(row.rollup)}
                    </TableCell>
                  )}
                  <TableCell className="font-medium text-right tabular-nums text-foreground">
                    {formatAmount(row.total)}
                  </TableCell>
                  {showBudgets && (
                    <TableCell className="text-right">
                      <DifferenceCell
                        value={row.difference}
                        formatAmount={formatAmount}
                      />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {/* The catch-alls answer "where is the rest of the money", which
                a match list is not asking. */}
            {!searching && (
              <>
                {showOutsideHierarchy && (
                  <CatchAllRow
                    showBudgets={showBudgets}
                    name={OUTSIDE_HIERARCHY_LABEL}
                    amount={view.outsideHierarchy}
                    columns={columnCount}
                    formatAmount={formatAmount}
                    hint={outsideHint}
                    childRows={outsideHierarchyChildren}
                    expanded={expanded.has(OUTSIDE_HIERARCHY_ROW_KEY)}
                    onToggle={() => toggle(OUTSIDE_HIERARCHY_ROW_KEY)}
                  />
                )}
                {isLandingView && (
                  <CatchAllRow
                    showBudgets={showBudgets}
                    name={UNASSIGNED_LABEL}
                    amount={view.unassigned}
                    columns={columnCount}
                    formatAmount={formatAmount}
                    hint="Contracts with no allocation"
                    // The bucket names the money; the list names the contracts
                    // it came from.
                    childRows={unallocatedChildren}
                    expanded={expanded.has(UNASSIGNED_ROW_KEY)}
                    onToggle={() => toggle(UNASSIGNED_ROW_KEY)}
                  />
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      <AllocationSheet
        subject={
          selectedContract === null
            ? null
            : {
                id: selectedContract.id,
                title: selectedContract.product || selectedContract.name,
                vendor: selectedContract.vendor ?? '',
                vendorDomain: selectedContract.vendorDomain,
                contextFields: [
                  { label: 'Contract', value: selectedContract.name },
                  {
                    label: 'Spend in Range',
                    value: formatAmount(selectedContract.amount),
                  },
                  {
                    label: 'Term Start',
                    value: selectedContract.termStart
                      ? formatDate(selectedContract.termStart, dateFormat)
                      : '—',
                  },
                  {
                    label: 'Term End',
                    value: selectedContract.termEnd
                      ? formatDate(selectedContract.termEnd, dateFormat)
                      : '—',
                  },
                ],
                link: {
                  href: `/contracts/${selectedContract.id}`,
                  label: selectedContract.name,
                  caption: 'Contract',
                },
              }
        }
        canEdit={canEdit}
        formatAmount={formatAmount}
        onClose={() => setSelectedContractId(null)}
      />
    </div>
  );
}
