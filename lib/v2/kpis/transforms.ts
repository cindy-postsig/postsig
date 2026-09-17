import { formatCurrencyFull } from '@/app/lib/utils';
import { DATE_FORMAT_DEFAULT, formatDateTime } from '@/lib/date-format';
import {
  NARRATIVE_CATEGORY,
  type CompanyCustomKpi,
  type CustomKpiUsage,
  type CustomKpiValue,
  type EditableKpi,
  type KpiDefinition,
  type KpiEvent,
  type KpiEventPayload,
  type KpiEventType,
  type KpiMetric,
  type KpiPeriod,
  type KpiPeriodView,
  type KpiScalar,
  type KpiValueEditedPayload,
  type KpiValueType,
  type PendingRequest,
  type RecipientAddedPayload,
  type ReminderSentPayload,
  type ReportingKpiValue,
  type ReportingQuarter,
  type ReportingType,
  type ResolvedKpiValue,
  type RequestSentPayload,
  type RollupKpi,
  type StandardKpiOverride,
  type SubmissionCounts,
  type SubmissionReceivedPayload,
} from './types';

export const quarterOfMonth = (month: number): number =>
  Math.floor((month - 1) / 3) + 1;

const periodKey = (
  year: number,
  quarter: number | null,
  month: number | null,
): string =>
  `${year}|${month != null ? `M${month}` : quarter != null ? `Q${quarter}` : 'FY'}`;

const isAnnualCell = (cell: CustomKpiValue): boolean =>
  cell.periodQuarter == null && cell.periodMonth == null;

const cellHasValue = (cell: CustomKpiValue): boolean =>
  cell.displayValue.numeric != null || !!cell.displayValue.text?.trim();

export function editableKpiHasContent(kpi: EditableKpi): boolean {
  return kpi.values.some(cellHasValue);
}

export function editableKpiHasPeriodContent(
  kpi: EditableKpi,
  period: KpiPeriodView,
): boolean {
  if (period === 'annual') return editableKpiHasContent(kpi);
  if (period === 'monthly')
    return kpi.values.some((v) => v.periodMonth != null && cellHasValue(v));
  return kpi.values.some((v) => !isAnnualCell(v) && cellHasValue(v));
}

export function visibleCategoryKpis(
  entry: { standard: EditableKpi[]; custom: EditableKpi[] } | undefined,
  showAll: boolean,
  period: KpiPeriodView,
): { standard: EditableKpi[]; custom: EditableKpi[] } {
  const standard = entry?.standard ?? [];
  const custom = entry?.custom ?? [];
  if (showAll) return { standard, custom };
  const hasData = (kpi: EditableKpi) =>
    editableKpiHasPeriodContent(kpi, period);
  return {
    standard: standard.filter(hasData),
    custom: custom.filter(hasData),
  };
}

export function formatPeriodLabel(
  quarter: number | null,
  year: number,
): string {
  return quarter == null ? `FY ${year}` : `Q${quarter} ${year}`;
}

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const formatMonthLabel = (month: number, year: number): string =>
  `${MONTH_ABBREVIATIONS[month - 1]} ${year}`;

// How far back the KPI views look. Columns older than this are dropped from
// every granularity, so the tables stay readable as extracted history piles up.
export const KPI_HISTORY_YEARS = 3;

export const earliestDisplayedYear = (currentYear: number): number =>
  currentYear - KPI_HISTORY_YEARS;

// A year missing Q4 is still in progress, so its label carries a YTD suffix.
const fiscalYearLabel = (year: number, hasQ4: boolean): string =>
  hasQ4 ? `FY ${year}` : `FY ${year} YTD`;

export function currentPeriod(): { year: number; quarter: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    quarter: Math.floor(now.getMonth() / 3) + 1,
  };
}

// A freemail domain must never become a company's self-signup gate — it would
// admit anyone with an account at that provider. Mirrored in postsig-portco
// lib/auth/request-signup.ts; keep the two lists in sync.
const FREEMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'yandex.ru',
  'fastmail.com',
  'hey.com',
]);

export const isFreemailDomain = (domain: string): boolean =>
  FREEMAIL_DOMAINS.has(domain.trim().toLowerCase());

export const isFreemailEmail = (email: string): boolean => {
  const domain = email.split('@')[1];
  return domain != null && isFreemailDomain(domain);
};

