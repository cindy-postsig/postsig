import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({}),
}));

jest.mock('@/lib/v2/kpis/events', () => ({
  logKpiEvent: jest.fn(),
}));

let priorRows: Array<{
  origin: string;
  value_numeric: number | null;
  value_text: string | null;
}> = [];
let kpiLookup: {
  id: number;
  value_type: string;
  is_active: boolean;
  label: string;
} | null = { id: 7, value_type: 'percent', is_active: true, label: 'NRR' };

jest.mock('@/utils/supabase/server', () => {
  const createClient = () => {
    let table = '';
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      upsert: () => Promise.resolve({ error: null }),
      delete: () => builder,
      maybeSingle: () =>
        Promise.resolve({
          data: table === 'inv_kpi' ? kpiLookup : null,
          error: null,
        }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({
          data: table === 'inv_kpi_value' ? priorRows : null,
          error: null,
        }),
    });
    return {
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }),
      },
      from: (t: string) => {
        table = t;
        return builder;
      },
    };
  };
  return { createClient };
});

import {
  deriveSubmissionCounts,
  describeKpiEvent,
  describeRequestRecipients,
  formatEditScalar,
  formatEventDate,
  formatEventPeriod,
  isKpiValueEditedEvent,
  isRequestSentEvent,
  requestKindLabel,
  toKpiEvent,
  type RawKpiEventRow,
} from '@/lib/v2/kpis/transforms';
import type {
  KpiEvent,
  KpiEventPayload,
  KpiEventType,
  RequestSentPayload,
} from '@/lib/v2/kpis/types';
import { setKpiValue } from '@/lib/v2/kpis/custom-kpis';
import { logKpiEvent } from '@/lib/v2/kpis/events';

const mockLog = jest.mocked(logKpiEvent);

describe('deriveSubmissionCounts', () => {
  it('reports a fully satisfied submission', () => {
    expect(deriveSubmissionCounts(8, 8)).toEqual({
      submittedCount: 8,
      requestedCount: 8,
    });
  });

  it('reports a partial submission', () => {
    expect(deriveSubmissionCounts(5, 8)).toEqual({
      submittedCount: 5,
      requestedCount: 8,
    });
  });

  it('returns null when there is no request baseline (self-serve)', () => {
    expect(deriveSubmissionCounts(5, null)).toBeNull();
  });
});

describe('toKpiEvent', () => {
  const row: RawKpiEventRow = {
    id: 3,
    event_type: 'request_sent',
    actor_user_id: 'u1',
    payload: { requestType: 'kpi' },
    created_at: '2026-07-14T00:00:00Z',
  };

  it('maps a stored row into the read model without counts', () => {
    expect(toKpiEvent(row, 'Alice', null)).toEqual({
      id: 3,
      eventType: 'request_sent',
      actorUserId: 'u1',
      actorName: 'Alice',
      payload: { requestType: 'kpi' },
      createdAt: '2026-07-14T00:00:00Z',
    });
  });

  it('folds partial-submission counts onto the event', () => {
    const event = toKpiEvent(
      { ...row, event_type: 'submission_received' },
      null,
      { submittedCount: 5, requestedCount: 8 },
    );
    expect(event.submittedCount).toBe(5);
    expect(event.requestedCount).toBe(8);
    expect(event.actorName).toBeNull();
  });
});

