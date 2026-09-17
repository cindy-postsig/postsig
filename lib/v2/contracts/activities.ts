import { cache } from 'react';
import { createClient } from '@/utils/supabase/service_server';
import { ContractActivityType } from '@/constants/types';
import logger from '@/utils/pino';
import { getUserMetadata } from '@/data/users';
import { attachAllocationActivityNames } from '@/lib/v2/cost-allocation/activity-names';

export interface ContractActivity {
  id: string;
  activity_type: ContractActivityType;
  activity_data: unknown;
  created_at: string;
  user_id: string;
  user_name?: string;
  /** User who performed the activity. Named 'users' for backwards compatibility with existing components. */
  users?: {
    name: string | null;
    email: string | null;
  } | null;
}

export interface ActivitiesResult {
  activities: ContractActivity[];
  count: number;
}

// Activity types to include in the contract detail view
const CONTRACT_DETAIL_ACTIVITY_TYPES = [
  ContractActivityType.CONTRACT_UPLOADED,
  ContractActivityType.WILL_NOT_RENEW,
  ContractActivityType.CONTRACT_STATUS_CHANGED,
  ContractActivityType.INVOICE_IMPORTED,
  ContractActivityType.INVOICE_STATUS_CHANGED,
  ContractActivityType.OWNER_CHANGED,
  ContractActivityType.USER_CHANGED,
  ContractActivityType.CONTRACT_FOLDER_ASSIGNED,
  ContractActivityType.CONTRACT_SHARED,
  ContractActivityType.CONTRACT_UNSHARED,
  ContractActivityType.FOLDER_RENAMED,
  ContractActivityType.FOLDER_SHARED,
  ContractActivityType.FOLDER_UNSHARED,
  ContractActivityType.EXECUTED_CONTRACT_UPLOADED,
  ContractActivityType.CONTRACT_EDITED,
  ContractActivityType.CONTRACT_FIELD_REVERTED,
  ContractActivityType.PRODUCT_EDITED,
  ContractActivityType.PRODUCT_FIELD_REVERTED,
  ContractActivityType.USER_ADDED,
  ContractActivityType.ALLOCATION_CHANGED,
  ContractActivityType.DOCUMENT_TRANSLATED,
  ContractActivityType.DOCUMENT_TRANSLATION_QUOTA_EXCEEDED,
];

const SYNC_LOG_ACTIVITY_EVENTS = [
  'external_invoice_status_changed',
  'invoice_status_updated',
];

type ActivityClient = ReturnType<typeof createClient>;

type IntegrationSyncLogRow = {
  id: number | string;
  created_at?: string | null;
  completed_at?: string | null;
  user_id?: string | null;
  provider?: string | null;
  sync_type?: string | null;
  status?: string | null;
  details?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapIntegrationSyncLogToActivity(
  log: IntegrationSyncLogRow,
): ContractActivity | null {
  if (!isRecord(log.details)) {
    return null;
  }

  const event = log.details.event;
  if (typeof event !== 'string' || !SYNC_LOG_ACTIVITY_EVENTS.includes(event)) {
    return null;
  }

  const activityType =
    event === 'external_invoice_status_changed'
      ? ContractActivityType.EXTERNAL_INVOICE_STATUS_CHANGED
      : ContractActivityType.INVOICE_STATUS_SYNCED;
  const isOutbound = log.sync_type === 'outbound';

  return {
    id: `integration_sync_log:${log.id}`,
    activity_type: activityType,
    activity_data: {
      ...log.details,
      provider: log.provider ?? null,
      syncType: log.sync_type ?? null,
      syncStatus: log.status ?? null,
      syncLogId: log.id,
    },
    created_at: log.completed_at || log.created_at || '',
    user_id: isOutbound && log.user_id ? log.user_id : '',
    users: null,
  };
}

function sortActivitiesByCreatedAt(
  activities: ContractActivity[],
): ContractActivity[] {
  return [...activities].sort((a, b) => {
    const aTime = Date.parse(a.created_at);
    const bTime = Date.parse(b.created_at);

    return (
      (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime)
    );
  });
}

async function loadStoredActivities(
  supabase: ActivityClient,
  contractId: number,
): Promise<ContractActivity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select(
      `
      id,
      activity_type,
      activity_data,
      created_at,
      user_id,
      users:user_id (
        name,
        email
      )
    `,
    )
    .eq('contract_id', contractId)
    .in('activity_type', CONTRACT_DETAIL_ACTIVITY_TYPES)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ error, contractId }, 'Error loading activities');
    throw new Error('Failed to load audit log');
  }

  return (data || []).map((item) => {
    const users = item.users as ContractActivity['users'];

    return {
      id: String(item.id),
      activity_type: item.activity_type as ContractActivityType,
      activity_data: item.activity_data || {},
      created_at: item.created_at || '',
      user_id: item.user_id || '',
      user_name: users?.name || users?.email || undefined,
      users,
    };
  });
}

async function loadIntegrationSyncLogActivities(
  supabase: ActivityClient,
  contractId: number,
): Promise<ContractActivity[]> {
  const { data, error } = await (supabase.from('integration_sync_logs') as any)
    .select(
      `
      id,
      created_at,
      completed_at,
      user_id,
      provider,
      sync_type,
      status,
      details
    `,
    )
    .eq('details->>contract_id', String(contractId))
    .order('created_at', { ascending: false });

  if (error) {
    logger.error(
      { error, contractId },
      'Error loading integration sync activities',
    );
    return [];
  }

  return ((data || []) as IntegrationSyncLogRow[])
    .map(mapIntegrationSyncLogToActivity)
    .filter((activity): activity is ContractActivity => activity !== null);
}

export async function loadContractActivities(
  supabase: ActivityClient,
  contractId: number,
): Promise<ContractActivity[]> {
  const [storedActivities, syncActivities] = await Promise.all([
    loadStoredActivities(supabase, contractId),
    loadIntegrationSyncLogActivities(supabase, contractId),
  ]);

  return sortActivitiesByCreatedAt([...storedActivities, ...syncActivities]);
}

/**
 * Get activities for a contract.
 * Returns audit log entries for contract-related events.
 * Cached per request for deduplication.
 */
export const getContractActivities = cache(
  async (contractId: number): Promise<ActivitiesResult> => {
    try {
      const supabase = createClient();

      const loaded = await loadContractActivities(supabase, contractId);
      const organizationId = (await getUserMetadata())?.organizationId;
      const activities = organizationId
        ? await attachAllocationActivityNames(loaded, organizationId, supabase)
        : loaded;

      return {
        activities,
        count: activities.length,
      };
    } catch (err) {
      logger.error({ error: err, contractId }, 'Error loading activities');
      throw new Error('Failed to load audit log');
    }
  },
);
