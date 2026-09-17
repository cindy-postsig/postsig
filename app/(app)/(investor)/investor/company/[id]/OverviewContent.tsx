'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import {
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Json } from '@/database.types';
import type { PortfolioCompany, CapTableSnapshot } from '../../types';
import type { InvPortfolioCompanyResult } from '@/lib/v2/inv';
import type { AppliedOverrideMeta } from '@/lib/v2/inv/overrides/applyOverrides';
import {
  EditableValue,
  fractionToPercentDisplay,
} from '@/components/investor/EditableValue';
import {
  OverridableValue,
  OverrideBadge,
  RecomputedMarker,
} from '@/components/investor/OverrideBadge';
import { ComputedMetricPanel } from '@/components/investor/ComputedMetricPanel';
import { getEditableField } from '@/lib/v2/inv/overrides/registry';
import { getStageColor } from '@/app/(app)/(investor)/investor/colors';
import { TableShell } from '@/app/(app)/(investor)/investor/components/TableShell';
import { cn } from '@/lib/utils';
import { formatPricePerShare } from '@/app/lib/utils';
import {
  formatAntiDilution,
  formatBool,
  formatCompactUSD,
  formatCount,
} from './companyDetailsFormat';
import {
  BooleanDot,
  FieldRow,
  Section,
  BareMetric,
  MetricRow,
} from './companyDetailsPrimitives';
import { useCanEditInvestor } from '@/hooks/useCanEditInvestor';
import { useDateFormat } from '@/hooks/useDateFormat';
import { BoardEditableSection } from './BoardEditableSection';
import { InvestorStatusEditableSection } from './InvestorStatusEditableSection';
import type { InvestorStatusOverrideContext } from '@/lib/v2/inv';

type CompanyOverrides = InvPortfolioCompanyResult['overrides'];

/** Value editing is disabled in production. Mirrors the gate in EditableValue. */
const EDITING_DISABLED = process.env.VERCEL_ENV === 'production';

// Override tooltips store raw values (signed amounts, fractional percents);
// these render them the way their cell does, so the diff reads consistently.
// Stored override values are always numeric/date strings (the field rule
// guarantees it), but the meta type is Json — coerce defensively.
const toNumber = (v: Json): number =>
  typeof v === 'number' ? v : Number(v as string);
/** Amount is stored signed; the cell shows its magnitude as compact USD. */
const formatOverrideUSD = (v: Json): string =>
  formatCompactUSD(Math.abs(toNumber(v)));
/** our_fd_ownership_percent is stored as a 0–1 fraction; shown as a percent. */
const formatOverridePercent = (v: Json): string =>
  `${fractionToPercentDisplay(toNumber(v))}%`;
/** share_price cell shows PPS with 4 decimals, e.g. $x.xxxx. */
const formatOverridePrice = (v: Json): string =>
  formatPricePerShare(toNumber(v));
/** units cell shows a thousands-separated count (parens for negatives). */
const formatOverrideUnits = (v: Json): string => {
  const n = toNumber(v);
  return n < 0 ? `(${Math.abs(n).toLocaleString()})` : n.toLocaleString();
};
const formatOverrideText = (v: Json): string => String(v);

function humanizeSlug(value: string | null | undefined): string {
  if (!value) return '-';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(value)) return value;
  return value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * A Company Details cell wired for inline editing.
 */
function CompanyDetailValue({
  fieldKey,
  entityId,
  rawValue,
  meta,
  onChanged,
  triggerMode,
  children,
}: {
  fieldKey: string;
  entityId: number;
  rawValue: string | number | null;
  meta: AppliedOverrideMeta | undefined;
  onChanged: () => void;
  triggerMode?: 'value' | 'icon';
  children: React.ReactNode;
}) {
  const fieldDef = getEditableField('inv_company', fieldKey);
  if (!fieldDef) return <>{children}</>;
  return (
    <OverridableValue
      meta={meta}
      label={fieldDef.label}
      formatValue={formatOverrideText}
      align="end"
      onReverted={onChanged}
    >
      <EditableValue
        fieldDef={fieldDef}
        entityId={entityId}
        currentRawValue={rawValue}
        onSaved={onChanged}
        triggerMode={triggerMode}
      >
        {children}
      </EditableValue>
    </OverridableValue>
  );
}

function getBoardInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

