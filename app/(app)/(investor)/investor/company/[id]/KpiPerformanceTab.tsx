'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, Plus, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { TableShell } from '@/app/(app)/(investor)/investor/components/TableShell';
import {
  useCanManageKpis,
  useCanEditKpiValues,
} from '@/hooks/useCanManageKpis';
import {
  CustomKpiFields,
  customKpiDraftPayload,
  emptyCustomKpiDraft,
  type CustomKpiDraft,
} from '@/app/(app)/(investor)/investor/components/CustomKpiFields';
import { DeleteCustomKpiDialog } from '@/app/(app)/(investor)/investor/components/DeleteCustomKpiDialog';
import { FieldRow, SubTabEmpty } from './companyDetailsPrimitives';
import {
  buildKpiPeriods,
  buildStandardEditableKpis,
  currentPeriod,
  customDisplayValue,
  customToEditableKpi,
  editableKpiHasContent,
  editableKpiHasPeriodContent,
  formatKpiDisplay,
  visibleCategoryKpis,
} from '@/lib/v2/kpis/transforms';
import {
  NARRATIVE_CATEGORY,
  type CompanyCustomKpi,
  type EditableKpi,
  type KpiDefinition,
  type KpiPeriod,
  type KpiPeriodView,
  type ReportingQuarter,
  type StandardKpiOverride,
} from '@/lib/v2/kpis/types';
import { apiClient, ApiRequestError } from '@/lib/api/v2-client';
import {
  bandClasses,
  EditableKpiRow,
  KpiCategoryHeaderRow,
  STICKY_METRIC_COLUMN,
} from './KpiTableRows';

// Standard (non-custom) categories only; custom KPIs are grouped separately.
const catalogCategories = (kpiCatalog: KpiDefinition[]): string[] =>
  Array.from(
    new Set(
      kpiCatalog
        .filter((f) => !f.isCustom && f.category !== NARRATIVE_CATEGORY)
        .map((f) => f.category),
    ),
  );

