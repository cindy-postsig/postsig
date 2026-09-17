import { ContractActivityType } from '@/constants/types';
import { loadContractActivities } from '@/lib/v2/contracts/activities';

function createQuery(result: unknown) {
  const query: Record<string, jest.Mock> = {};
  const chain = () => jest.fn(() => query);

  query.select = chain();
  query.eq = chain();
  query.in = chain();
  query.contains = chain();
  query.order = jest.fn(async () => result);

  return query;
}

describe('contract activities', () => {
  it('merges integration sync status changes into the contract activity feed', async () => {
    const storedActivitiesQuery = createQuery({
      data: [
        {
          id: 2,
          activity_type: ContractActivityType.INVOICE_IMPORTED,
          activity_data: {
            provider: 'ramp',
            external_invoice_id: 'bill-a',
          },
          created_at: '2026-05-27T10:15:00.000Z',
          user_id: 'user-a',
          users: { name: 'Alice', email: 'alice@example.com' },
        },
        {
          id: 1,
          activity_type: ContractActivityType.INVOICE_STATUS_CHANGED,
          activity_data: { oldStatus: 'review', newStatus: 'approved' },
          created_at: '2026-05-27T10:00:00.000Z',
          user_id: 'user-a',
          users: { name: 'Alice', email: 'alice@example.com' },
        },
      ],
      error: null,
    });
    const syncLogsQuery = createQuery({
      data: [
        {
          id: 10,
          created_at: '2026-05-27T10:30:00.000Z',
          completed_at: '2026-05-27T10:31:00.000Z',
          user_id: 'user-a',
          provider: 'xero',
          sync_type: 'outbound',
          status: 'success',
          details: {
            event: 'invoice_status_updated',
            contract_id: 42,
            invoice_status_old: 'approved',
            invoice_status_new: 'void',
            external_status_old: 'AUTHORISED',
            external_status_new: 'VOIDED',
            actor_name: 'Alice',
          },
        },
        {
          id: 11,
          created_at: '2026-05-27T11:00:00.000Z',
          completed_at: '2026-05-27T11:01:00.000Z',
          user_id: 'connection-owner',
          provider: 'xero',
          sync_type: 'inbound',
          status: 'success',
          details: {
            event: 'external_invoice_status_changed',
            contract_id: 42,
            external_invoice_id: 'invoice-a',
            external_status_old: 'AUTHORISED',
            external_status_new: 'PAID',
          },
        },
      ],
      error: null,
    });
    const supabase = {
      from: jest.fn((table: string) =>
        table === 'activities' ? storedActivitiesQuery : syncLogsQuery,
      ),
    };

    const activities = await loadContractActivities(supabase as any, 42);

    expect(syncLogsQuery.eq).toHaveBeenCalledWith(
      'details->>contract_id',
      '42',
    );
    expect(activities.map((activity) => activity.activity_type)).toEqual([
      ContractActivityType.EXTERNAL_INVOICE_STATUS_CHANGED,
      ContractActivityType.INVOICE_STATUS_SYNCED,
      ContractActivityType.INVOICE_IMPORTED,
      ContractActivityType.INVOICE_STATUS_CHANGED,
    ]);
    expect(activities[0]).toMatchObject({
      id: 'integration_sync_log:11',
      user_id: '',
      users: null,
      activity_data: {
        provider: 'xero',
        syncType: 'inbound',
        syncStatus: 'success',
        external_invoice_id: 'invoice-a',
      },
    });
    expect(activities[1]).toMatchObject({
      id: 'integration_sync_log:10',
      user_id: 'user-a',
      users: null,
      activity_data: {
        actor_name: 'Alice',
        invoice_status_old: 'approved',
        invoice_status_new: 'void',
      },
    });
  });

  it('ignores sync logs without supported contract status events', async () => {
    const storedActivitiesQuery = createQuery({ data: [], error: null });
    const syncLogsQuery = createQuery({
      data: [
        {
          id: 12,
          created_at: '2026-05-27T11:00:00.000Z',
          completed_at: null,
          provider: 'xero',
          sync_type: 'inbound',
          status: 'success',
          details: { event: 'invoice_created', contract_id: 42 },
        },
        {
          id: 13,
          created_at: '2026-05-27T11:05:00.000Z',
          completed_at: null,
          provider: 'xero',
          sync_type: 'inbound',
          status: 'success',
          details: null,
        },
      ],
      error: null,
    });
    const supabase = {
      from: jest.fn((table: string) =>
        table === 'activities' ? storedActivitiesQuery : syncLogsQuery,
      ),
    };

    await expect(loadContractActivities(supabase as any, 42)).resolves.toEqual(
      [],
    );
  });
});
