'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  ChevronDown,
  Pencil,
  FileText,
  RefreshCcw,
  UserPlus,
  UserMinus,
} from 'lucide-react';

import { InvestorActivityType } from '@/constants/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import ExportTableCSVButton from '@/components/contracts/ExportTableCSVButton';
import { useToast } from '@/components/ui/use-toast';
import { revertOverride } from '@/app/lib/actions/investor/overrides';
import {
  getEditableField,
  findFieldOption,
  getAffectedMetrics,
} from '@/lib/v2/inv/overrides/registry';
import type { ActivityFeedItem } from '@/lib/v2/inv/activities';
import type { OverrideHistoryRow } from '@/app/lib/investor/droid-client';
import { TabHeader } from './companyDetailsPrimitives';
import { useCanEditInvestor } from '@/hooks/useCanEditInvestor';
import { useDateFormat } from '@/hooks/useDateFormat';
import { formatDateTime } from '@/lib/date-format';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METRIC_LABELS: Record<string, string> = {
  my_fmv: 'My FMV',
  moic: 'MOIC',
};

const METRIC_FORMULAS: Record<string, string> = {
  my_fmv: 'My FMV = My FD% × Post-Money Valuation',
  moic: 'MOIC = (My FMV + Realized Proceeds) ÷ Aggregate Cost',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// The date part follows the viewer's effective pattern; time and zone are
// appended. An unparseable timestamp falls back to the raw string.
function formatDate(isoDate: string, pattern: string): string {
  return formatDateTime(isoDate, pattern, isoDate);
}

function formatActivityDescription(activityType: string): string {
  switch (activityType) {
    case InvestorActivityType.DOCUMENT_UPLOADED:
      return 'Uploaded document';
    case InvestorActivityType.DOCUMENT_PROCESSED:
      return 'Document processed';
    case InvestorActivityType.DOCUMENT_CREATED:
      return 'Document created';
    case InvestorActivityType.EXTRACTION_COMPLETED:
      return 'Extraction completed';
    case InvestorActivityType.EXTRACTION_FAILED:
      return 'Extraction failed';
    case InvestorActivityType.COMPANY_CREATED:
      return 'Company created';
    case InvestorActivityType.ENTITY_LINKED:
      return 'Entity linked';
    case InvestorActivityType.BOARD_SEAT_ADDED:
      return 'Added board member';
    case InvestorActivityType.BOARD_SEAT_REMOVED:
      return 'Removed board member';
    case InvestorActivityType.INVESTOR_STATUS_RECORD_CREATED:
      return 'Created investor status';
    default:
      return activityType;
  }
}

function getActivityDetailText(
  activityType: string,
  data: Record<string, unknown>,
): string {
  if (
    activityType === InvestorActivityType.DOCUMENT_UPLOADED &&
    typeof data.fileName === 'string'
  ) {
    return `Uploaded document: ${data.fileName}`;
  }
  if (
    activityType === InvestorActivityType.BOARD_SEAT_ADDED &&
    typeof data.holderName === 'string'
  ) {
    return `Added board member: ${data.holderName}`;
  }
  if (
    activityType === InvestorActivityType.BOARD_SEAT_REMOVED &&
    typeof data.holderName === 'string'
  ) {
    return `Removed board member: ${data.holderName}`;
  }
  if (
    activityType === InvestorActivityType.INVESTOR_STATUS_RECORD_CREATED &&
    Array.isArray(data.changes)
  ) {
    const labels = (
      data.changes as Array<{ entityType?: unknown; fieldKey?: unknown }>
    )
      .filter(
        (c): c is { entityType: string; fieldKey: string } =>
          typeof c.entityType === 'string' && typeof c.fieldKey === 'string',
      )
      .map((c) => getFieldLabel(c.entityType, c.fieldKey));
    return labels.length
      ? `Created investor status: ${labels.join(', ')}`
      : 'Created investor status';
  }
  return formatActivityDescription(activityType);
}

function getFieldLabel(entityType: string, fieldKey: string): string {
  const def = getEditableField(entityType, fieldKey);
  return def?.label ?? fieldKey;
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    return value.toLocaleString('en-US');
  }
  return String(value);
}