describe('describeKpiEvent', () => {
  const build = (
    eventType: KpiEventType,
    payload: KpiEventPayload,
    counts?: { submittedCount: number; requestedCount: number },
  ): KpiEvent => ({
    id: 1,
    eventType,
    actorUserId: null,
    actorName: null,
    payload,
    createdAt: '2026-07-14T00:00:00Z',
    ...counts,
  });

  it('describes a KPI request with pluralized recipients', () => {
    expect(
      describeKpiEvent(
        build('request_sent', {
          requestType: 'kpi',
          periodYear: 2026,
          periodQuarter: 1,
          recipients: ['a@x.com', 'b@x.com'],
          kpiCount: 3,
          docCount: 0,
        }),
      ),
    ).toBe('KPI request sent to 2 recipients');
  });

  it('describes a reporting pack request with a single recipient', () => {
    expect(
      describeKpiEvent(
        build('request_sent', {
          requestType: 'reporting_pack',
          periodYear: 2026,
          periodQuarter: 1,
          recipients: ['a@x.com'],
          kpiCount: 0,
          docCount: 2,
        }),
      ),
    ).toBe('Reporting pack request sent to 1 recipient');
  });

  it('describes a reminder per request type', () => {
    expect(
      describeKpiEvent(
        build('reminder_sent', {
          requestType: 'kpi',
          periodYear: 2026,
          periodQuarter: 2,
        }),
      ),
    ).toBe('Reminder sent for KPI request');
    expect(
      describeKpiEvent(
        build('reminder_sent', {
          requestType: 'reporting_pack',
          periodYear: 2026,
          periodQuarter: 2,
        }),
      ),
    ).toBe('Reminder sent for reporting pack request');
  });

  it('describes an added recipient', () => {
    expect(
      describeKpiEvent(
        build('recipient_added', {
          email: 'new@x.com',
          requestType: 'kpi',
          periodYear: 2026,
          periodQuarter: null,
        }),
      ),
    ).toBe('Recipient added: new@x.com');
  });

  it('describes a full KPI submission when counts are absent', () => {
    expect(
      describeKpiEvent(
        build('submission_received', {
          submissionType: 'kpi',
          periodYear: 2026,
          periodQuarter: 1,
          submissionId: 9,
        }),
      ),
    ).toBe('KPIs submitted');
  });

  it('describes a full KPI submission when submitted meets requested', () => {
    expect(
      describeKpiEvent(
        build(
          'submission_received',
          {
            submissionType: 'kpi',
            periodYear: 2026,
            periodQuarter: 1,
            submissionId: 9,
          },
          { submittedCount: 8, requestedCount: 8 },
        ),
      ),
    ).toBe('KPIs submitted');
  });

  it('describes a partial KPI submission', () => {
    expect(
      describeKpiEvent(
        build(
          'submission_received',
          {
            submissionType: 'kpi',
            periodYear: 2026,
            periodQuarter: 1,
            submissionId: 9,
          },
          { submittedCount: 5, requestedCount: 8 },
        ),
      ),
    ).toBe('KPIs partially submitted (5 of 8)');
  });

  it('describes a reporting pack submission', () => {
    expect(
      describeKpiEvent(
        build('submission_received', {
          submissionType: 'reporting_pack',
          periodYear: 2026,
          periodQuarter: 1,
          submissionId: 9,
        }),
      ),
    ).toBe('Reporting pack submitted');
  });

  it('describes a partial reporting pack submission', () => {
    expect(
      describeKpiEvent(
        build(
          'submission_received',
          {
            submissionType: 'reporting_pack',
            periodYear: 2026,
            periodQuarter: 1,
            submissionId: 9,
          },
          { submittedCount: 1, requestedCount: 2 },
        ),
      ),
    ).toBe('Reporting pack partially submitted (1 of 2)');
  });

  it('describes a full reporting pack submission when submitted meets requested', () => {
    expect(
      describeKpiEvent(
        build(
          'submission_received',
          {
            submissionType: 'reporting_pack',
            periodYear: 2026,
            periodQuarter: 1,
            submissionId: 9,
          },
          { submittedCount: 2, requestedCount: 2 },
        ),
      ),
    ).toBe('Reporting pack submitted');
  });

  it('describes a revised KPI submission', () => {
    expect(
      describeKpiEvent(
        build('submission_revised', {
          submissionType: 'kpi',
          periodYear: 2026,
          periodQuarter: 1,
          submissionId: 9,
        }),
      ),
    ).toBe('KPIs revised');
  });

  it('describes a revised reporting pack submission', () => {
    expect(
      describeKpiEvent(
        build('submission_revised', {
          submissionType: 'reporting_pack',
          periodYear: 2026,
          periodQuarter: 1,
          submissionId: 9,
        }),
      ),
    ).toBe('Reporting pack revised');
  });

  it('calls a monthly edit by its label, not "Annual"', () => {
    expect(
      describeKpiEvent(
        build('kpi_value_edited', {
          kpiId: 7,
          label: 'ARR',
          periodYear: 2026,
          periodQuarter: null,
          periodMonth: 3,
          previousValue: 100,
          newValue: 120,
        }),
      ),
    ).toBe('ARR updated');
  });

  it('describes a KPI value edit using the label', () => {
    expect(
      describeKpiEvent(
        build('kpi_value_edited', {
          kpiId: 7,
          label: 'ARR',
          periodYear: 2026,
          periodQuarter: 2,
          previousValue: 100,
          newValue: 120,
        }),
      ),
    ).toBe('ARR updated');
  });

  it('calls out an annual KPI value edit', () => {
    expect(
      describeKpiEvent(
        build('kpi_value_edited', {
          kpiId: 7,
          label: 'ARR',
          periodYear: 2026,
          periodQuarter: null,
          previousValue: 100,
          newValue: 120,
        }),
      ),
    ).toBe('Annual ARR updated');
  });

  it('describes a first-time value entry as set, not updated', () => {
    expect(
      describeKpiEvent(
        build('kpi_value_edited', {
          kpiId: 7,
          label: 'ARR',
          periodYear: 2026,
          periodQuarter: null,
          previousValue: null,
          newValue: 120,
        }),
      ),
    ).toBe('Annual ARR set');
  });
});

