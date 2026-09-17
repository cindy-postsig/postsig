import { normalizeIntegrationSettingsPayload } from '@/app/api/v2/handlers/integrations/settings';
import { mapIntegrationRecentRuns } from '@/lib/v2/integrations/settings-service';

describe('integration settings handler', () => {
  it('maps camelCase setting keys to DB columns', () => {
    expect(
      normalizeIntegrationSettingsPayload({
        syncEnabled: false,
        importNewInvoices: false,
        trackUnpaidInvoices: true,
      }),
    ).toEqual({
      sync_enabled: false,
      import_new_invoices: false,
      track_unpaid_invoices: true,
    });
  });

  it('accepts snake_case scope keys sent by the provider catalog', () => {
    expect(
      normalizeIntegrationSettingsPayload({
        import_new_invoices: false,
        track_unpaid_invoices: false,
      }),
    ).toEqual({
      import_new_invoices: false,
      track_unpaid_invoices: false,
    });
  });

  it('ignores unsupported and non-boolean values', () => {
    expect(
      normalizeIntegrationSettingsPayload({
        import_new_invoices: 'false',
        unknown: false,
      }),
    ).toEqual({});
  });

  it('maps sync logs to recent runs with duration', () => {
    expect(
      mapIntegrationRecentRuns([
        {
          id: 123,
          integration_connection_id: 'connection-1',
          provider: 'xero',
          sync_type: 'inbound',
          status: 'success',
          records_processed: 4,
          error_details: null,
          started_at: '2026-06-12T10:00:00.000Z',
          completed_at: '2026-06-12T10:00:02.500Z',
          created_at: '2026-06-12T10:00:02.600Z',
        },
      ]),
    ).toEqual([
      {
        id: 123,
        status: 'success',
        startedAt: '2026-06-12T10:00:00.000Z',
        completedAt: '2026-06-12T10:00:02.500Z',
        recordsProcessed: 4,
        durationMs: 2500,
        errorDetails: null,
      },
    ]);
  });
});
