export type KpiValueType =
  | 'currency'
  | 'number'
  | 'percent'
  | 'text'
  | 'textarea';

// Matches the category seeded in inv_kpi; narrative KPIs are hidden
// from all quantitative views and from requests for now.
export const NARRATIVE_CATEGORY = 'Narrative';

// Investor-authored KPIs can't be long-form; textarea is catalog-only.
export type CustomKpiValueType = Exclude<KpiValueType, 'textarea'>;

export const CUSTOM_KPI_VALUE_TYPES = [
  'currency',
  'number',
  'percent',
  'text',
] as const satisfies readonly CustomKpiValueType[];

// A single scalar KPI reading: numeric for currency/percent/number, text for
// text/textarea. Both null means "no value".
export interface KpiScalar {
  numeric: number | null;
  text: string | null;
}

export interface ReportingKpiValue {
  code: string;
  label: string;
  category: string;
  valueType: KpiValueType;
  valueNumeric: number | null;
  valueText: string | null;
  sortOrder: number;
  // Trigger-maintained recency signal (null pre-migration rows / synthetic cells);
  // feeds the annual FY-vs-quarterly "latest change wins" resolution.
  updatedAt: string | null;
}

export interface ReportingDocument {
  id: number;
  fileName: string;
  filePath: string;
  fileType: string | null;
  fileSize: number | null;
  docType: string | null;
  customDocType: string | null;
  createdAt: string;
}

export interface ReportingQuarter {
  packId: number;
  periodYear: number;
  periodQuarter: number | null;
  periodLabel: string;
  // Latest submitted_at across this quarter's submissions (kpi + reporting_pack);
  // null until at least one is submitted.
  submittedAt: string | null;
  kpis: ReportingKpiValue[];
  documents: ReportingDocument[];
}

// A KPI definition from inv_kpi: either a global/standard row (isCustom false,
// code set, organization_id NULL in the DB) or an org's custom KPI (isCustom
// true, code null). One unified list — getKpis returns both. `description` feeds
// UI tooltips.
export interface KpiDefinition {
  id: number;
  publicId: string;
  code: string | null;
  label: string;
  category: string;
  valueType: KpiValueType;
  unit: string | null;
  description: string | null;
  placeholder: string | null;
  sortOrder: number;
  isFlow: boolean;
  isCustom: boolean;
}

export interface ReportingDocTypeOption {
  id: number;
  code: string;
  displayName: string;
  sortOrder: number;
}

export interface PendingRequest {
  publicId: string;
  requestType: 'kpi' | 'reporting_pack';
  periodYear: number;
  periodQuarter: number | null;
  periodLabel: string;
  recipientEmail: string;
  status: string;
  itemCount: number;
  sentAt: string | null;
  lastReminderAt: string | null;
  // How many of this request's items the recipient has saved as draft data for
  // the period. Exposes only counts for fill-rate tracking (psk-1788) — never
  // the draft's values.
  filledCount: number;
}

// A KPI line on an existing request, resolved to its definition. Labels resolve
// even for custom KPIs later deactivated (requests are immutable history), so
// the request's def lookup is unfiltered by is_active.
export interface RequestKpiRef {
  id: number;
  label: string;
  category: string;
  isCustom: boolean;
}

export interface ReportingRequestDetails {
  kpis: RequestKpiRef[];
  docTypeIds: number[];
  customDocLabels: string[];
  message: string | null;
  companyDomain: string | null;
}

export interface RequestRecipient {
  email: string;
}

export interface PortcoUserOption {
  id: string;
  email: string;
  name: string | null;
}

// One KPI cell for a company + period, carrying both origins. A KPI can hold a
// portco-submitted value and an investor-authored value for the same cell;
// investor wins for display, and `edited` marks that an investor value is present.
export interface CustomKpiValue {
  periodYear: number;
  periodQuarter: number | null;
  periodMonth: number | null;
  portcoValue: KpiScalar | null;
  investorValue: KpiScalar | null;
  displayValue: KpiScalar;
  edited: boolean;
  // Per-origin recency signals (null when that origin has no value for the cell);
  // the annual resolver compares FY vs quarterly timestamps to decide direct vs
  // computed.
  portcoUpdatedAt: string | null;
  investorUpdatedAt: string | null;
}

export interface CompanyCustomKpi {
  publicId: string;
  label: string;
  category: string;
  valueType: CustomKpiValueType;
  isFlow: boolean;
  values: CustomKpiValue[];
}