function DrillDownMetric({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  const canEdit = useCanEditInvestor();
  if (EDITING_DISABLED || !canEdit) return <>{children}</>;
  return (
    <button
      type="button"
      className="group text-left"
      onClick={onClick}
      title="Click to edit inputs"
    >
      {children}
    </button>
  );
}

function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    if (expanded) return;
    const el = ref.current;
    if (el) setIsClamped(el.scrollHeight > el.clientHeight);
  }, [text, expanded]);

  return (
    <div className="relative max-w-6xl">
      <p
        ref={ref}
        className={cn(
          'text-sm text-foreground/80',
          !expanded && 'line-clamp-5',
        )}
      >
        {text}
      </p>
      {isClamped && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="absolute bottom-0 right-0 bg-background pl-6 text-sm text-muted-foreground hover:underline"
        >
          <span className="pointer-events-none absolute right-full top-0 h-full w-8 bg-gradient-to-l from-background" />
          Show more
        </button>
      )}
      {expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-sm text-muted-foreground hover:underline"
        >
          Show less
        </button>
      )}
    </div>
  );
}

export function OverviewContent({
  company,
  overrides,
  investorStatus,
}: {
  company: PortfolioCompany;
  overrides?: CompanyOverrides;
  /**
   * Investor Status edit context from the unfiltered company. Passed
   * independently of `overrides` so the section stays editable in
   * round-filtered views (these rows are company-level, not round snapshots).
   */
  investorStatus?: InvestorStatusOverrideContext;
}) {
  const transactions = company.transactions;

  const postMoneyValuation = company.postMoneyValuation;
  const totalEquityFinancing = company.totalEquityFinancing;
  const currentPricePerUnit = company.currentPricePerUnit;
  const lastTransactionDate = company.lastTransactionDate;

  const aboutDescription =
    company.description || company.enrichment?.description;
  const { formatDate } = useDateFormat();

  const myAggregateCost = company.myAggregateCost;
  const impliedValue = company.impliedValue;
  const multiple = company.multiple;
  const myFullyDilutedPercent = company.myFullyDilutedPercent;

  const [metricPanel, setMetricPanel] = useState<string | null>(null);

  // The server action revalidates on write; refresh so this client subtree
  // repaints from the new RSC payload, matching every other editable section.
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  const txOverrides = overrides?.transactions ?? {};
  const valOverrides = overrides?.valuation ?? { fields: {}, recomputed: [] };
  const companyDetailsOverrides = overrides?.companyDetails ?? {};
  const snapshotId = overrides?.latestSnapshotId ?? null;
  // Same lineage the Legal Terms tab badges from, so a field edited there is
  // marked as edited wherever the Overview mirrors it.
  const legalTermsOverrides = overrides?.legalTerms;
  const snapshotValues: Record<string, number | string> = {
    implied_valuation: postMoneyValuation,
    share_price: currentPricePerUnit,
    our_fd_ownership_percent: (myFullyDilutedPercent ?? 0) / 100,
  };
  // My FMV and MOIC are computed; they carry no direct override but are flagged
  // in `recomputed` when an underlying input was edited (myFmv / multiple).
  const fmvRecomputed = valOverrides.recomputed.includes('myFmv');
  const moicRecomputed = valOverrides.recomputed.includes('multiple');

  // Editable Post-Money node for the header metric — mirrors the Company
  // Valuation table cell so both edit the same implied_valuation override and
  // stay in sync after revalidation. Falls back to plain text when not editable.
  const impliedValuationDef = getEditableField(
    'inv_cap_table_snapshot',
    'implied_valuation',
  );
  const postMoneyValueContent =
    snapshotId != null && impliedValuationDef ? (
      <OverridableValue
        meta={valOverrides.fields.postMoneyValuation}
        label={impliedValuationDef.label}
        align="end"
        formatValue={formatOverrideUSD}
        onReverted={refresh}
      >
        <EditableValue
          fieldDef={impliedValuationDef}
          entityId={snapshotId}
          currentRawValue={postMoneyValuation}
          onSaved={refresh}
        >
          {formatCompactUSD(postMoneyValuation)}
        </EditableValue>
      </OverridableValue>
    ) : undefined;

  // Editable My FD% node for the header metric. our_fd_ownership_percent is
  // stored as a fraction (0–1); the card displays it as a percent. Edits the
  // FRACTION (currentRawValue from snapshotValues, matching the MOIC panel) so
  // both edit sites write the same unit; only the displayed children show %.
  const fdPercentDef = getEditableField(
    'inv_cap_table_snapshot',
    'our_fd_ownership_percent',
  );
  const fdPercentDisplay =
    myFullyDilutedPercent == null || myFullyDilutedPercent === 0
      ? '-'
      : `${myFullyDilutedPercent.toFixed(1)}%`;
  const fdPercentValueContent =
    snapshotId != null && fdPercentDef ? (
      <OverridableValue
        meta={valOverrides.fields.myFdPct}
        label={fdPercentDef.label}
        align="end"
        formatValue={formatOverridePercent}
        onReverted={refresh}
      >
        <EditableValue
          fieldDef={fdPercentDef}
          entityId={snapshotId}
          currentRawValue={snapshotValues.our_fd_ownership_percent}
          onSaved={refresh}
        >
          {fdPercentDisplay}
        </EditableValue>
      </OverridableValue>
    ) : undefined;

  const rawIndustry = company.industry || company.enrichment?.industry || null;
  const rawHeadquarters =
    company.headquarters || company.enrichment?.headquarters || null;
  const rawJurisdiction =
    company.corporateJurisdiction ||
    company.enrichment?.corporateJurisdiction ||
    null;
  const rawFoundedYear =
    company.foundedYear || company.enrichment?.foundedYear || null;
  const rawDomain =
    company.domain ??
    (company.companyUrl
      ? company.companyUrl.replace(/^https?:\/\//, '')
      : null);
  const websiteDisplay = company.companyUrl
    ? company.companyUrl.replace(/^https?:\/\//, '')
    : '-';

  const websiteLinkValue = company.companyUrl ? (
    <a
      href={company.companyUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      {websiteDisplay}
      <ExternalLink className="h-3 w-3" />
    </a>
  ) : (
    '-'
  );

  const isMajorInvestor =
    company.legalTerms?.headerStatus.majorInvestorStatus ?? false;
  const hasInformationRights =
    company.legalTerms?.headerStatus.informationRights ?? false;
  const hasProRataRights =
    company.legalTerms?.otherLegalTerms.proRataRightsForMajorInvestors ?? false;
  const hasBoardSeat = company.boardOfDirectors.some(
    (m) => m.fund === company.fund && !m.role,
  );

  const antiDilutionType =
    company.legalTerms?.economicRights.antiDilutionRights ?? null;
  const liquidationPreference =
    company.legalTerms?.economicRights.liquidationPreferenceSeniority?.join(
      ', ',
    ) || null;
  const isQsbsQualified =
    company.legalTerms?.qsbs.qualifiedSmallBusinessRepMade ?? null;

  const hasInvestorData = !!company.legalTerms;
  const hasEconomicRightsData = !!company.legalTerms;

  // Prefer the server override context (post-override values, source ids for
  // editing, badge metadata), passed independently of the round filter so the
  // section stays editable in round-filtered views. It's empty until the
  // lineage refetch resolves — fall back to the legalTerms-derived values so
  // the section still renders correctly (read-only in that state).
  const rawStatusContext = investorStatus;
  const hasRealStatusContext =
    rawStatusContext != null &&
    (rawStatusContext.informationRightsId != null ||
      rawStatusContext.roundTermsId != null ||
      rawStatusContext.createTarget != null);
  const investorStatusContext: InvestorStatusOverrideContext =
    hasRealStatusContext
      ? rawStatusContext
      : {
          informationRightsId: null,
          roundTermsId: null,
          createTarget: null,
          values: {
            isMajorInvestor,
            infoRightsForMajor: false,
            infoRightsForAll: hasInformationRights,
            proRataRightsMajor: hasProRataRights,
            proRataRightsAll: false,
          },
          overridden: {},
        };

  const boardEntries = [
    ...company.boardOfDirectors.map((member) => ({
      id: member.id,
      name: member.name,
      title: member.role ?? null,
      kind: 'director' as const,
      fund: member.fund,
      designatingFundId: member.designatingFundId,
      isLead: member.isLead,
      seatType: member.seatType,
      overridden: member.overridden,
    })),
    ...company.boardObservers.map((observer) => ({
      id: observer.id,
      name: observer.name,
      title: observer.role ?? null,
      kind: 'observer' as const,
      fund: observer.fund,
      designatingFundId: observer.designatingFundId,
      isLead: false,
      seatType: observer.seatType,
      overridden: observer.overridden,
    })),
  ];

  const fmvChartData = useMemo(() => {
    const rounds = company.financingRounds;
    const snapshots = company.capTable?.snapshots;
    if (!rounds?.length || !snapshots?.length) return [];

    const snapshotByRound = new Map<number, CapTableSnapshot>();
    for (const s of snapshots) {
      if (s.financingRoundId != null) {
        snapshotByRound.set(s.financingRoundId, s);
      }
    }

    return rounds.reduce<
      { fmv: number; stage: string; label: string; fmvLabel: string }[]
    >(
      (acc, round) => {
        const snapshot = snapshotByRound.get(round.id);
        if (!snapshot) return acc;
        const existingIdx = acc.findIndex((d) => d.stage === round.stageName);
        if (existingIdx !== -1) {
          acc.splice(existingIdx, 1);
        }
        const ourShares = snapshot.ourTotalShares ?? 0;
        const pricePerShare = snapshot.sharePrice ?? 0;
        const fmv = ourShares * pricePerShare;
        const d = new Date(round.date);
        const month = d.toLocaleDateString('en-US', { month: 'short' });
        const year = d.getFullYear().toString().slice(-2);
        return [
          ...acc,
          {
            fmv,
            stage: round.stageName,
            label: `${month} '${year}`,
            fmvLabel: formatCompactUSD(fmv),
          },
        ];
      },
      [] as { fmv: number; stage: string; label: string; fmvLabel: string }[],
    );
  }, [company.financingRounds, company.capTable?.snapshots]);

  return (
    <div className="space-y-16 pb-12">
      {/* My Investment Performance Cards - Primary Focus */}
      <MetricRow columns={5} className="pt-8">
        <DrillDownMetric onClick={() => setMetricPanel('my_fmv')}>
          <BareMetric
            title="My FMV"
            value={formatCompactUSD(impliedValue)}
            valueContent={
              fmvRecomputed ? (
                <RecomputedMarker>
                  {formatCompactUSD(impliedValue)}
                </RecomputedMarker>
              ) : undefined
            }
            editable
            tooltip={{
              title: 'My FMV',
              description:
                'Fair market value of your holdings: My FD% × Post-Money Valuation. Click to edit its inputs.',
            }}
          />
        </DrillDownMetric>
        <DrillDownMetric onClick={() => setMetricPanel('moic')}>
          <BareMetric
            title="MOIC"
            value={
              multiple == null || multiple === 0
                ? '-'
                : `${multiple.toFixed(1)}x`
            }
            valueContent={
              moicRecomputed ? (
                <RecomputedMarker>
                  {multiple == null || multiple === 0
                    ? '-'
                    : `${multiple.toFixed(1)}x`}
                </RecomputedMarker>
              ) : undefined
            }
            editable
            tooltip={{
              title: 'MOIC',
              description:
                'Multiple on invested capital: (My FMV + Realized Proceeds) ÷ Aggregate Cost. Click to edit its inputs.',
            }}
          />
        </DrillDownMetric>
        {/* Aggregate Cost is transaction-derived; its inputs are edited inline
            in the transactions table, so the card is read-only (no drill-down). */}
        <BareMetric
          title="Aggregate Cost"
          value={formatCompactUSD(myAggregateCost)}
          tooltip={{
            title: 'Aggregate Cost',
            description:
              'Total amount invested across all transactions for you',
          }}
        />
        <BareMetric
          title="My FD%"
          value={fdPercentDisplay}
          valueContent={fdPercentValueContent}
          tooltip={{
            title: 'My Fully Diluted %',
            description: 'Your ownership percentage on a fully diluted basis',
          }}
        />
        <BareMetric
          title="Post-Money"
          value={formatCompactUSD(postMoneyValuation)}
          valueContent={postMoneyValueContent}
          tooltip={{
            title: 'Post-Money Valuation',
            description:
              'Company valuation after the most recent financing round',
          }}
        />
      </MetricRow>

      <ComputedMetricPanel
        metricKey={metricPanel ?? ''}
        metricLabel={metricPanel === 'my_fmv' ? 'My FMV' : 'MOIC'}
        open={metricPanel !== null}
        onOpenChange={(o) => !o && setMetricPanel(null)}
        snapshotId={snapshotId}
        currentValues={snapshotValues}
        valuationOverrides={valOverrides}
        onSaved={() => {
          setMetricPanel(null);
          refresh();
        }}
      />

      {/* FMV Timeline Chart */}
      {fmvChartData.length > 0 && (
        <div className="flex h-80 flex-col rounded border p-4">
          <span className="font-medium font-sans-neue text-sm uppercase tracking-wider">
            FMV
          </span>
          <div className="min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={fmvChartData}
                margin={{ top: 70, right: 56, left: 56, bottom: 10 }}
              >
                <defs>
                  <linearGradient id="fmvGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="100%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{
                    stroke: 'hsl(var(--muted-foreground))',
                    strokeOpacity: 0.3,
                  }}
                  tick={{ fontSize: 11 }}
                  tickMargin={12}
                  className="fill-muted-foreground font-label"
                  interval={0}
                />
                <YAxis hide domain={['dataMin - 100000', 'dataMax + 100000']} />
                <Area
                  type="monotone"
                  dataKey="fmv"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#fmvGradient)"
                  // A one-point area has zero path length and renders nothing,
                  // so the lone round needs a dot to be visible at all.
                  dot={
                    fmvChartData.length === 1
                      ? { r: 4, fill: 'hsl(var(--primary))', strokeWidth: 0 }
                      : false
                  }
                >
                  <LabelList
                    content={({ x, y, index }) => {
                      const data = fmvChartData[index as number];
                      if (!data || x === undefined || y === undefined)
                        return null;
                      const stageColor = getStageColor(data.stage as any);
                      // Estimated label width: no SVG text measurement, so
                      // approximate glyph advance (~5px at the 9px font) + padding.
                      const badgeWidth = Math.max(
                        data.stage.length * 5 + 14,
                        40,
                      );
                      return (
                        <g>
                          <line
                            x1={Number(x)}
                            y1={Number(y) - 24}
                            x2={Number(x)}
                            y2={Number(y) - 8}
                            stroke="hsl(var(--foreground))"
                            strokeWidth={1}
                            strokeDasharray="2 2"
                          />
                          <rect
                            x={Number(x) - badgeWidth / 2}
                            y={Number(y) - 62}
                            width={badgeWidth}
                            height={16}
                            rx={8}
                            fill={stageColor}
                          />
                          <text
                            x={Number(x)}
                            y={Number(y) - 51}
                            textAnchor="middle"
                            fill="#ffffff"
                            className="font-label"
                            style={{ fontSize: 9 }}
                          >
                            {data.stage}
                          </text>
                          <text
                            x={Number(x)}
                            y={Number(y) - 30}
                            textAnchor="middle"
                            className="font-medium fill-foreground font-label"
                            style={{ fontSize: 12 }}
                          >
                            {data.fmvLabel}
                          </text>
                        </g>
                      );
                    }}
                  />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      {transactions && transactions.length > 0 && (
        <Section title="Transactions">
          <TableShell>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Entity Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Equity Class</TableHead>
                <TableHead className="text-right">My Units</TableHead>
                <TableHead className="text-right">My Entry Cost</TableHead>
                <TableHead className="text-right">Realized Proceeds</TableHead>
                <TableHead className="text-right">Post Money</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...transactions]
                .sort(
                  (a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime(),
                )
                .map((tx, idx) => {
                  const txId = tx.id;
                  const txMeta = txId != null ? (txOverrides[txId] ?? {}) : {};
                  const dateDef =
                    txId != null
                      ? getEditableField('inv_transaction', 'transaction_date')
                      : undefined;
                  const unitsDef =
                    txId != null
                      ? getEditableField('inv_transaction', 'units')
                      : undefined;
                  // inv_transaction.amount surfaces as a magnitude in different
                  // columns by flow: Entry Cost (tx.cost) for non-sales,
                  // Realized Proceeds (tx.realizedProceeds) for sales. Editing it
                  // lives in whichever column shows the non-zero magnitude, so
                  // both the value and any override badge stay coherent there.
                  const isSaleRow = tx.flowType === 'sale';
                  const amountDef =
                    txId != null
                      ? getEditableField('inv_transaction', 'amount')
                      : undefined;
                  // A tx whose Post Money is sourced from the company's latest
                  // (overridable) snapshot reflects a PMV override; older-round
                  // and pre-money-derived rows keep their own value.
                  const pmvOverride =
                    tx.postMoneySnapshotId != null &&
                    snapshotId != null &&
                    tx.postMoneySnapshotId === snapshotId
                      ? valOverrides.fields.postMoneyValuation
                      : undefined;
                  return (
                    <TableRow key={txId ?? `tx-${idx}`}>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: getStageColor(tx.stage as any),
                            }}
                          />
                          <span className="font-sans-neue text-sm tabular-nums">
                            {dateDef && txId != null ? (
                              <OverridableValue
                                meta={txMeta.transaction_date}
                                label={dateDef.label}
                              >
                                <EditableValue
                                  fieldDef={dateDef}
                                  entityId={txId}
                                  currentRawValue={tx.date}
                                >
                                  {formatDate(tx.date, '-')}
                                </EditableValue>
                              </OverridableValue>
                            ) : (
                              formatDate(tx.date, '-')
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {tx.entityName ?? (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {tx.transactionType ?? tx.flowType ?? 'investment'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {tx.stage ? (
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-xs',
                              'bg-[color-mix(in_srgb,var(--stage-color)_12.5%,transparent)] text-[color-mix(in_srgb,var(--stage-color)_70%,black)]',
                              'dark:bg-[color-mix(in_srgb,var(--stage-color)_28%,transparent)] dark:text-[color-mix(in_srgb,var(--stage-color)_45%,white)]',
                            )}
                            style={
                              {
                                '--stage-color': getStageColor(tx.stage),
                              } as CSSProperties
                            }
                          >
                            {tx.stage}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {tx.equityClass ?? (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-sans-neue text-sm tabular-nums">
                        <span className="inline-flex items-center justify-end gap-1">
                          {unitsDef && txId != null ? (
                            <OverridableValue
                              meta={txMeta.units}
                              label={unitsDef.label}
                              align="end"
                              formatValue={formatOverrideUnits}
                            >
                              <EditableValue
                                fieldDef={unitsDef}
                                entityId={txId}
                                currentRawValue={tx.myUnits ?? 0}
                              >
                                {tx.myUnits == null || tx.myUnits === 0
                                  ? '-'
                                  : tx.myUnits < 0
                                    ? `(${Math.abs(tx.myUnits).toLocaleString()})`
                                    : tx.myUnits.toLocaleString()}
                              </EditableValue>
                            </OverridableValue>
                          ) : tx.myUnits == null || tx.myUnits === 0 ? (
                            '-'
                          ) : tx.myUnits < 0 ? (
                            `(${Math.abs(tx.myUnits).toLocaleString()})`
                          ) : (
                            tx.myUnits.toLocaleString()
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-sans-neue text-sm tabular-nums">
                        <span className="inline-flex items-center justify-end gap-1">
                          {amountDef && txId != null && !isSaleRow ? (
                            <OverridableValue
                              meta={txMeta.amount}
                              label={amountDef.label}
                              align="end"
                              formatValue={formatOverrideUSD}
                            >
                              <EditableValue
                                fieldDef={amountDef}
                                entityId={txId}
                                currentRawValue={tx.cost ?? 0}
                                rawTransactionType={tx.rawTransactionType}
                                signSource={tx.amount}
                              >
                                {formatCompactUSD(tx.cost ?? 0)}
                              </EditableValue>
                            </OverridableValue>
                          ) : (
                            formatCompactUSD(tx.cost ?? 0)
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-sans-neue text-sm tabular-nums">
                        <span className="inline-flex items-center justify-end gap-1">
                          {amountDef && txId != null && isSaleRow ? (
                            <OverridableValue
                              meta={txMeta.amount}
                              label="Realized Proceeds"
                              align="end"
                              formatValue={formatOverrideUSD}
                            >
                              <EditableValue
                                fieldDef={amountDef}
                                entityId={txId}
                                currentRawValue={tx.realizedProceeds ?? 0}
                                rawTransactionType={tx.rawTransactionType}
                                signSource={tx.amount}
                              >
                                {formatCompactUSD(tx.realizedProceeds ?? 0)}
                              </EditableValue>
                            </OverridableValue>
                          ) : (
                            formatCompactUSD(tx.realizedProceeds ?? 0)
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-sans-neue text-sm tabular-nums">
                        {pmvOverride ? (
                          <OverrideBadge
                            meta={pmvOverride}
                            label="Post Money Valuation"
                            align="end"
                            formatValue={formatOverrideUSD}
                          >
                            {formatOverrideUSD(pmvOverride.overrideValue)}
                          </OverrideBadge>
                        ) : tx.postMoneyValuation ? (
                          formatCompactUSD(tx.postMoneyValuation)
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell colSpan={5}>Total</TableCell>
                <TableCell className="text-right font-sans-neue tabular-nums">
                  {transactions
                    .reduce((sum, tx) => sum + (tx.myUnits ?? 0), 0)
                    .toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-sans-neue tabular-nums">
                  {formatCompactUSD(
                    transactions.reduce((sum, tx) => sum + (tx.cost ?? 0), 0),
                  )}
                </TableCell>
                <TableCell className="text-right font-sans-neue tabular-nums">
                  {formatCompactUSD(
                    transactions.reduce(
                      (sum, tx) => sum + (tx.realizedProceeds ?? 0),
                      0,
                    ),
                  )}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </TableShell>
        </Section>
      )}

      <div className="space-y-16">
        {/* Company Valuation + Investor Status + Economic Rights */}
        <div className="grid grid-cols-3 gap-12">
          <Section title="Company Valuation">
            <div className="divide-y divide-foreground/10">
              {snapshotId != null &&
              getEditableField(
                'inv_cap_table_snapshot',
                'implied_valuation',
              ) ? (
                <FieldRow
                  label="Post Money Valuation"
                  value={
                    <OverridableValue
                      meta={valOverrides.fields.postMoneyValuation}
                      label="Post Money Valuation"
                      align="end"
                      formatValue={formatOverrideUSD}
                      onReverted={refresh}
                    >
                      <EditableValue
                        fieldDef={
                          getEditableField(
                            'inv_cap_table_snapshot',
                            'implied_valuation',
                          )!
                        }
                        entityId={snapshotId}
                        currentRawValue={postMoneyValuation}
                        onSaved={refresh}
                      >
                        {formatCompactUSD(postMoneyValuation)}
                      </EditableValue>
                    </OverridableValue>
                  }
                />
              ) : (
                <FieldRow
                  label="Post Money Valuation"
                  value={formatCompactUSD(postMoneyValuation)}
                />
              )}
              <FieldRow
                label="Total Equity Financing"
                value={formatCompactUSD(totalEquityFinancing)}
              />
              {snapshotId != null &&
              getEditableField('inv_cap_table_snapshot', 'share_price') ? (
                <FieldRow
                  label="Current Price Per Unit"
                  value={
                    <OverridableValue
                      meta={valOverrides.fields.currentPriceUnit}
                      label="Current Price Per Unit"
                      align="end"
                      formatValue={formatOverridePrice}
                      onReverted={refresh}
                    >
                      <EditableValue
                        fieldDef={
                          getEditableField(
                            'inv_cap_table_snapshot',
                            'share_price',
                          )!
                        }
                        entityId={snapshotId}
                        currentRawValue={currentPricePerUnit ?? 0}
                        onSaved={refresh}
                      >
                        {currentPricePerUnit === 0 ||
                        currentPricePerUnit === null
                          ? '-'
                          : formatPricePerShare(currentPricePerUnit)}
                      </EditableValue>
                    </OverridableValue>
                  }
                />
              ) : (
                <FieldRow
                  label="Current Price Per Unit"
                  value={
                    currentPricePerUnit === 0 || currentPricePerUnit === null
                      ? '-'
                      : formatPricePerShare(currentPricePerUnit)
                  }
                />
              )}
              <FieldRow
                label="Last Transaction Date"
                value={formatDate(lastTransactionDate, '-')}
              />
            </div>
          </Section>
          <InvestorStatusEditableSection
            context={investorStatusContext}
            hasBoardSeat={hasBoardSeat}
            hasInvestorData={hasInvestorData}
            statusResolved={rawStatusContext != null}
          />
          {hasEconomicRightsData ? (
            <Section title="Economic Rights">
              <div className="divide-y divide-foreground/10">
                <FieldRow
                  label="Anti-Dilution"
                  value={
                    <OverridableValue
                      meta={
                        legalTermsOverrides?.overridden.securityTerms
                          .anti_dilution_type
                      }
                      label="Anti-Dilution"
                      align="end"
                      formatValue={formatAntiDilution}
                      onReverted={refresh}
                    >
                      {antiDilutionType || '-'}
                    </OverridableValue>
                  }
                />
                <FieldRow
                  label="Liquidation Preference"
                  value={
                    <OverridableValue
                      meta={
                        legalTermsOverrides?.overridden.securityTerms
                          .liquidation_seniority
                      }
                      label="Liquidation Preference"
                      align="end"
                      formatValue={formatCount}
                      onReverted={refresh}
                    >
                      {liquidationPreference || '-'}
                    </OverridableValue>
                  }
                />
                {/* A plain StatusBadge can't carry an override marker (it owns
                    its BooleanDot), so this row is a FieldRow of the same. */}
                <FieldRow
                  label="QSBS Qualified"
                  value={
                    <OverridableValue
                      meta={
                        legalTermsOverrides?.overridden.roundTerms.qsbs_rep_made
                      }
                      label="QSBS Qualified"
                      align="end"
                      formatValue={formatBool}
                      onReverted={refresh}
                    >
                      <BooleanDot value={isQsbsQualified ?? false} />
                    </OverridableValue>
                  }
                />
              </div>
            </Section>
          ) : (
            <Section title="Economic Rights">
              <p className="text-sm text-muted-foreground">
                Economic rights data not available.
              </p>
            </Section>
          )}
        </div>

        <BoardEditableSection
          companyId={company.entityId}
          entries={boardEntries}
          funds={company.funds ?? []}
        />

        {/* Company Details */}
        <Section title="Company Details">
          {aboutDescription && (
            <div className="mb-6 space-y-2">
              <p className="font-sans-neue text-sm leading-tight text-muted-foreground">
                About
              </p>
              <ExpandableText text={aboutDescription} />
            </div>
          )}
          <div className="grid grid-cols-3 gap-x-12">
            <div className="divide-y divide-foreground/10">
              <FieldRow
                label="Entity Type"
                value={
                  <CompanyDetailValue
                    fieldKey="entity_type"
                    entityId={company.entityId}
                    rawValue={company.entityType || null}
                    meta={companyDetailsOverrides.entity_type}
                    onChanged={refresh}
                  >
                    {company.entityType || '-'}
                  </CompanyDetailValue>
                }
              />
              <FieldRow
                label="Founded"
                value={
                  <CompanyDetailValue
                    fieldKey="founded_year"
                    entityId={company.entityId}
                    rawValue={rawFoundedYear}
                    meta={companyDetailsOverrides.founded_year}
                    onChanged={refresh}
                  >
                    {rawFoundedYear ?? '-'}
                  </CompanyDetailValue>
                }
              />
              <FieldRow
                label="Sector"
                value={
                  <CompanyDetailValue
                    fieldKey="sector"
                    entityId={company.entityId}
                    rawValue={company.sector || null}
                    meta={companyDetailsOverrides.sector}
                    onChanged={refresh}
                  >
                    {humanizeSlug(company.sector)}
                  </CompanyDetailValue>
                }
              />
            </div>
            <div className="divide-y divide-foreground/10">
              <FieldRow
                label="Headquarters"
                value={
                  <CompanyDetailValue
                    fieldKey="headquarters"
                    entityId={company.entityId}
                    rawValue={rawHeadquarters}
                    meta={companyDetailsOverrides.headquarters}
                    onChanged={refresh}
                  >
                    {humanizeSlug(rawHeadquarters)}
                  </CompanyDetailValue>
                }
              />
              <FieldRow
                label="Industry"
                value={
                  <CompanyDetailValue
                    fieldKey="industry"
                    entityId={company.entityId}
                    rawValue={rawIndustry}
                    meta={companyDetailsOverrides.industry}
                    onChanged={refresh}
                  >
                    {humanizeSlug(rawIndustry)}
                  </CompanyDetailValue>
                }
              />
            </div>
            <div className="divide-y divide-foreground/10">
              <FieldRow
                label="Jurisdiction"
                value={
                  <CompanyDetailValue
                    fieldKey="legal_jurisdiction"
                    entityId={company.entityId}
                    rawValue={rawJurisdiction}
                    meta={companyDetailsOverrides.legal_jurisdiction}
                    onChanged={refresh}
                  >
                    {humanizeSlug(rawJurisdiction)}
                  </CompanyDetailValue>
                }
              />
              <FieldRow
                label="Website"
                value={
                  <CompanyDetailValue
                    fieldKey="domain"
                    entityId={company.entityId}
                    rawValue={rawDomain}
                    meta={companyDetailsOverrides.domain}
                    onChanged={refresh}
                    triggerMode="icon"
                  >
                    {websiteLinkValue}
                  </CompanyDetailValue>
                }
              />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