/** Human-readable label for a raw `seat_type` value in the audit log. */
const SEAT_TYPE_LABELS: Record<string, string> = {
  investor_designated: 'Investor Director',
  common_designated: 'Common Director',
  independent: 'Independent Director',
  observer: 'Observer',
  executive: 'Executive',
};

function formatSeatType(value: unknown): string {
  if (typeof value !== 'string' || value === '') return '—';
  return SEAT_TYPE_LABELS[value] ?? value;
}

/**
 * Label for a value of a fixed-choice field, so an audit row reads
 * "Broad-Based Weighted Average" and "Senior" rather than the stored
 * `broad_based` / `1`. Null when the field has no option list, letting the
 * caller fall through to its other formatters.
 */
function formatOptionValue(
  entityType: string,
  fieldKey: string,
  value: unknown,
): string | null {
  const def = getEditableField(entityType, fieldKey);
  if (!def?.options) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  return findFieldOption(def, value)?.label ?? null;
}

/**
 * Group consecutive override items by user + timestamp proximity (within 5s)
 * into logical "Made N changes" groups.
 */
function groupOverrides(
  items: ActivityFeedItem[],
): Array<
  { kind: 'override-group'; items: OverrideGroupItem[] } | ActivityFeedItem
> {
  const result: Array<
    { kind: 'override-group'; items: OverrideGroupItem[] } | ActivityFeedItem
  > = [];

  let currentGroup: OverrideGroupItem[] = [];
  let groupUser: string | undefined;
  let groupTime: number | undefined;

  function flushGroup() {
    if (currentGroup.length > 0) {
      result.push({ kind: 'override-group', items: [...currentGroup] });
      currentGroup = [];
    }
    groupUser = undefined;
    groupTime = undefined;
  }

  for (const item of items) {
    if (item.kind !== 'override') {
      flushGroup();
      result.push(item);
      continue;
    }

    const itemTime = Date.parse(item.data.created_at);
    const itemUser = item.data.created_by;

    if (
      groupUser === itemUser &&
      groupTime !== undefined &&
      Math.abs(itemTime - groupTime) < 5000
    ) {
      currentGroup.push(item);
    } else {
      flushGroup();
      currentGroup.push(item);
      groupUser = itemUser;
      groupTime = itemTime;
    }
  }
  flushGroup();

  return result;
}

interface OverrideGroupItem {
  kind: 'override';
  data: OverrideHistoryRow;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OverrideGroupRow({
  items,
  fundMap,
  seatKindMap,
}: {
  items: OverrideGroupItem[];
  fundMap?: Record<number, string>;
  seatKindMap?: Record<number, 'director' | 'observer'>;
}) {
  const [expanded, setExpanded] = useState(false);
  const { dateFormat } = useDateFormat();
  const firstItem = items[0];
  const userName = firstItem.data.created_by_name || 'System';
  const date = formatDate(firstItem.data.created_at, dateFormat);
  const changeCount = items.length;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="text-sm text-muted-foreground">{date}</TableCell>
        <TableCell className="font-medium">{userName}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-muted-foreground" />
            <span>
              Made{' '}
              <strong>
                {changeCount} change{changeCount > 1 ? 's' : ''}
              </strong>
            </span>
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={3} className="p-0">
            <ExpandedOverrideDetails
              items={items}
              fundMap={fundMap}
              seatKindMap={seatKindMap}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ExpandedOverrideDetails({
  items,
  fundMap,
  seatKindMap,
}: {
  items: OverrideGroupItem[];
  fundMap?: Record<number, string>;
  seatKindMap?: Record<number, 'director' | 'observer'>;
}) {
  const canRevert = useCanEditInvestor();

  return (
    <div className="bg-muted/30 px-6 py-3">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border/50">
            <TableHead className="font-medium text-xs text-muted-foreground">
              Field
            </TableHead>
            <TableHead className="font-medium text-xs text-muted-foreground">
              Original
            </TableHead>
            <TableHead className="font-medium text-xs text-muted-foreground">
              Edit
            </TableHead>
            <TableHead className="font-medium text-xs text-muted-foreground">
              Justification
            </TableHead>
            <TableHead className="w-[80px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <OverrideDetailRow
              key={item.data.id}
              item={item}
              canRevert={canRevert}
              fundMap={fundMap}
              seatKindMap={seatKindMap}
            />
          ))}
        </TableBody>
      </Table>
      <DownstreamImpact items={items} />
    </div>
  );
}