// KPI values state lives in KpisContent: this tab unmounts when the user
// switches sub-tabs, so holding refreshed values here would reset them to the
// stale server-fetched props on remount.
export function KpiPerformanceTab({
  submitted,
  companyId,
  kpiCatalog,
  customKpis,
  standardOverrides,
  refreshKpis,
}: {
  submitted: ReportingQuarter[];
  companyId: number;
  kpiCatalog: KpiDefinition[];
  customKpis: CompanyCustomKpi[];
  standardOverrides: StandardKpiOverride[];
  refreshKpis: () => void;
}) {
  const { toast } = useToast();
  const canManage = useCanManageKpis();
  const canEditValues = useCanEditKpiValues();
  const router = useRouter();

  const [draft, setDraft] = useState<CustomKpiDraft>(emptyCustomKpiDraft);
  const [addingCategory, setAddingCategory] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EditableKpi | null>(null);
  const [view, setView] = useState<'table' | 'grid'>('table');
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [period, setPeriod] = useState<KpiPeriodView>('quarterly');
  const [gridPeriodKey, setGridPeriodKey] = useState<string | null>(null);

  const kpiCategories = useMemo(
    () => catalogCategories(kpiCatalog),
    [kpiCatalog],
  );

  const standardEditable = useMemo(
    () => buildStandardEditableKpis(kpiCatalog, submitted, standardOverrides),
    [kpiCatalog, submitted, standardOverrides],
  );
  const customEditable = useMemo(
    () => customKpis.map(customToEditableKpi),
    [customKpis],
  );
  const allEditable = useMemo(
    () => [...standardEditable, ...customEditable],
    [standardEditable, customEditable],
  );

  const hasContent = allEditable.some(editableKpiHasContent);
  const hasPeriodContent = useMemo(
    () => allEditable.some((kpi) => editableKpiHasPeriodContent(kpi, period)),
    [allEditable, period],
  );
  const showControls = hasContent || showAllMetrics;
  const emptyMessage =
    showAllMetrics || hasPeriodContent
      ? null
      : hasContent
        ? `No ${period} KPI values for this company.`
        : 'No KPIs recorded for this company.';

  const editableByCat = useMemo(() => {
    const map = new Map<
      string,
      { standard: EditableKpi[]; custom: EditableKpi[] }
    >();
    const ensure = (category: string) => {
      let entry = map.get(category);
      if (!entry) {
        entry = { standard: [], custom: [] };
        map.set(category, entry);
      }
      return entry;
    };
    for (const kpi of standardEditable) ensure(kpi.category).standard.push(kpi);
    for (const kpi of customEditable) ensure(kpi.category).custom.push(kpi);
    return map;
  }, [standardEditable, customEditable]);

  // One column list drives the table headers, the value cells and the grid's
  // period picker, so the three can't disagree about which periods exist.
  const current = useMemo(currentPeriod, []);
  const periods = useMemo(
    () => buildKpiPeriods(period, submitted, allEditable, current),
    [period, submitted, allEditable, current],
  );

  // Every catalog category is addable, so all render; collapse all but the first
  // that already has content (standard or custom) — fall back to the first.
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    () => {
      const catByCode = new Map(
        kpiCatalog.flatMap((f) =>
          f.code ? [[f.code, f.category] as const] : [],
        ),
      );
      const cats = catalogCategories(kpiCatalog);
      for (const k of customKpis)
        if (!cats.includes(k.category)) cats.push(k.category);
      const withContent = new Set<string>();
      for (const q of submitted) {
        for (const kpi of q.kpis)
          if (
            kpi.valueType !== 'textarea' &&
            kpi.category !== NARRATIVE_CATEGORY
          )
            withContent.add(kpi.category);
      }
      for (const o of standardOverrides) {
        const category = catByCode.get(o.code);
        if (category) withContent.add(category);
      }
      for (const k of customKpis) withContent.add(k.category);
      const firstOpen = cats.find((c) => withContent.has(c)) ?? cats[0];
      return new Set(cats.filter((c) => c !== firstOpen));
    },
  );
  const toggleCategory = (category: string) =>
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      next.has(category) ? next.delete(category) : next.add(category);
      return next;
    });

  // Quarterly authoring view renders every catalog category (each is addable),
  // in catalog order, with any custom-only categories appended.
  const authoringCategories = useMemo(() => {
    const order: string[] = [...kpiCategories];
    for (const kpi of customEditable)
      if (!order.includes(kpi.category)) order.push(kpi.category);
    return order;
  }, [kpiCategories, customEditable]);

  // Categories that have content for the rendered period (standard or custom).
  // Empty catalog categories stay hidden unless All metrics is on.
  const displayCategories = useMemo(() => {
    const hasPeriodData = (category: string) => {
      const entry = editableByCat.get(category);
      if (!entry) return false;
      const hasData = (kpi: EditableKpi) =>
        editableKpiHasPeriodContent(kpi, period);
      return entry.standard.some(hasData) || entry.custom.some(hasData);
    };
    const order = kpiCategories.filter(hasPeriodData);
    for (const kpi of customEditable)
      if (!order.includes(kpi.category) && hasPeriodData(kpi.category))
        order.push(kpi.category);
    return order;
  }, [editableByCat, kpiCategories, customEditable, period]);

  const renderedCategories = showAllMetrics
    ? authoringCategories
    : displayCategories;

  const startAdd = (category: string) => {
    setAddingCategory(category);
    setDraft(emptyCustomKpiDraft());
  };
  const cancelAdd = () => {
    setAddingCategory(null);
    setDraft(emptyCustomKpiDraft());
  };

  const refreshAll = () => {
    refreshKpis();
    router.refresh();
  };

  const handleAddCustom = async (category: string) => {
    const payload = customKpiDraftPayload(draft);
    if (!payload.label || adding) return;
    setAdding(true);
    try {
      await apiClient.reporting.createCustomKpi({ ...payload, category });
      setShowAllMetrics(true);
      // Adding closes the inline editor — one at a time.
      setAddingCategory(null);
      setDraft(emptyCustomKpiDraft());
      refreshAll();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not add KPI',
        description:
          err instanceof ApiRequestError
            ? err.message
            : 'Something went wrong. Please try again.',
      });
    } finally {
      setAdding(false);
    }
  };

  // The per-category "Add custom KPI" affordance, shared by the quarterly and
  // annual authoring tables (colSpan differs per table). Only rendered for
  // managers; the inline editor collapses back to the trigger after a save.
  // band continues the category's row striping.
  const renderAddCustomRow = (
    category: string,
    colSpan: number,
    band: boolean,
  ) => {
    const { cellBg, rowHover } = bandClasses(band);
    return addingCategory === category ? (
      <TableRow className={`${cellBg} ${rowHover}`}>
        <TableCell
          colSpan={colSpan}
          className={`border-t border-dashed border-border/60 ${cellBg} p-0`}
        >
          <div className="sticky left-0 flex w-fit items-center gap-2 py-3 pl-8 pr-3">
            <CustomKpiFields
              draft={draft}
              onChange={setDraft}
              onSubmit={() => handleAddCustom(category)}
              onCancel={cancelAdd}
            />
            <Button
              size="sm"
              onClick={() => handleAddCustom(category)}
              disabled={!draft.label.trim() || adding}
            >
              {adding ? 'Adding…' : 'Add'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={cancelAdd}
              disabled={adding}
            >
              Cancel
            </Button>
          </div>
        </TableCell>
      </TableRow>
    ) : (
      <TableRow className={rowHover}>
        <TableCell
          colSpan={colSpan}
          className={`border-t border-dashed border-border/60 ${cellBg} p-0`}
        >
          <button
            type="button"
            onClick={() => startAdd(category)}
            className="sticky left-0 flex w-fit items-center gap-1.5 py-3 pl-8 pr-3 font-sans-neue text-xs leading-6 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add custom KPI
          </button>
        </TableCell>
      </TableRow>
    );
  };

  // One category's rows: header, standard then custom KPI rows (managers get the
  // remove affordance), and — in the authoring views — the add-custom trigger.
  // The three granularities differ only in their columns and category set, so
  // all render through here.
  const renderCategoryRows = (
    categories: string[],
    columns: KpiPeriod[],
    colSpan: number,
  ) =>
    categories.map((category) => {
      const { standard, custom } = visibleCategoryKpis(
        editableByCat.get(category),
        showAllMetrics,
        period,
      );
      const isCollapsed = collapsedCategories.has(category);
      return (
        <React.Fragment key={category}>
          <KpiCategoryHeaderRow
            category={category}
            isCollapsed={isCollapsed}
            colSpan={colSpan}
            onToggle={() => toggleCategory(category)}
          />
          {!isCollapsed && (
            <>
              {standard.map((kpi, idx) => (
                <EditableKpiRow
                  key={kpi.publicId}
                  kpi={kpi}
                  columns={columns}
                  band={idx % 2 === 1}
                  edit={
                    canEditValues
                      ? { companyId, onSaved: refreshKpis }
                      : undefined
                  }
                />
              ))}
              {custom.map((kpi, idx) => (
                <EditableKpiRow
                  key={kpi.publicId}
                  kpi={kpi}
                  columns={columns}
                  band={(standard.length + idx) % 2 === 1}
                  edit={
                    canEditValues
                      ? { companyId, onSaved: refreshKpis }
                      : undefined
                  }
                  onRemove={canManage ? setPendingDelete : undefined}
                />
              ))}
              {canManage &&
                renderAddCustomRow(
                  category,
                  colSpan,
                  (standard.length + custom.length) % 2 === 1,
                )}
            </>
          )}
        </React.Fragment>
      );
    });

  // The picked period falls back to the newest column whenever the current
  // selection isn't in the list — switching granularity replaces every key.
  const gridCurrent =
    periods.find((q) => q.key === gridPeriodKey) ?? periods[0] ?? null;
  // Grid cards for the selected period: any KPI (standard or custom) with a value
  // for that period, rolled up when the period is a quarter or a fiscal year.
  const gridSections = useMemo(() => {
    const map = new Map<string, { kpi: EditableKpi; display: string }[]>();
    if (gridCurrent) {
      for (const kpi of allEditable) {
        const dv = customDisplayValue(
          kpi,
          gridCurrent.year,
          gridCurrent.quarter,
          gridCurrent.month,
        );
        if (!dv || (dv.numeric == null && !dv.text?.trim())) continue;
        const arr = map.get(kpi.category) ?? [];
        arr.push({
          kpi,
          display: formatKpiDisplay(kpi.valueType, dv.numeric, dv.text),
        });
        map.set(kpi.category, arr);
      }
    }
    const order = kpiCategories.filter((c) => map.has(c));
    for (const c of map.keys()) if (!order.includes(c)) order.push(c);
    return order.map((c) => [c, map.get(c)!] as const);
  }, [gridCurrent, allEditable, kpiCategories]);

  return (
    <div className="space-y-5">
      <DeleteCustomKpiDialog
        kpi={pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onDeleted={refreshAll}
      />
      <div className="flex w-full items-center justify-between">
        <div className="font-medium text-sm">Performance</div>
        <div className="flex items-center justify-end gap-2">
          {showControls && (
            <div className="flex items-center rounded-md border p-0.5">
              {(['monthly', 'quarterly', 'annual'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'rounded px-2.5 py-1.5 font-sans-neue text-xs capitalize transition-colors',
                    period === p
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          {view === 'table' && (
            <button
              type="button"
              onClick={() => setShowAllMetrics((prev) => !prev)}
              aria-pressed={showAllMetrics}
              title={
                showAllMetrics
                  ? 'Show only metrics that have data'
                  : 'Show every metric, including those with no data'
              }
              className={cn(
                'rounded-md border px-2.5 py-1.5 font-sans-neue text-xs transition-colors',
                showAllMetrics
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              All metrics
            </button>
          )}
          {view === 'grid' && gridCurrent && (
            <Select value={gridCurrent.key} onValueChange={setGridPeriodKey}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periods.map((q) => (
                  <SelectItem key={q.key} value={q.key}>
                    {q.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {showControls && (
            <div className="flex items-center rounded-md border p-0.5">
              <button
                type="button"
                onClick={() => setView('grid')}
                aria-label="Grid view"
                className={cn(
                  'rounded p-1.5 transition-colors',
                  view === 'grid'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView('table')}
                aria-label="Table view"
                className={cn(
                  'rounded p-1.5 transition-colors',
                  view === 'table'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Table2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      {view === 'grid' ? (
        gridSections.length === 0 ? (
          <SubTabEmpty>
            No values for this period yet. Switch to the quarterly view to enter
            them.
          </SubTabEmpty>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {gridSections.map(([category, entries]) => (
              <div key={category} className="rounded-lg border bg-muted/10 p-4">
                <p className="font-semibold mb-2 font-sans-neue text-xs uppercase tracking-wider text-foreground/75">
                  {category}
                </p>
                <div className="divide-y divide-foreground/10">
                  {entries.map(({ kpi, display }) => (
                    <FieldRow
                      key={kpi.publicId}
                      label={kpi.label}
                      value={display}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : emptyMessage ? (
        <SubTabEmpty>
          {emptyMessage} Choose All metrics to list every metric, including
          those with no data.
        </SubTabEmpty>
      ) : (
        <TableShell scrollX striped={false}>
          <TableHeader className="text-[.9em]">
            <TableRow>
              <TableHead className={STICKY_METRIC_COLUMN}>Metric</TableHead>
              {periods.map((col) => (
                <TableHead
                  key={col.key}
                  className="whitespace-nowrap text-right"
                >
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderCategoryRows(
              renderedCategories,
              periods,
              periods.length + 1,
            )}
          </TableBody>
        </TableShell>
      )}
    </div>
  );
}