// Accepts what people paste into the domain field — "https://www.acme.io/about",
// "@acme.io" — and reduces it to the bare host.
export function normalizeDomainInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z+.-]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .trim();
}

export function deriveCompanyDomain(recipientEmails: string[]): string | null {
  for (const email of recipientEmails) {
    const domain = email.split('@')[1]?.trim().toLowerCase();
    if (domain && !isFreemailDomain(domain)) return domain;
  }
  return null;
}

// A reminder nudges recipients who haven't started; it opens 3 days after the
// request (or the previous reminder) so recipients aren't spammed.
export const REMINDER_WAIT_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export function canSendReminder(
  req: Pick<PendingRequest, 'sentAt' | 'lastReminderAt' | 'filledCount'>,
  now: Date = new Date(),
): boolean {
  if (req.filledCount > 0 || !req.sentAt) return false;
  const lastNudge = req.lastReminderAt ?? req.sentAt;
  return (
    now.getTime() - new Date(lastNudge).getTime() >= REMINDER_WAIT_DAYS * DAY_MS
  );
}

export function requestProgressPercent(filled: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((filled / total) * 100));
}

export function formatKpiDisplay(
  valueType: KpiValueType,
  numeric: number | null,
  text: string | null,
): string {
  if (numeric != null) {
    if (valueType === 'currency') return formatCurrencyFull(numeric);
    if (valueType === 'percent') return `${numeric}%`;
    return numeric.toLocaleString();
  }
  return text?.trim() || '-';
}

const hasValue = (kpi: ReportingKpiValue): boolean =>
  kpi.valueNumeric != null || !!kpi.valueText?.trim();

// Collapse quarterly submissions into one synthetic period per fiscal year so the
// KPI table can show FY columns from quarterly data. Flow metrics (catalog
// is_flow) sum across the year's quarters; everything else snapshots to the
// latest reported quarter. Periods already submitted annually pass through
// unchanged.
export function rollUpToFiscalYears(
  periods: ReportingQuarter[],
  flowCodes: Set<string>,
): ReportingQuarter[] {
  const annual = periods.filter((p) => p.periodQuarter == null);
  // A submitted annual report is authoritative for its year; don't also
  // synthesize a rolled-up FY row from that year's quarters.
  const annualYears = new Set(annual.map((p) => p.periodYear));
  const byYear = new Map<number, ReportingQuarter[]>();
  for (const p of periods) {
    if (p.periodQuarter == null) continue;
    const arr = byYear.get(p.periodYear) ?? [];
    arr.push(p);
    byYear.set(p.periodYear, arr);
  }

  const rolled: ReportingQuarter[] = [];
  for (const [year, quarters] of byYear) {
    if (annualYears.has(year)) continue;
    const ordered = [...quarters].sort(
      (a, b) => (a.periodQuarter ?? 0) - (b.periodQuarter ?? 0),
    );
    const latest = ordered[ordered.length - 1];
    const hasQ4 = ordered.some((q) => q.periodQuarter === 4);

    const byCode = new Map<string, ReportingKpiValue>();
    for (const q of ordered) {
      for (const kpi of q.kpis) {
        if (flowCodes.has(kpi.code)) {
          if (kpi.valueNumeric == null) {
            if (!byCode.has(kpi.code)) byCode.set(kpi.code, { ...kpi });
            continue;
          }
          const prior = byCode.get(kpi.code)?.valueNumeric ?? 0;
          byCode.set(kpi.code, {
            ...kpi,
            valueNumeric: prior + kpi.valueNumeric,
          });
        } else if (hasValue(kpi) || !byCode.has(kpi.code)) {
          byCode.set(kpi.code, { ...kpi });
        }
      }
    }

    rolled.push({
      packId: latest.packId,
      periodYear: year,
      periodQuarter: null,
      periodLabel: fiscalYearLabel(year, hasQ4),
      submittedAt: latest.submittedAt,
      kpis: Array.from(byCode.values()),
      documents: [],
    });
  }

  return [...annual, ...rolled].sort((a, b) => b.periodYear - a.periodYear);
}

const scalarHasData = (s: KpiScalar): boolean =>
  s.numeric != null || !!s.text?.trim();

// Strict numeric equality plus trimmed-text equality; drives the out-of-sync
// comparison of a direct FY value against its computed roll-up.
const scalarsEqual = (a: KpiScalar, b: KpiScalar): boolean =>
  a.numeric === b.numeric && (a.text?.trim() ?? '') === (b.text?.trim() ?? '');