describe('requestKindLabel', () => {
  it('labels a KPI request', () => {
    expect(requestKindLabel('kpi')).toBe('KPI request');
  });

  it('labels a reporting pack request', () => {
    expect(requestKindLabel('reporting_pack')).toBe('Reporting pack request');
  });
});

describe('describeRequestRecipients', () => {
  const payload = (recipients: string[]): RequestSentPayload => ({
    requestType: 'kpi',
    periodYear: 2026,
    periodQuarter: 1,
    recipients,
    kpiCount: 0,
    docCount: 0,
  });

  it('shows a single recipient inline with no overflow', () => {
    expect(describeRequestRecipients(payload(['a@x.com']))).toEqual({
      kind: 'KPI request',
      primary: 'a@x.com',
      overflowCount: 0,
      all: ['a@x.com'],
    });
  });

  it('collapses everyone after the first into the overflow count', () => {
    expect(
      describeRequestRecipients(payload(['a@x.com', 'b@x.com', 'c@x.com'])),
    ).toEqual({
      kind: 'KPI request',
      primary: 'a@x.com',
      overflowCount: 2,
      all: ['a@x.com', 'b@x.com', 'c@x.com'],
    });
  });

  it('handles an empty recipient list without a primary', () => {
    expect(describeRequestRecipients(payload([]))).toEqual({
      kind: 'KPI request',
      primary: null,
      overflowCount: 0,
      all: [],
    });
  });
});

describe('formatEventPeriod', () => {
  it('formats a full-year period', () => {
    expect(formatEventPeriod(2026, null)).toBe('2026');
  });

  it('formats a quarterly period', () => {
    expect(formatEventPeriod(2026, 3)).toBe('Q3 2026');
  });
});

describe('formatEventDate', () => {
  it('renders local date, time, and timezone (matching the audit log)', () => {
    // Zone/offset vary by host, so assert structure rather than an exact
    // string, e.g. "2026-07-14 | 8:00 AM EDT".
    expect(formatEventDate('2026-07-14T12:00:00Z')).toMatch(
      /^\d{4}-\d{2}-\d{2} \| \d{1,2}:\d{2}\s(AM|PM)\s.+/,
    );
  });

  it('renders the date part in the viewer’s date-format pattern', () => {
    expect(formatEventDate('2026-07-14T12:00:00Z', 'dd/MM/yyyy')).toMatch(
      /^\d{2}\/\d{2}\/2026 \| \d{1,2}:\d{2}\s(AM|PM)\s.+/,
    );
  });

  it('falls back to the raw timestamp when it cannot be parsed', () => {
    expect(formatEventDate('not-a-date', 'dd/MM/yyyy')).toBe('not-a-date');
  });
});

describe('isRequestSentEvent', () => {
  const event = (eventType: KpiEventType): KpiEvent => ({
    id: 1,
    eventType,
    actorUserId: null,
    actorName: null,
    payload: {} as KpiEventPayload,
    createdAt: '2026-07-14T00:00:00Z',
  });

  it('is true for request_sent events', () => {
    expect(isRequestSentEvent(event('request_sent'))).toBe(true);
  });

  it('is false for other event types', () => {
    expect(isRequestSentEvent(event('reminder_sent'))).toBe(false);
  });

  it('isKpiValueEditedEvent matches only kpi_value_edited', () => {
    expect(isKpiValueEditedEvent(event('kpi_value_edited'))).toBe(true);
    expect(isKpiValueEditedEvent(event('request_sent'))).toBe(false);
  });
});