// An investor-authored value for a standard (coded) KPI. Portco-submitted
// standard values travel in ReportingQuarter; these overrides carry only the
// investor origin so the table can merge them in with investor precedence and
// mark the cell as edited. Custom-KPI values travel in CompanyCustomKpi instead.
export interface StandardKpiOverride {
  code: string;
  periodYear: number;
  periodQuarter: number | null;
  periodMonth: number | null;
  value: KpiScalar;
  updatedAt: string | null;
}

// A KPI rendered as one table row — a catalog definition (standard or custom)
// paired with this company's per-period provenance cells. The quarterly view
// edits these cells inline; the annual view rolls their displayValue up.
export interface EditableKpi {
  publicId: string;
  code: string | null;
  label: string;
  category: string;
  valueType: KpiValueType;
  isFlow: boolean;
  isCustom: boolean;
  description: string | null;
  values: CustomKpiValue[];
}

// The subset customDisplayValue and the period builders read — lets both
// CompanyCustomKpi and EditableKpi flow through the same roll-up helpers.
export type RollupKpi = Pick<EditableKpi, 'isFlow' | 'values'>;

// The resolved reading for one rolled-up period — a fiscal year over its
// quarters, or a quarter over its months. `source` records whether the displayed
// value came from a cell entered directly at that granularity or from the
// finer-grained roll-up; `outOfSync` flags a direct value that disagrees with
// what its sub-periods compute to, so the table can mark it.
export interface ResolvedKpiValue {
  displayValue: KpiScalar;
  source: 'direct' | 'computed';
  computedValue: KpiScalar | null;
  outOfSync: boolean;
}

export type CreateCustomKpiResult = { publicId: string } | { error: string };

export interface CustomKpiUsage {
  valueCount: number;
  portcoValueCount: number;
  pendingRequestCount: number;
}

// One metric row in the KPI tables: values keyed by the pack (column) they
// appeared in.
export interface KpiMetric {
  code: string;
  label: string;
  category: string;
  sortOrder: number;
  valuesByPack: Map<number, ReportingKpiValue>;
}

// The granularity the KPI views pivot on. Monthly reads extraction-written
// cells; quarterly and annual roll the finer grains up.
export type KpiPeriodView = 'monthly' | 'quarterly' | 'annual';

export interface KpiPeriod {
  year: number;
  quarter: number | null;
  month: number | null;
  key: string;
  label: string;
}

// KPI UPDATES (audit log) — the append-only feed backed by inv_reporting_event.
export type KpiEventType =
  | 'request_sent'
  | 'reminder_sent'
  | 'recipient_added'
  | 'submission_received'
  | 'submission_revised'
  | 'kpi_value_edited';

export type ReportingType = 'kpi' | 'reporting_pack';

export interface RequestSentPayload {
  requestType: ReportingType;
  periodYear: number;
  periodQuarter: number | null;
  recipients: string[];
  kpiCount: number;
  docCount: number;
}

export interface ReminderSentPayload {
  requestType: ReportingType;
  periodYear: number;
  periodQuarter: number | null;
}

export interface RecipientAddedPayload {
  email: string;
  requestType: ReportingType;
  periodYear: number;
  periodQuarter: number | null;
}

export interface SubmissionReceivedPayload {
  submissionType: ReportingType;
  periodYear: number;
  periodQuarter: number | null;
  submissionId: number;
}

// An investor edit to a KPI value (standard or custom), keyed by the unified
// inv_kpi id with the label carried for display. `periodMonth` is optional
// because the feed is append-only: events written before monthly editing
// existed carry no month, and a missing one reads as quarterly/annual.
export interface KpiValueEditedPayload {
  kpiId: number;
  label: string;
  periodYear: number;
  periodQuarter: number | null;
  periodMonth?: number | null;
  previousValue: number | string | null;
  newValue: number | string | null;
}

export type KpiEventPayload =
  | RequestSentPayload
  | ReminderSentPayload
  | RecipientAddedPayload
  | SubmissionReceivedPayload
  | KpiValueEditedPayload;

// How many KPIs a 'kpi' submission carries vs how many its period's request
// asked for, so the UI can render e.g. "Partially submitted (5 of 8 KPIs)".
export interface SubmissionCounts {
  submittedCount: number;
  requestedCount: number;
}

export interface KpiEvent {
  id: number;
  eventType: KpiEventType;
  actorUserId: string | null;
  actorName: string | null;
  payload: KpiEventPayload;
  createdAt: string;
  // Present only on 'submission_received' events (kpi or reporting_pack) that
  // have a request baseline for their period.
  submittedCount?: number;
  requestedCount?: number;
}