// Newest of a cell's two origin timestamps. Missing timestamps sort oldest
// (treated as epoch) so a cell that never carried an origin can't win recency.
const cellRecency = (cell: CustomKpiValue): number =>
  Math.max(
    cell.portcoUpdatedAt ? new Date(cell.portcoUpdatedAt).getTime() : 0,
    cell.investorUpdatedAt ? new Date(cell.investorUpdatedAt).getTime() : 0,
  );

// One sub-period feeding a roll-up: `ordinal` orders them within the parent
// (quarter number within a year, month number within a quarter) so a stock
// metric can snapshot the latest one.
interface PeriodReading {
  ordinal: number;
  value: KpiScalar;
  recency: number;
}

// The roll-up of a period's sub-periods: flow metrics sum non-null numerics
// (all-null sub-periods collapse to a blank scalar, not null), everything else
// snapshots the latest reported one. No sub-periods → null.
const rollUp = (
  kpi: RollupKpi,
  readings: PeriodReading[],
): KpiScalar | null => {
  if (readings.length === 0) return null;
  if (kpi.isFlow) {
    const nums = readings
      .map((r) => r.value.numeric)
      .filter((n): n is number => n != null);
    if (nums.length === 0) return { numeric: null, text: null };
    return { numeric: nums.reduce((a, b) => a + b, 0), text: null };
  }
  const latest = [...readings].sort((a, b) => b.ordinal - a.ordinal)[0];
  return { numeric: latest.value.numeric, text: latest.value.text };
};

// Resolves a period under "latest change wins": a cell entered directly at that
// granularity competes with the roll-up of its sub-periods by recency, and the
// direct side wins when its newest timestamp is >= theirs — ties go to direct so
// the outcome is deterministic. When the direct cell is empty, or the
// sub-periods are newer, the computed roll-up displays instead. `outOfSync`
// flags a displayed direct value that disagrees with what its sub-periods
// compute to. Returns null only when the period has neither.
const resolveAgainst = (
  kpi: RollupKpi,
  direct: CustomKpiValue | null,
  sub: PeriodReading[],
): ResolvedKpiValue | null => {
  const computedValue = rollUp(kpi, sub);
  const blank: KpiScalar = { numeric: null, text: null };
  const computed = (): ResolvedKpiValue => ({
    displayValue: computedValue ?? blank,
    source: 'computed',
    computedValue,
    outOfSync: false,
  });

  // A direct cell with an empty displayValue does not count as direct — the
  // period then falls back to the roll-up.
  const hasDirect = direct != null && cellHasValue(direct);
  if (!hasDirect) return sub.length === 0 ? null : computed();

  const tDirect = cellRecency(direct);
  const tSub = sub.length ? Math.max(...sub.map((r) => r.recency)) : 0;
  if (sub.length > 0 && tDirect < tSub) return computed();

  const outOfSync =
    computedValue != null &&
    scalarHasData(computedValue) &&
    !scalarsEqual(direct.displayValue, computedValue);
  return {
    displayValue: direct.displayValue,
    source: 'direct',
    computedValue,
    outOfSync,
  };
};

const quarterCell = (
  kpi: RollupKpi,
  year: number,
  quarter: number,
): CustomKpiValue | null =>
  kpi.values.find(
    (v) => v.periodYear === year && v.periodQuarter === quarter,
  ) ?? null;

// The monthly cells belonging to one quarter, keyed to that quarter by calendar
// month — a monthly reporting pack carries no quarter of its own.
const monthCells = (
  kpi: RollupKpi,
  year: number,
  quarter: number,
): { cell: CustomKpiValue; month: number }[] =>
  kpi.values.flatMap((v) =>
    v.periodYear === year &&
    v.periodMonth != null &&
    quarterOfMonth(v.periodMonth) === quarter
      ? [{ cell: v, month: v.periodMonth }]
      : [],
  );

// Resolves a KPI's reading for one quarter: a directly-entered quarterly cell
// (portco submission or investor value) competing with the roll-up of that
// quarter's extracted months.
export function resolveQuarterKpi(
  kpi: RollupKpi,
  year: number,
  quarter: number,
): ResolvedKpiValue | null {
  return resolveAgainst(
    kpi,
    quarterCell(kpi, year, quarter),
    monthCells(kpi, year, quarter).map(({ cell, month }) => ({
      ordinal: month,
      value: cell.displayValue,
      recency: cellRecency(cell),
    })),
  );
}