function OverrideDetailRow({
  item,
  canRevert,
  fundMap,
  seatKindMap,
}: {
  item: OverrideGroupItem;
  canRevert: boolean;
  fundMap?: Record<number, string>;
  seatKindMap?: Record<number, 'director' | 'observer'>;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const { data } = item;
  const isReverted = data.reverted_at !== null;
  const fieldLabel = getFieldLabel(data.entity_type, data.field_key);

  // Resolve fund IDs to names for board seat fund field
  const isFundField =
    data.entity_type === 'inv_board_seat' &&
    data.field_key === 'designating_fund_id';
  const isTitleField =
    data.entity_type === 'inv_board_seat' && data.field_key === 'holder_title';
  const isTypeField =
    data.entity_type === 'inv_board_seat' && data.field_key === 'seat_type';
  const seatKind = seatKindMap?.[data.entity_id];
  const formatValue = (value: unknown) => {
    if (isFundField && fundMap && typeof value === 'number') {
      return fundMap[value] ?? formatFieldValue(value);
    }
    if (isTypeField) {
      return formatSeatType(value);
    }
    const optionLabel = formatOptionValue(
      data.entity_type,
      data.field_key,
      value,
    );
    if (optionLabel !== null) return optionLabel;
    if (
      isTitleField &&
      (value === '' || value === null || value === undefined)
    ) {
      return seatKind === 'observer' ? 'Observer' : 'Director';
    }
    if (value === '') return '—';
    return formatFieldValue(value);
  };

  function handleRevert() {
    startTransition(async () => {
      const result = await revertOverride(data.id, data.entity_id);
      if ('success' in result) {
        router.refresh();
      } else {
        toast({
          variant: 'destructive',
          title: 'Revert failed',
          description: result.error,
        });
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium text-sm">{fieldLabel}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatValue(data.original_value)}
      </TableCell>
      <TableCell className="text-sm">
        {formatValue(data.override_value)}
      </TableCell>
      <TableCell className="text-sm italic text-muted-foreground">
        {data.reason ? `"${data.reason}"` : '—'}
      </TableCell>
      <TableCell>
        {isReverted ? (
          <Badge variant="secondary" className="text-xs">
            Reverted
          </Badge>
        ) : (
          canRevert && (
            <Button
              variant="ghost"
              size="xs"
              onClick={handleRevert}
              disabled={isPending}
              className="text-xs"
            >
              <RefreshCcw className="mr-1 h-3 w-3" />
              Revert
            </Button>
          )
        )}
      </TableCell>
    </TableRow>
  );
}

function DownstreamImpact({ items }: { items: OverrideGroupItem[] }) {
  const allAffected = new Set<string>();
  for (const item of items) {
    const metrics = getAffectedMetrics(
      item.data.entity_type,
      item.data.field_key,
    );
    metrics.forEach((m) => allAffected.add(m));
  }

  if (allAffected.size === 0) return null;

  const metricEntries = [...allAffected].map((key) => ({
    key,
    label: METRIC_LABELS[key] ?? key,
    formula: METRIC_FORMULAS[key],
  }));

  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">Affects: </span>
        {metricEntries.map((m, i) => (
          <span key={m.key}>
            <strong>{m.label}</strong>
            {m.formula && (
              <span className="text-muted-foreground/70"> ({m.formula})</span>
            )}
            {i < metricEntries.length - 1 && ', '}
          </span>
        ))}
      </p>
    </div>
  );
}

function ActivityRow({
  item,
}: {
  item: ActivityFeedItem & { kind: 'activity' };
}) {
  const { data } = item;
  const { dateFormat } = useDateFormat();
  const activityIcon =
    data.activity_type === InvestorActivityType.BOARD_SEAT_ADDED ? (
      <UserPlus className="h-4 w-4 text-muted-foreground" />
    ) : data.activity_type === InvestorActivityType.BOARD_SEAT_REMOVED ? (
      <UserMinus className="h-4 w-4 text-muted-foreground" />
    ) : data.activity_type ===
      InvestorActivityType.INVESTOR_STATUS_RECORD_CREATED ? (
      <Pencil className="h-4 w-4 text-muted-foreground" />
    ) : (
      <FileText className="h-4 w-4 text-muted-foreground" />
    );
  return (
    <TableRow>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(data.created_at, dateFormat)}
      </TableCell>
      <TableCell className="font-medium">
        {data.user_name ?? 'System'}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {activityIcon}
          <span>
            {getActivityDetailText(data.activity_type, data.activity_data)}
          </span>
        </div>
        {typeof data.activity_data.reason === 'string' &&
          data.activity_data.reason.trim() && (
            <p className="mt-0.5 pl-6 text-xs italic text-muted-foreground">
              “{data.activity_data.reason.trim()}”
            </p>
          )}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ActivityContentProps {
  feed: ActivityFeedItem[];
  fundMap?: Record<number, string>;
  seatKindMap?: Record<number, 'director' | 'observer'>;
}

export function ActivityContent({
  feed,
  fundMap,
  seatKindMap,
}: ActivityContentProps) {
  const { dateFormat } = useDateFormat();
  const grouped = groupOverrides(feed);

  const csvData = feed
    .filter(
      (item): item is ActivityFeedItem & { kind: 'override' } =>
        item.kind === 'override',
    )
    .map((item) => {
      const isFund =
        item.data.entity_type === 'inv_board_seat' &&
        item.data.field_key === 'designating_fund_id';
      const isTitle =
        item.data.entity_type === 'inv_board_seat' &&
        item.data.field_key === 'holder_title';
      const isType =
        item.data.entity_type === 'inv_board_seat' &&
        item.data.field_key === 'seat_type';
      const seatKind = seatKindMap?.[item.data.entity_id];
      const resolveValue = (v: unknown) => {
        if (isFund && fundMap && typeof v === 'number') {
          return fundMap[v] ?? formatFieldValue(v);
        }
        if (isType) {
          return formatSeatType(v);
        }
        const optionLabel = formatOptionValue(
          item.data.entity_type,
          item.data.field_key,
          v,
        );
        if (optionLabel !== null) return optionLabel;
        if (isTitle && (v === '' || v === null || v === undefined)) {
          return seatKind === 'observer' ? 'Observer' : 'Director';
        }
        if (v === '') return '—';
        return formatFieldValue(v);
      };
      return {
        date: formatDate(item.data.created_at, dateFormat),
        user: item.data.created_by_name || 'System',
        field: getFieldLabel(item.data.entity_type, item.data.field_key),
        original: resolveValue(item.data.original_value),
        edit: resolveValue(item.data.override_value),
        justification: item.data.reason || '',
        status: item.data.reverted_at ? 'Reverted' : 'Active',
      };
    });

  return (
    <div className="space-y-6">
      <TabHeader
        title="Audit Log"
        action={
          <ExportTableCSVButton
            data={csvData}
            headers={[
              { key: 'date', label: 'Date' },
              { key: 'user', label: 'User' },
              { key: 'field', label: 'Field' },
              { key: 'original', label: 'Original' },
              { key: 'edit', label: 'Edit' },
              { key: 'justification', label: 'Justification' },
              { key: 'status', label: 'Status' },
            ]}
            filename="audit_log.csv"
            buttonText="Export Log"
            variant="outline"
            size="sm"
            disabled={csvData.length === 0}
          />
        }
      />

      {grouped.length !== 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Date</TableHead>
              <TableHead className="w-[160px]">User</TableHead>
              <TableHead>Activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grouped.map((entry, idx) => {
              if ('kind' in entry && entry.kind === 'override-group') {
                const groupKey = `group-${entry.items[0].data.id}`;
                return (
                  <OverrideGroupRow
                    key={groupKey}
                    items={entry.items}
                    fundMap={fundMap}
                    seatKindMap={seatKindMap}
                  />
                );
              }
              const item = entry as ActivityFeedItem;
              if (item.kind === 'activity') {
                return (
                  <ActivityRow key={`activity-${item.data.id}`} item={item} />
                );
              }
              // Standalone override that didn't group (shouldn't happen, but handle gracefully)
              return (
                <OverrideGroupRow
                  key={`override-${item.data.id}`}
                  items={[item]}
                  fundMap={fundMap}
                  seatKindMap={seatKindMap}
                />
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No activity recorded yet.
        </div>
      )}
    </div>
  );
}
