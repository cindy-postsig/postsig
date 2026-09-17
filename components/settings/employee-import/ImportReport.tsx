'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SummaryCard } from '@/components/cards/SummaryCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  ImportChangeType,
  ImportDeltaChange,
} from '@/lib/v2/employee-import/delta';

const FIELD_LABELS: Record<string, string> = {
  entity: 'Entity',
  division: 'Division',
  business_unit: 'Business Unit',
  department: 'Department',
  team: 'Team',
  cost_center: 'Cost Center',
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  employee_id: 'Employee ID',
  region: 'Region',
  country: 'Country',
  start_date: 'Start Date',
  leave_date: 'Leave Date',
  status: 'Status',
};

const TYPE_LABELS: Record<ImportChangeType, string> = {
  joiner: 'Joiner',
  leaver: 'Leaver',
  mover: 'Mover',
  attribute: 'Attribute',
};

const TYPE_BADGE_CLASS: Record<ImportChangeType, string> = {
  joiner:
    'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-0 dark:bg-emerald-200 dark:text-emerald-950',
  leaver:
    'border-red-400 bg-red-50 text-red-700 dark:border-0 dark:bg-red-200 dark:text-red-950',
  mover:
    'border-sky-400 bg-sky-50 text-sky-700 dark:border-0 dark:bg-sky-200 dark:text-sky-950',
  attribute:
    'border-amber-400 bg-amber-100 text-amber-700 dark:border-0 dark:bg-amber-200 dark:text-amber-950',
};

const FILTERS: { value: ImportChangeType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'joiner', label: 'Joiners' },
  { value: 'leaver', label: 'Leavers' },
  { value: 'mover', label: 'Movers' },
  { value: 'attribute', label: 'Attributes' },
];

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function ImportReport({ changes }: { changes: ImportDeltaChange[] }) {
  const [filter, setFilter] = useState<ImportChangeType | 'all'>('all');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const byType = { joiner: 0, leaver: 0, mover: 0, attribute: 0 };
    for (const change of changes) byType[change.type] += 1;
    return byType;
  }, [changes]);

  const netHeadcount = counts.joiner - counts.leaver;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return changes.filter((change) => {
      if (filter !== 'all' && change.type !== filter) return false;
      if (!q) return true;
      return (
        change.name.toLowerCase().includes(q) ||
        (change.employeeRef?.toLowerCase().includes(q) ?? false) ||
        (change.position?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [changes, filter, search]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          title="Joiners"
          value={counts.joiner}
          description="New rows in the file"
        />
        <SummaryCard
          title="Leavers"
          value={counts.leaver}
          description="No longer in the file"
        />
        <SummaryCard
          title="Movers"
          value={counts.mover}
          description="Changed HR position"
        />
        <SummaryCard
          title="Attribute changes"
          value={counts.attribute}
          description="Name, dates, status…"
        />
        <SummaryCard
          title="Net headcount"
          value={
            <span
              className={
                netHeadcount > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : netHeadcount < 0
                    ? 'text-red-600 dark:text-red-400'
                    : undefined
              }
            >
              {netHeadcount > 0 ? `+${netHeadcount}` : netHeadcount}
            </span>
          }
          description="Joiners minus leavers"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(({ value, label }) => {
            const count =
              value === 'all'
                ? changes.length
                : counts[value as ImportChangeType];
            return (
              <Button
                key={value}
                variant={filter === value ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilter(value)}
              >
                {label} {count}
              </Button>
            );
          })}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, ID, team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-10 text-sm"
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Change</TableHead>
            <TableHead>HR position (new file)</TableHead>
            <TableHead>What changed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                {changes.length === 0
                  ? 'This import changed nothing.'
                  : 'No changes match the current filter.'}
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((change, i) => (
              <TableRow key={i}>
                <TableCell className="align-top">
                  <p className="font-medium">{change.name}</p>
                  {change.employeeRef && (
                    <p className="text-xs text-muted-foreground">
                      {change.employeeRef}
                    </p>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <Badge
                    variant="outline"
                    size="sm"
                    className={TYPE_BADGE_CLASS[change.type]}
                  >
                    {TYPE_LABELS[change.type]}
                  </Badge>
                </TableCell>
                <TableCell className="align-top text-sm">
                  {change.type === 'leaver' && change.position
                    ? `Was: ${change.position}`
                    : (change.position ?? '—')}
                </TableCell>
                <TableCell className="align-top text-sm">
                  {change.type === 'joiner' && (
                    <span className="text-muted-foreground">
                      New in this file
                    </span>
                  )}
                  {change.type === 'leaver' && (
                    <span className="text-muted-foreground">
                      Dropped from this file
                    </span>
                  )}
                  {change.fields.length > 0 && (
                    <dl className="space-y-1">
                      {change.fields.map((f) => (
                        <div key={f.field} className="flex flex-wrap gap-x-2">
                          <dt className="w-28 shrink-0 text-muted-foreground">
                            {fieldLabel(f.field)}
                          </dt>
                          <dd className="flex flex-wrap items-center gap-x-1.5">
                            <span className="text-muted-foreground line-through">
                              {f.from ?? '—'}
                            </span>
                            <span aria-hidden>→</span>
                            <span>{f.to ?? '—'}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