// The year's quarterly series as the annual roll-up sees it: each quarter is its
// direct cell when one wins, else its monthly roll-up. A quarter present but
// empty still counts as a reported quarter — dropping it would let an all-null
// year resolve to "no data" instead of a blank value.
const quarterReadings = (kpi: RollupKpi, year: number): PeriodReading[] => {
  const readings: PeriodReading[] = [];
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    const cell = quarterCell(kpi, year, quarter);
    const months = monthCells(kpi, year, quarter);
    if (cell == null && months.length === 0) continue;
    const resolved = resolveQuarterKpi(kpi, year, quarter);
    readings.push({
      ordinal: quarter,
      value: resolved?.displayValue ?? { numeric: null, text: null },
      recency: Math.max(
        cell ? cellRecency(cell) : 0,
        ...months.map((m) => cellRecency(m.cell)),
        0,
      ),
    });
  }
  return readings;
};

// Resolves a KPI's annual reading for a fiscal year: a directly-entered FY cell
// (annual submission or investor override) competing with the quarterly
// roll-up, where each quarter may itself be month-derived.
export function resolveAnnualKpi(
  kpi: RollupKpi,
  year: number,
): ResolvedKpiValue | null {
  const fyCell = kpi.values.find(
    (v) => v.periodYear === year && isAnnualCell(v),
  );
  return resolveAgainst(kpi, fyCell ?? null, quarterReadings(kpi, year));
}

// A KPI's value for a display period. Monthly reads the extracted cell as
// stored; quarterly and annual route through the resolvers so every read
// surface agrees on the recency-resolved value.
export function customDisplayValue(
  kpi: RollupKpi,
  year: number,
  quarter: number | null,
  month: number | null = null,
): KpiScalar | null {
  if (month != null) {
    const v = kpi.values.find(
      (x) => x.periodYear === year && x.periodMonth === month,
    );
    return v
      ? { numeric: v.displayValue.numeric, text: v.displayValue.text }
      : null;
  }
  const resolved =
    quarter != null
      ? resolveQuarterKpi(kpi, year, quarter)
      : resolveAnnualKpi(kpi, year);
  return resolved ? resolved.displayValue : null;
}

// Periods the KPI views pivot on — the table's columns and the grid's period
// picker, at the requested granularity. Monthly lists the months carrying
// extracted cells; quarterly lists reported quarters (a quarter with only
// monthly cells included, since those roll up into it) plus the current quarter
// so a value can always be entered; annual lists every fiscal year with data,
// labelled YTD until the year's fourth quarter is reported. Every granularity
// is capped at KPI_HISTORY_YEARS of history. Newest first.
export function buildKpiPeriods(
  view: KpiPeriodView,
  submitted: ReportingQuarter[],
  kpis: readonly RollupKpi[],
  current: { year: number; quarter: number },
): KpiPeriod[] {
  const earliest = earliestDisplayedYear(current.year);
  const inWindow = (year: number) => year >= earliest;

  if (view === 'monthly') {
    const cols = new Map<string, KpiPeriod>();
    for (const kpi of kpis)
      for (const v of kpi.values) {
        if (v.periodMonth == null || !inWindow(v.periodYear)) continue;
        const key = periodKey(v.periodYear, null, v.periodMonth);
        if (cols.has(key)) continue;
        cols.set(key, {
          year: v.periodYear,
          quarter: null,
          month: v.periodMonth,
          key,
          label: formatMonthLabel(v.periodMonth, v.periodYear),
        });
      }
    return Array.from(cols.values()).sort(
      (a, b) => b.year - a.year || (b.month ?? 0) - (a.month ?? 0),
    );
  }

  if (view === 'quarterly') {
    const cols = new Map<string, KpiPeriod>();
    const add = (year: number, quarter: number) => {
      if (!inWindow(year)) return;
      const key = periodKey(year, quarter, null);
      if (cols.has(key)) return;
      cols.set(key, {
        year,
        quarter,
        month: null,
        key,
        label: `Q${quarter} ${year}`,
      });
    };
    for (const q of submitted)
      if (q.periodQuarter != null) add(q.periodYear, q.periodQuarter);
    for (const kpi of kpis)
      for (const v of kpi.values) {
        if (v.periodQuarter != null) add(v.periodYear, v.periodQuarter);
        else if (v.periodMonth != null)
          add(v.periodYear, quarterOfMonth(v.periodMonth));
      }
    add(current.year, current.quarter);
    return Array.from(cols.values()).sort(
      (a, b) => b.year - a.year || (b.quarter ?? 0) - (a.quarter ?? 0),
    );
  }

  // A fiscal year is complete once its final quarter is in — reported as an
  // annual submission, as Q4, or as any month of Q4. Until then it reads YTD.
  const years = new Map<number, boolean>();
  const mark = (year: number, full: boolean) => {
    if (!inWindow(year)) return;
    years.set(year, (years.get(year) ?? false) || full);
  };
  for (const p of submitted)
    mark(p.periodYear, p.periodQuarter == null || p.periodQuarter === 4);
  for (const kpi of kpis)
    for (const v of kpi.values)
      mark(
        v.periodYear,
        v.periodQuarter === 4 || (v.periodMonth != null && v.periodMonth >= 10),
      );
  return Array.from(years.entries())
    .map(([year, full]) => ({
      year,
      quarter: null,
      month: null,
      key: periodKey(year, null, null),
      label: fiscalYearLabel(year, full),
    }))
    .sort((a, b) => b.year - a.year);
}

