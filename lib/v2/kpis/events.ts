import { cache } from 'react';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import type { Json } from '@/database.types';
import logger from '@/utils/pino';
import { deriveSubmissionCounts, toKpiEvent } from './transforms';
import type {
  KpiEvent,
  RecipientAddedPayload,
  ReminderSentPayload,
  ReportingType,
  RequestSentPayload,
  KpiValueEditedPayload,
  SubmissionCounts,
  SubmissionReceivedPayload,
} from './types';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// submission_received is emitted by the DB trigger (the portco app writes
// submissions via the service role and can't call this), so it is intentionally
// absent from the events TS helpers write.
export type LogKpiEventInput = {
  companyId: number;
  organizationId: string;
  actorUserId: string | null;
} & (
  | { eventType: 'request_sent'; payload: RequestSentPayload }
  | { eventType: 'reminder_sent'; payload: ReminderSentPayload }
  | { eventType: 'recipient_added'; payload: RecipientAddedPayload }
  | { eventType: 'kpi_value_edited'; payload: KpiValueEditedPayload }
);

// Best-effort: audit logging must never fail the parent operation. A failed
// insert is logged and swallowed.
export async function logKpiEvent(input: LogKpiEventInput): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('inv_reporting_event').insert({
      organization_id: input.organizationId,
      company_id: input.companyId,
      event_type: input.eventType,
      actor_user_id: input.actorUserId,
      payload: input.payload as unknown as Json,
    });
    if (error) {
      logger.error(
        { error, eventType: input.eventType, companyId: input.companyId },
        'Failed to log KPI event',
      );
    }
  } catch (error) {
    logger.error(
      { error, eventType: input.eventType, companyId: input.companyId },
      'Failed to log KPI event',
    );
  }
}

const periodKey = (year: number, quarter: number | null): string =>
  `${year}-${quarter ?? 'FY'}`;

// Portco submitters aren't visible to the investor through RLS, so resolve names
// via the service client (mirrors getOrgPortcoUsers); the ids come from already
// org-scoped event rows.
async function resolveActorNames(
  actorIds: string[],
): Promise<Map<string, string | null>> {
  if (actorIds.length === 0) return new Map();
  const admin = createServiceClient();
  const { data, error } = await admin
    .from('users')
    .select('id, name, email')
    .in('id', actorIds);
  if (error) {
    logger.error({ error }, 'Failed to resolve KPI event actor names');
    return new Map();
  }
  return new Map((data ?? []).map((u) => [u.id, u.name || u.email || null]));
}

// Tally rows per submission. Investor-origin KPI values carry a null
// submission_id (they aren't part of a portco submission), so they're skipped
// and only submitted items count toward a submission's total.
function countBySubmissionId(
  rows: { submission_id: number | null }[] | null,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const r of rows ?? []) {
    if (r.submission_id == null) continue;
    counts.set(r.submission_id, (counts.get(r.submission_id) ?? 0) + 1);
  }
  return counts;
}

// For every kpi/reporting_pack submission_received event, pair the submission's
// stored item count (KPI values / documents) with its period's requested count.
// Keyed by event id.
async function deriveSubmissionCountsByEventId(
  supabase: ServerClient,
  companyId: number,
  rows: { id: number; event_type: string; payload: unknown }[],
): Promise<Map<number, SubmissionCounts>> {
  const submissionEvents = rows
    .filter((r) => r.event_type === 'submission_received')
    .map((r) => ({ id: r.id, payload: r.payload as SubmissionReceivedPayload }))
    .filter(
      (r) =>
        r.payload?.submissionType === 'kpi' ||
        r.payload?.submissionType === 'reporting_pack',
    );
  if (submissionEvents.length === 0) return new Map();

  const submissionIdsFor = (type: ReportingType): number[] =>
    Array.from(
      new Set(
        submissionEvents
          .filter((r) => r.payload.submissionType === type)
          .map((r) => r.payload.submissionId)
          .filter((id): id is number => typeof id === 'number'),
      ),
    );

  const [{ data: kpiValues }, { data: packDocs }, { data: requests }] =
    await Promise.all([
      supabase
        .from('inv_kpi_value')
        .select('submission_id')
        .in('submission_id', submissionIdsFor('kpi')),
      supabase
        .from('inv_reporting_document')
        .select('submission_id')
        .eq('is_deleted', false)
        .in('submission_id', submissionIdsFor('reporting_pack')),
      supabase
        .from('inv_reporting_request')
        .select(
          'request_type, period_year, period_quarter, inv_reporting_request_kpi(count), inv_reporting_request_document(count)',
        )
        .eq('company_id', companyId)
        .in('request_type', ['kpi', 'reporting_pack']),
    ]);

  const submittedByType: Record<ReportingType, Map<number, number>> = {
    kpi: countBySubmissionId(kpiValues),
    reporting_pack: countBySubmissionId(packDocs),
  };

  const requestedByType: Record<ReportingType, Map<string, number>> = {
    kpi: new Map(),
    reporting_pack: new Map(),
  };
  for (const req of requests ?? []) {
    const type = req.request_type as ReportingType;
    const requested =
      type === 'reporting_pack'
        ? (req.inv_reporting_request_document?.[0]?.count ?? 0)
        : (req.inv_reporting_request_kpi?.[0]?.count ?? 0);
    requestedByType[type].set(
      periodKey(req.period_year, req.period_quarter),
      requested,
    );
  }

  const byEventId = new Map<number, SubmissionCounts>();
  for (const r of submissionEvents) {
    const type = r.payload.submissionType;
    const submittedCount =
      submittedByType[type].get(r.payload.submissionId) ?? 0;
    const requestedCount =
      requestedByType[type].get(
        periodKey(r.payload.periodYear, r.payload.periodQuarter),
      ) ?? null;
    const counts = deriveSubmissionCounts(submittedCount, requestedCount);
    if (counts) byEventId.set(r.id, counts);
  }
  return byEventId;
}

// The "KPI Updates" feed for a company, newest first. Org-scoped by RLS via the
// user client and filtered by company, mirroring getCompanyReporting.
export const getKpiEvents = cache(
  async (companyId: number): Promise<KpiEvent[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('inv_reporting_event')
      .select('id, event_type, actor_user_id, payload, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(200);

    if (error) {
      logger.error({ error, companyId }, 'Failed to fetch KPI events');
      return [];
    }
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const actorIds = Array.from(
      new Set(
        rows
          .map((r) => r.actor_user_id)
          .filter((id): id is string => id !== null),
      ),
    );

    const [actorNames, countsByEventId] = await Promise.all([
      resolveActorNames(actorIds),
      deriveSubmissionCountsByEventId(supabase, companyId, rows),
    ]);

    return rows.map((r) =>
      toKpiEvent(
        r,
        r.actor_user_id ? (actorNames.get(r.actor_user_id) ?? null) : null,
        countsByEventId.get(r.id) ?? null,
      ),
    );
  },
);