describe('formatEditScalar', () => {
  it('formats numbers through the KPI display formatter when the type is known', () => {
    expect(formatEditScalar(1_000_000, 'currency')).toBe('$1,000,000');
    expect(formatEditScalar(72, 'percent')).toBe('72%');
    expect(formatEditScalar(2_547_832.46, 'currency')).toBe('$2,547,832.46');
  });

  it('falls back to locale grouping when the KPI definition is gone', () => {
    expect(formatEditScalar(1_000_000, undefined)).toBe('1,000,000');
  });

  it('passes text through with or without a known type', () => {
    expect(formatEditScalar('Q3 2026', 'text')).toBe('Q3 2026');
    expect(formatEditScalar('Q3 2026', undefined)).toBe('Q3 2026');
  });

  it('renders null (cleared / first entry) as a dash', () => {
    expect(formatEditScalar(null, 'currency')).toBe('–');
  });
});

describe('setKpiValue audit logging', () => {
  const caller = { userId: 'user-1', organizationId: 'org-1', userRole: 11 };
  const valueBase = {
    companyId: 1,
    publicId: '123e4567-e89b-42d3-a456-426614174000',
    periodYear: 2026,
    periodQuarter: 2 as number | null,
    periodMonth: null as number | null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    kpiLookup = { id: 7, value_type: 'percent', is_active: true, label: 'NRR' };
    priorRows = [];
  });

  it('logs a brand-new value with previousValue null', async () => {
    await setKpiValue({ ...valueBase, value: '112%' }, caller);

    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog).toHaveBeenCalledWith({
      companyId: 1,
      organizationId: 'org-1',
      actorUserId: 'user-1',
      eventType: 'kpi_value_edited',
      payload: {
        kpiId: 7,
        label: 'NRR',
        periodYear: 2026,
        periodQuarter: 2,
        periodMonth: null,
        previousValue: null,
        newValue: 112,
      },
    });
  });

  it('records the month a monthly edit was made against', async () => {
    await setKpiValue(
      { ...valueBase, periodQuarter: null, periodMonth: 3, value: '112%' },
      caller,
    );

    expect(mockLog.mock.calls[0][0].payload).toMatchObject({
      periodYear: 2026,
      periodQuarter: null,
      periodMonth: 3,
    });
  });

  it('logs a cleared value with newValue null', async () => {
    priorRows = [{ origin: 'investor', value_numeric: 100, value_text: null }];

    await setKpiValue({ ...valueBase, value: '  ' }, caller);

    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][0].payload).toMatchObject({
      previousValue: 100,
      newValue: null,
    });
  });

  it('uses the portco value as previousValue on a first correction', async () => {
    priorRows = [{ origin: 'portco', value_numeric: 100, value_text: null }];

    await setKpiValue({ ...valueBase, value: '112%' }, caller);

    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][0].payload).toMatchObject({
      previousValue: 100,
      newValue: 112,
    });
  });

  it('logs a cleared correction falling back to the portco value', async () => {
    priorRows = [
      { origin: 'investor', value_numeric: 112, value_text: null },
      { origin: 'portco', value_numeric: 100, value_text: null },
    ];

    await setKpiValue({ ...valueBase, value: '  ' }, caller);

    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][0].payload).toMatchObject({
      previousValue: 112,
      newValue: 100,
    });
  });

  it('skips logging when the value is unchanged', async () => {
    priorRows = [{ origin: 'investor', value_numeric: 112, value_text: null }];

    await setKpiValue({ ...valueBase, value: '112%' }, caller);

    expect(mockLog).not.toHaveBeenCalled();
  });

  it('skips logging when the entered value matches the portco value', async () => {
    priorRows = [{ origin: 'portco', value_numeric: 112, value_text: null }];

    await setKpiValue({ ...valueBase, value: '112%' }, caller);

    expect(mockLog).not.toHaveBeenCalled();
  });
});