// Whether any submitted quarterly period carries a quantitative (non-narrative)
// standard KPI value — the same rule the quarterly pivot applies, so tab
// defaults can't drift from what the performance table actually shows.
export function hasQuarterlyQuantKpis(submitted: ReportingQuarter[]): boolean {
  return (
    pivotKpisByCategory(submitted.filter((q) => q.periodQuarter != null)).size >
    0
  );
}

// Pivot displayed periods into metric rows (one per KPI code, ordered by catalog
// sortOrder) grouped by category. Periods stay as columns via valuesByPack.
export function pivotKpisByCategory(
  displayedPeriods: ReportingQuarter[],
): Map<string, KpiMetric[]> {
  const metrics = new Map<string, KpiMetric>();
  for (const q of displayedPeriods) {
    for (const kpi of q.kpis) {
      // Narrative KPIs are hidden for now.
      if (kpi.valueType === 'textarea' || kpi.category === NARRATIVE_CATEGORY)
        continue;
      let metric = metrics.get(kpi.code);
      if (!metric) {
        metric = {
          code: kpi.code,
          label: kpi.label,
          category: kpi.category,
          sortOrder: kpi.sortOrder,
          valuesByPack: new Map(),
        };
        metrics.set(kpi.code, metric);
      }
      metric.valuesByPack.set(q.packId, kpi);
    }
  }
  const byCategory = new Map<string, KpiMetric[]>();
  for (const metric of Array.from(metrics.values()).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )) {
    const arr = byCategory.get(metric.category) ?? [];
    arr.push(metric);
    byCategory.set(metric.category, arr);
  }
  return byCategory;
}

export function customToEditableKpi(kpi: CompanyCustomKpi): EditableKpi {
  return {
    publicId: kpi.publicId,
    code: null,
    label: kpi.label,
    category: kpi.category,
    valueType: kpi.valueType,
    isFlow: kpi.isFlow,
    isCustom: true,
    description: null,
    values: kpi.values,
  };
}

