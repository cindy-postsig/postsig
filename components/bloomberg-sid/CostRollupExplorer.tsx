'use client';

import { Fragment, useMemo, useState } from 'react';
import { TABLE_HEADER_CLASS, usd } from '@/components/bloomberg-sid/bits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  SortableHeader,
  type SortDirection,
} from '@/components/ui/sortable-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type {
  SidAccount,
  SidHrMatch,
  SidKey,
  SidSubscription,
} from '@/lib/v2/bloomberg-sid/report';
import { sortBy } from '@/lib/v2/bloomberg-sid/sort';
import {
  costCenterPath,
  countryCityPath,
  hrLevelPath,
  HR_LEVELS,
  rollupCosts,
  type SidAllocation,
  type SidCostPath,
  type SidCostRollupRow,
} from '@/lib/v2/bloomberg-sid/transforms';

type AllocViewId = 'hr' | 'costCenter' | 'country';

interface AllocView {
  id: AllocViewId;
  label: string;
  levels: readonly string[];
  path: SidCostPath;
  hint: string;
}

export function CostRollupExplorer({
  subscriptions,
  accountsByCustNum,
  allocationsBySid,
  hrMatches,
}: {
  subscriptions: SidSubscription[];
  accountsByCustNum: Map<number, SidAccount>;
  allocationsBySid: Map<SidKey, SidAllocation[]>;
  hrMatches: Record<string, SidHrMatch>;
}) {
  const [viewId, setViewId] = useState<AllocViewId>('hr');
  const [groupLevel, setGroupLevel] = useState(0);
  const [filters, setFilters] = useState<Record<number, string>>({});
  const [sort, setSort] = useState<{
    key: keyof SidCostRollupRow | null;
    dir: SortDirection;
  }>({ key: null, dir: 'desc' });

  const views = useMemo<AllocView[]>(
    () => [
      {
        id: 'hr',
        label: 'HR level',
        levels: HR_LEVELS,
        path: hrLevelPath(hrMatches),
        hint: 'Entity › Business Group › Division › Business Unit › Department › Team › User.',
      },
      {
        id: 'costCenter',
        label: 'Cost center',
        levels: ['Cost Center'],
        path: costCenterPath(hrMatches),
        hint: 'a flat list of cost centers (no sub-levels).',
      },
      {
        id: 'country',
        label: 'Country',
        levels: ['Country', 'City'],
        path: countryCityPath,
        hint: 'Country › City.',
      },
    ],
    [hrMatches],
  );

  const view = views.find((candidate) => candidate.id === viewId) ?? views[0];
  const levels = view.levels;

  const filterEntries = useMemo(
    () =>
      Object.entries(filters)
        .map(([index, value]) => [Number(index), value] as const)
        .sort((a, b) => a[0] - b[0]),
    [filters],
  );

  const rows = useMemo(
    () =>
      rollupCosts(
        subscriptions,
        accountsByCustNum,
        allocationsBySid,
        view.path,
        groupLevel,
        filters,
      ),
    [
      subscriptions,
      accountsByCustNum,
      allocationsBySid,
      view,
      groupLevel,
      filters,
    ],
  );

  const sortedRows = useMemo(() => {
    const key = sort.key;
    return key ? sortBy(rows, (row) => row[key], sort.dir) : rows;
  }, [rows, sort]);

  const totals = rows.reduce(
    (acc, row) => ({
      subs: acc.subs + row.subs,
      users: acc.users + row.users,
      baseCost: acc.baseCost + row.baseCost,
      exchangeCost: acc.exchangeCost + row.exchangeCost,
      total: acc.total + row.total,
    }),
    { subs: 0, users: 0, baseCost: 0, exchangeCost: 0, total: 0 },
  );

  const level = levels[groupLevel] ?? levels[0];
  const isLeaf = groupLevel >= levels.length - 1;

  const goToLevel = (index: number) => {
    setGroupLevel(index);
    setFilters((current) => {
      const next: Record<number, string> = {};
      Object.entries(current).forEach(([key, value]) => {
        if (Number(key) < index) next[Number(key)] = value;
      });
      return next;
    });
  };

  const drillInto = (key: string) => {
    setFilters((current) => ({ ...current, [groupLevel]: key }));
    setGroupLevel((current) => Math.min(current + 1, levels.length - 1));
  };

  const clearFilter = (index: number) => {
    setFilters((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
  };

  const toggleSort = (key: keyof SidCostRollupRow) => {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc',
    }));
  };

  const sortHeader = (
    key: keyof SidCostRollupRow,
    label: string,
    align: 'left' | 'right' = 'right',
  ) => (
    <SortableHeader
      label={label}
      align={align}
      direction={sort.key === key ? sort.dir : null}
      onSort={() => {
        toggleSort(key);
      }}
    />
  );

  return (
    <section className="flex flex-col gap-6">
      <h3>Cost Allocations</h3>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
          <ToggleGroup
            type="single"
            variant="segmented"
            size="xs"
            aria-label="View by"
            value={viewId}
            onValueChange={(next) => {
              if (!next) return;
              setViewId(next as AllocViewId);
              setGroupLevel(0);
              setFilters({});
            }}
          >
            {views.map((option) => (
              <ToggleGroupItem
                key={option.id}
                value={option.id}
                className="whitespace-nowrap"
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex flex-wrap items-center gap-1">
            {levels.map((name, index) => (
              <Fragment key={name}>
                {index > 0 && <span className="text-muted-foreground">›</span>}
                <Button
                  type="button"
                  size="xs"
                  variant={index === groupLevel ? 'default' : 'outline'}
                  onClick={() => {
                    goToLevel(index);
                  }}
                >
                  {name}
                </Button>
              </Fragment>
            ))}
          </div>
        </div>

        {filterEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Button
              type="button"
              size="xs"
              variant="link"
              onClick={() => {
                goToLevel(0);
              }}
            >
              All
            </Button>
            {filterEntries.map(([index, value]) => (
              <Fragment key={index}>
                <span>/</span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  title={`Remove ${levels[index]} filter`}
                  onClick={() => {
                    clearFilter(index);
                  }}
                >
                  {levels[index]}: {value}{' '}
                  <span className="text-muted-foreground">×</span>
                </Button>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      <Card>
        <Table stickyHeader className="[&>thead]:bg-card">
          <TableHeader className={TABLE_HEADER_CLASS}>
            <TableRow className="bg-muted/40">
              {sortHeader('key', level, 'left')}
              {sortHeader('users', 'Users')}
              {sortHeader('subs', 'Subs')}
              {sortHeader('baseCost', 'Terminal Cost')}
              {sortHeader('exchangeCost', 'Exch Cost')}
              {sortHeader('total', 'Total Direct')}
              <TableHead className="text-right">% of Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-medium">
                  {isLeaf ? (
                    row.key
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        drillInto(row.key);
                      }}
                      className="text-left underline-offset-2 hover:underline"
                    >
                      {row.key} <span className="text-muted-foreground">›</span>
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-right">{row.users}</TableCell>
                <TableCell className="text-right">{row.subs}</TableCell>
                <TableCell className="text-right font-mono">
                  {usd(row.baseCost)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {row.exchangeCost > 0 ? usd(row.exchangeCost) : '—'}
                </TableCell>
                <TableCell className="font-medium text-right font-mono">
                  {usd(row.total)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {totals.total > 0
                    ? `${((row.total / totals.total) * 100).toFixed(1)}%`
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-medium border-t-2 bg-muted/30">
              <TableCell>TOTAL ({rows.length})</TableCell>
              <TableCell className="text-right">{totals.users}</TableCell>
              <TableCell className="text-right">{totals.subs}</TableCell>
              <TableCell className="text-right font-mono">
                {usd(totals.baseCost)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {usd(totals.exchangeCost)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {usd(totals.total)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {totals.total > 0 ? '100%' : '—'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">
        Drill down through the {view.label.toLowerCase()} hierarchy —{' '}
        {view.hint} Any level in the rail is clickable at any time to regroup;
        click a row to filter and descend, or remove a filter chip in the
        breadcrumb. Costs roll up exactly: every level sums the same underlying
        subscription and pro-rated exchange charges.
      </p>
    </section>
  );
}