// Standard catalog KPIs as editable rows: each coded, non-narrative definition
// paired with this company's per-period provenance cells. Portco-submitted
// quarters supply the portco side; investor overrides supply the investor side
// and win the display. Textarea/narrative KPIs stay out of the quantitative
// tables. Every eligible definition is returned even with no values so a value
// can always be entered manually.
export function buildStandardEditableKpis(
  catalog: KpiDefinition[],
  submitted: ReportingQuarter[],
  overrides: StandardKpiOverride[],
): EditableKpi[] {
  type PortcoCell = {
    year: number;
    quarter: number | null;
    scalar: KpiScalar;
    updatedAt: string | null;
  };
  const portcoByCode = new Map<string, Map<string, PortcoCell>>();
  for (const q of submitted) {
    for (const kpi of q.kpis) {
      const cells = portcoByCode.get(kpi.code) ?? new Map<string, PortcoCell>();
      cells.set(periodKey(q.periodYear, q.periodQuarter, null), {
        year: q.periodYear,
        quarter: q.periodQuarter,
        scalar: { numeric: kpi.valueNumeric, text: kpi.valueText },
        updatedAt: kpi.updatedAt,
      });
      portcoByCode.set(kpi.code, cells);
    }
  }

  const overridesByCode = new Map<string, Map<string, StandardKpiOverride>>();
  for (const o of overrides) {
    const cells =
      overridesByCode.get(o.code) ?? new Map<string, StandardKpiOverride>();
    cells.set(periodKey(o.periodYear, o.periodQuarter, o.periodMonth), o);
    overridesByCode.set(o.code, cells);
  }

  return catalog
    .filter(
      (d) =>
        !d.isCustom &&
        d.code != null &&
        d.category !== NARRATIVE_CATEGORY &&
        d.valueType !== 'textarea',
    )
    .map((d) => {
      const code = d.code as string;
      const cells = new Map<string, CustomKpiValue>();
      for (const [key, p] of portcoByCode.get(code) ?? []) {
        cells.set(key, {
          periodYear: p.year,
          periodQuarter: p.quarter,
          periodMonth: null,
          portcoValue: p.scalar,
          investorValue: null,
          displayValue: p.scalar,
          edited: false,
          portcoUpdatedAt: p.updatedAt,
          investorUpdatedAt: null,
        });
      }
      for (const [key, o] of overridesByCode.get(code) ?? []) {
        const existing = cells.get(key);
        cells.set(key, {
          periodYear: o.periodYear,
          periodQuarter: o.periodQuarter,
          periodMonth: o.periodMonth,
          portcoValue: existing?.portcoValue ?? null,
          investorValue: o.value,
          displayValue: o.value,
          edited: true,
          portcoUpdatedAt: existing?.portcoUpdatedAt ?? null,
          investorUpdatedAt: o.updatedAt,
        });
      }
      return {
        publicId: d.publicId,
        code: d.code,
        label: d.label,
        category: d.category,
        valueType: d.valueType,
        isFlow: d.isFlow,
        isCustom: false,
        description: d.description,
        values: Array.from(cells.values()),
      };
    });
}

// For a 'kpi' submission_received event: pair how many KPI values the submission
// carries with how many its period's request asked for. A self-serve submission
// (no request behind it) has no requested baseline, so there's nothing to compare
// — return null and the event exposes no counts.
export function deriveSubmissionCounts(
  submittedCount: number,
  requestedCount: number | null,
): SubmissionCounts | null {
  if (requestedCount == null) return null;
  return { submittedCount, requestedCount };
}

export interface RawKpiEventRow {
  id: number;
  event_type: string;
  actor_user_id: string | null;
  payload: unknown;
  created_at: string;
}

// A human-readable one-line summary of a KPI Updates feed event, driven off the
// event type and its payload (payload isn't self-discriminating on eventType, so
// each branch narrows the union explicitly).
export function requestKindLabel(requestType: ReportingType): string {
  return requestType === 'kpi' ? 'KPI request' : 'Reporting pack request';
}

// Splits a request's recipients for display: the first shows inline, any others
// collapse into a "+N more" hover. `all` is the full list the hover reveals.
export function describeRequestRecipients(payload: RequestSentPayload): {
  kind: string;
  primary: string | null;
  overflowCount: number;
  all: string[];
} {
  const [primary, ...rest] = payload.recipients;
  return {
    kind: requestKindLabel(payload.requestType),
    primary: primary ?? null,
    overflowCount: rest.length,
    all: payload.recipients,
  };
}

export function isRequestSentEvent(
  event: KpiEvent,
): event is KpiEvent & { payload: RequestSentPayload } {
  return event.eventType === 'request_sent';
}

export function isKpiValueEditedEvent(
  event: KpiEvent,
): event is KpiEvent & { payload: KpiValueEditedPayload } {
  return event.eventType === 'kpi_value_edited';
}

// Renders an edited-event before/after scalar the way the KPI table shows it.
// valueType is undefined when the KPI definition no longer exists — fall back
// to locale-formatted numbers / raw text rather than dropping the value.
export function formatEditScalar(
  value: number | string | null,
  valueType: KpiValueType | undefined,
): string {
  if (value == null) return '–';
  if (typeof value === 'number') {
    return valueType
      ? formatKpiDisplay(valueType, value, null)
      : value.toLocaleString();
  }
  return valueType ? formatKpiDisplay(valueType, null, value) : value;
}

// Date + time in the viewer's local zone, mirroring the company Audit Log
// (ActivityContent). The KPI Updates feed renders client-only (ssr: false), so
// there is no server/browser render to reconcile. `pattern` is the viewer's
// effective date-fns pattern; the date part follows it while the time and zone
// are appended.
export function formatEventDate(iso: string, pattern?: string): string {
  return formatDateTime(iso, pattern ?? DATE_FORMAT_DEFAULT, iso);
}

export function formatEventPeriod(
  year: number,
  quarter: number | null,
  month: number | null = null,
): string {
  if (month != null) return formatMonthLabel(month, year);
  return quarter == null ? String(year) : `Q${quarter} ${year}`;
}

export function describeKpiEvent(event: KpiEvent): string {
  switch (event.eventType) {
    case 'request_sent': {
      const p = event.payload as RequestSentPayload;
      const count = p.recipients.length;
      return `${requestKindLabel(p.requestType)} sent to ${count} ${count === 1 ? 'recipient' : 'recipients'}`;
    }
    case 'reminder_sent': {
      const p = event.payload as ReminderSentPayload;
      const kind =
        p.requestType === 'kpi' ? 'KPI request' : 'reporting pack request';
      return `Reminder sent for ${kind}`;
    }
    case 'recipient_added': {
      const p = event.payload as RecipientAddedPayload;
      return `Recipient added: ${p.email}`;
    }
    case 'submission_received': {
      const p = event.payload as SubmissionReceivedPayload;
      const noun =
        p.submissionType === 'reporting_pack' ? 'Reporting pack' : 'KPIs';
      if (
        event.submittedCount != null &&
        event.requestedCount != null &&
        event.submittedCount < event.requestedCount
      ) {
        return `${noun} partially submitted (${event.submittedCount} of ${event.requestedCount})`;
      }
      return `${noun} submitted`;
    }
    case 'submission_revised': {
      const p = event.payload as SubmissionReceivedPayload;
      const noun =
        p.submissionType === 'reporting_pack' ? 'Reporting pack' : 'KPIs';
      return `${noun} revised`;
    }
    case 'kpi_value_edited': {
      const p = event.payload as KpiValueEditedPayload;
      const { subject, action } = kpiEditPhrase(p);
      return `${subject} ${action}`;
    }
  }
}

// Shared copy for a kpi_value_edited event: annual edits are called out
// explicitly, and a first entry (no prior value) reads "set" rather than
// "updated" so the feed doesn't render a dangling "– →" replacement. A month
// also carries a null quarter, so only a cell with neither is annual.
export function kpiEditPhrase(p: KpiValueEditedPayload): {
  subject: string;
  action: 'set' | 'updated';
} {
  const isAnnual = p.periodQuarter == null && p.periodMonth == null;
  return {
    subject: isAnnual ? `Annual ${p.label}` : p.label,
    action: p.previousValue == null ? 'set' : 'updated',
  };
}

// Map a stored event row into the read model, folding in the resolved actor name
// and (for partial-submission events) the derived counts.
export function toKpiEvent(
  row: RawKpiEventRow,
  actorName: string | null,
  counts: SubmissionCounts | null,
): KpiEvent {
  return {
    id: row.id,
    eventType: row.event_type as KpiEventType,
    actorUserId: row.actor_user_id,
    actorName,
    payload: row.payload as KpiEventPayload,
    createdAt: row.created_at,
    ...(counts ?? {}),
  };
}

export function customKpiDeleteBlockReason(
  usage: CustomKpiUsage,
): string | null {
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? '' : 's'}`;

  if (usage.pendingRequestCount > 0) {
    return `This KPI is included in ${plural(usage.pendingRequestCount, 'pending request')}. Wait for ${usage.pendingRequestCount === 1 ? 'it' : 'them'} to be submitted before removing it.`;
  }
  if (usage.portcoValueCount > 0) {
    return `${plural(usage.portcoValueCount, 'value')} submitted by a portfolio company would be lost. Disable this KPI in Settings to stop tracking it instead.`;
  }
  if (usage.valueCount > 0) {
    return `This KPI has ${plural(usage.valueCount, 'recorded value')}. Clear them first, or disable the KPI in Settings to stop tracking it.`;
  }
  return null;
}
