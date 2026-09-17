import { inngest } from '@/utils/inngest/client';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import {
  getIntegrationButtonMode,
  getIntegrationProviderConfig,
  INTEGRATION_CATEGORIES,
  INTEGRATION_PROVIDERS,
  isIntegrationProvider,
  type IntegrationHealthStatus,
  type IntegrationProvider,
} from './catalog';

type SyncLogStatus = 'success' | 'failed' | 'partial';

interface IntegrationConnectionRow {
  id: string;
  organization_id: string;
  user_id: string;
  provider: IntegrationProvider;
  nango_connection_id: string | null;
  auth_provider: 'nango' | 'native_oauth';
  provider_account_id: string | null;
  account_name: string | null;
  status: 'connected' | 'disconnected';
  health_status: IntegrationHealthStatus;
  health_reason: string | null;
  health_detected_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_failed_sync_at: string | null;
  sync_enabled: boolean;
  sync_disabled_at: string | null;
  sync_interval_minutes: number;
  import_new_invoices: boolean;
  track_unpaid_invoices: boolean;
}

export interface IntegrationSyncLogRow {
  id: number;
  integration_connection_id: string | null;
  provider: IntegrationProvider;
  sync_type: 'inbound' | 'outbound';
  status: SyncLogStatus;
  records_processed: number;
  error_details: unknown;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface IntegrationRecentRun {
  id: number;
  status: SyncLogStatus;
  startedAt: string;
  completedAt: string | null;
  recordsProcessed: number;
  durationMs: number | null;
  errorDetails: unknown;
}

export interface IntegrationSummaryItem {
  provider: IntegrationProvider;
  label: string;
  subtitle: string;
  category: keyof typeof INTEGRATION_CATEGORIES;
  connectedBefore: boolean;
  listVisible: boolean;
  marketplaceVisible: boolean;
  buttonMode: 'connect' | 'manage' | 'reconnect';
  status: 'connected' | 'disconnected' | null;
  healthStatus: IntegrationHealthStatus | null;
  healthReason: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastFailedSyncAt: string | null;
  lastSyncStatus: SyncLogStatus | null;
}

export interface IntegrationDetail {
  provider: IntegrationProvider;
  label: string;
  subtitle: string;
  category: keyof typeof INTEGRATION_CATEGORIES;
  supportsManualSync: boolean;
  status: 'connected' | 'disconnected';
  healthStatus: IntegrationHealthStatus;
  healthReason: string | null;
  connectedAt: string | null;
  accountName: string | null;
  providerAccountId: string | null;
  lastSuccessfulSyncAt: string | null;
  syncDisabledAt: string | null;
  syncSettings: {
    syncEnabled: boolean;
    syncIntervalMinutes: number;
    importNewInvoices: boolean;
    trackUnpaidInvoices: boolean;
  };
  scopes: Array<{
    key: string;
    label: string;
    description: string;
    enabled: boolean;
  }>;
  actionRequired: Array<{
    type: 'authentication' | 'rate_limit' | 'error';
    title: string;
    message: string;
    occurredAt: string | null;
    canReconnect: boolean;
  }>;
  recentRuns: IntegrationRecentRun[];
}

function normalizeConnection(row: any): IntegrationConnectionRow {
  return {
    ...row,
    auth_provider: row.auth_provider ?? 'nango',
    health_status:
      row.health_status ??
      (row.status === 'connected' ? 'healthy' : 'disconnected'),
    sync_enabled: row.sync_enabled ?? true,
    sync_disabled_at: row.sync_disabled_at ?? null,
    sync_interval_minutes:
      row.sync_interval_minutes ??
      getIntegrationProviderConfig(row.provider)?.syncIntervalMinutes ??
      30,
    import_new_invoices: row.import_new_invoices ?? true,
    track_unpaid_invoices: row.track_unpaid_invoices ?? true,
  } as IntegrationConnectionRow;
}

async function getLegacyDocuSignConnection(
  userId: string,
): Promise<IntegrationConnectionRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase
    .from('users' as any)
    .select(
      'id, organization_id, docusign_connected, docusign_account_id, updated_at',
    )
    .eq('id', userId)
    .single() as any);

  if (error || !data?.docusign_connected || !data.docusign_account_id) {
    return null;
  }

  return normalizeConnection({
    id: userId,
    organization_id: data.organization_id,
    user_id: userId,
    provider: 'docusign',
    nango_connection_id: null,
    auth_provider: 'native_oauth',
    provider_account_id: data.docusign_account_id,
    account_name: null,
    status: 'connected',
    health_status: 'healthy',
    health_reason: null,
    health_detected_at: null,
    connected_at: data.updated_at ?? null,
    disconnected_at: null,
    last_sync_at: null,
    last_successful_sync_at: null,
    last_failed_sync_at: null,
    sync_enabled: true,
    sync_interval_minutes: 60,
    import_new_invoices: true,
    track_unpaid_invoices: true,
  });
}

function getLogTimestamp(log?: IntegrationSyncLogRow | null): string | null {
  return log?.completed_at ?? log?.started_at ?? null;
}

function stringifyError(errorDetails: unknown): string {
  if (!errorDetails) return '';
  if (typeof errorDetails === 'string') return errorDetails;
  try {
    return JSON.stringify(errorDetails);
  } catch {
    return String(errorDetails);
  }
}

export function classifyIntegrationError(
  errorDetails: unknown,
): 'authentication' | 'rate_limit' | 'error' {
  const message = stringifyError(errorDetails).toLowerCase();
  if (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('auth') ||
    message.includes('token') ||
    message.includes('docusign data incomplete') ||
    message.includes('invalid grant') ||
    message.includes('revoked')
  ) {
    return 'authentication';
  }
  if (
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('rate-limit') ||
    message.includes('too many requests')
  ) {
    return 'rate_limit';
  }
  return 'error';
}

function buildActionMessage(
  type: 'authentication' | 'rate_limit' | 'error',
  providerLabel: string,
  errorDetails: unknown,
): string {
  if (type === 'authentication') {
    return 'Access token expired or revoked. Reconnect the account to resume syncing.';
  }
  if (type === 'rate_limit') {
    return `${providerLabel} API rate limit reached (429). Sync will retry automatically.`;
  }
  return stringifyError(errorDetails) || 'The latest sync failed.';
}

async function getConnections(
  userId: string,
): Promise<IntegrationConnectionRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await (supabase
    .from('integration_connections' as any)
    .select('*')
    .eq('user_id', userId) as any);

  // If integration_connections table is missing or query fails, fall back to
  // legacy-only data so the integrations page still loads.
  if (error) {
    logger.warn(
      { error },
      'Failed to query integration_connections, falling back to legacy',
    );
    const legacy = await getLegacyDocuSignConnection(userId);
    return legacy ? [legacy] : [];
  }
  const connections: IntegrationConnectionRow[] = (data ?? [])
    .filter((row: any) => isIntegrationProvider(row.provider))
    .map(normalizeConnection);

  const legacyDocuSign = await getLegacyDocuSignConnection(userId);
  if (!legacyDocuSign) return connections;

  const docuSignIndex = connections.findIndex(
    (connection) => connection.provider === 'docusign',
  );
  if (docuSignIndex === -1) {
    connections.push(legacyDocuSign);
  } else if (connections[docuSignIndex].status !== 'connected') {
    connections[docuSignIndex] = {
      ...legacyDocuSign,
      id: connections[docuSignIndex].id,
    };
  }

  return connections;
}

async function getRecentLogsForConnections(
  connectionIds: string[],
  limit = 50,
): Promise<IntegrationSyncLogRow[]> {
  if (connectionIds.length === 0) return [];
  const supabase = createServiceClient();
  const { data, error } = await (supabase
    .from('integration_sync_logs' as any)
    .select(
      'id, integration_connection_id, provider, sync_type, status, records_processed, error_details, started_at, completed_at, created_at',
    )
    .in('integration_connection_id', connectionIds)
    .order('started_at', { ascending: false })
    .limit(limit) as any);

  if (error) throw error;
  return (data ?? []) as IntegrationSyncLogRow[];
}

export function mapIntegrationRecentRuns(
  logs: IntegrationSyncLogRow[],
): IntegrationRecentRun[] {
  return logs.map((log) => ({
    id: log.id,
    status: log.status,
    startedAt: log.started_at,
    completedAt: log.completed_at,
    recordsProcessed: log.records_processed,
    durationMs: log.completed_at
      ? new Date(log.completed_at).getTime() -
        new Date(log.started_at).getTime()
      : null,
    errorDetails: log.error_details,
  }));
}

export async function getIntegrationSummary(userId: string): Promise<{
  categories: typeof INTEGRATION_CATEGORIES;
  providers: IntegrationSummaryItem[];
}> {
  const connections = await getConnections(userId);
  const connectionByProvider = new Map(
    connections.map((connection) => [connection.provider, connection]),
  );
  const logs = await getRecentLogsForConnections(
    connections.map((connection) => connection.id),
  );

  const latestLogByConnection = new Map<string, IntegrationSyncLogRow>();
  for (const log of logs) {
    if (
      log.integration_connection_id &&
      !latestLogByConnection.has(log.integration_connection_id)
    ) {
      latestLogByConnection.set(log.integration_connection_id, log);
    }
  }

  return {
    categories: INTEGRATION_CATEGORIES,
    providers: INTEGRATION_PROVIDERS.map((config) => {
      // TODO: Ramp integration is still in progress; keep backend support but hide UI cards until it is ready.
      const isHiddenInUI = config.provider === 'ramp';
      const connection = connectionByProvider.get(config.provider);
      const latestLog = connection
        ? latestLogByConnection.get(connection.id)
        : null;
      const connectedBefore = !!connection;
      const buttonMode = getIntegrationButtonMode({
        connectedBefore,
        status: connection?.status,
        healthStatus: connection?.health_status,
      });
      return {
        provider: config.provider,
        label: config.label,
        subtitle: config.subtitle,
        category: config.category,
        connectedBefore,
        listVisible: connectedBefore && !isHiddenInUI,
        marketplaceVisible: !isHiddenInUI,
        buttonMode,
        status: connection?.status ?? null,
        healthStatus: connection?.health_status ?? null,
        healthReason: connection?.health_reason ?? null,
        connectedAt: connection?.connected_at ?? null,
        lastSyncAt:
          connection?.last_sync_at ?? getLogTimestamp(latestLog) ?? null,
        lastSuccessfulSyncAt: connection?.last_successful_sync_at ?? null,
        lastFailedSyncAt: connection?.last_failed_sync_at ?? null,
        lastSyncStatus: latestLog?.status ?? null,
      };
    }),
  };
}

export async function getIntegrationDetail(params: {
  userId: string;
  provider: string;
}): Promise<IntegrationDetail | null> {
  if (!isIntegrationProvider(params.provider)) return null;
  const config = getIntegrationProviderConfig(params.provider);
  if (!config) return null;

  const supabase = createServiceClient();
  const { data, error } = await (supabase
    .from('integration_connections' as any)
    .select('*')
    .eq('user_id', params.userId)
    .eq('provider', params.provider)
    .single() as any);

  let connection: IntegrationConnectionRow | null = null;
  if (!error && data) {
    connection = normalizeConnection(data);
  }
  if (params.provider === 'docusign') {
    const legacyDocuSign = await getLegacyDocuSignConnection(params.userId);
    if (legacyDocuSign && connection?.status !== 'connected') {
      connection = connection
        ? { ...legacyDocuSign, id: connection.id }
        : legacyDocuSign;
    }
  }
  if (!connection) return null;

  const logs = await getRecentLogsForConnections([connection.id], 10);
  const latestRunStatus = logs[0]?.status ?? null;
  const showActionRequired =
    connection.health_status === 'needs_reconnect' ||
    latestRunStatus === 'failed' ||
    latestRunStatus === 'partial';

  const actionRequired = showActionRequired
    ? logs
        .filter((log) => log.status === 'failed')
        .map((log) => {
          const type = classifyIntegrationError(log.error_details);
          return {
            type,
            title:
              type === 'authentication'
                ? 'Authentication'
                : type === 'rate_limit'
                  ? 'Rate limit'
                  : 'Sync failed',
            message: buildActionMessage(type, config.label, log.error_details),
            occurredAt: getLogTimestamp(log),
            canReconnect: type === 'authentication',
          };
        })
        .filter((item, index, items) => {
          const key = `${item.type}:${item.title}:${item.message}`;
          return (
            items.findIndex(
              (candidate) =>
                `${candidate.type}:${candidate.title}:${candidate.message}` ===
                key,
            ) === index
          );
        })
        .slice(0, 2)
    : [];

  if (
    connection.health_status === 'needs_reconnect' &&
    !actionRequired.some((item) => item.type === 'authentication')
  ) {
    actionRequired.unshift({
      type: 'authentication',
      title: 'Authentication',
      message:
        connection.health_reason ??
        'Access token expired or revoked. Reconnect the account to resume syncing.',
      occurredAt: connection.health_detected_at,
      canReconnect: true,
    });
  }

  return {
    provider: config.provider,
    label: config.label,
    subtitle: config.subtitle,
    category: config.category,
    supportsManualSync: config.supportsManualSync,
    status: connection.status,
    healthStatus: connection.health_status,
    healthReason: connection.health_reason,
    connectedAt: connection.connected_at,
    accountName: connection.account_name,
    providerAccountId: connection.provider_account_id,
    lastSuccessfulSyncAt: connection.last_successful_sync_at,
    syncDisabledAt: connection.sync_disabled_at,
    syncSettings: {
      syncEnabled: connection.sync_enabled,
      syncIntervalMinutes: connection.sync_interval_minutes,
      importNewInvoices: connection.import_new_invoices,
      trackUnpaidInvoices: connection.track_unpaid_invoices,
    },
    scopes: config.scopes.map((scope) => ({
      key: scope.key,
      label: scope.label,
      description: scope.description,
      enabled:
        config.provider === 'docusign'
          ? true
          : Boolean((connection as any)[scope.key]),
    })),
    actionRequired,
    recentRuns: mapIntegrationRecentRuns(
      !connection.sync_enabled && connection.sync_disabled_at
        ? logs.filter(
            (log) =>
              new Date(log.started_at) <=
              new Date(connection.sync_disabled_at!),
          )
        : logs,
    ),
  };
}

export async function getIntegrationRecentRuns(params: {
  userId: string;
  provider: string;
  limit?: number;
}): Promise<IntegrationRecentRun[] | null> {
  if (!isIntegrationProvider(params.provider)) return null;

  const supabase = createServiceClient();
  const { data, error } = await (supabase
    .from('integration_connections' as any)
    .select('id, sync_enabled, sync_disabled_at')
    .eq('user_id', params.userId)
    .eq('provider', params.provider)
    .single() as any);

  if (error || !data?.id) return null;

  const logs = await getRecentLogsForConnections([data.id], params.limit ?? 10);
  const filteredLogs =
    !data.sync_enabled && data.sync_disabled_at
      ? logs.filter(
          (log) => new Date(log.started_at) <= new Date(data.sync_disabled_at),
        )
      : logs;
  return mapIntegrationRecentRuns(filteredLogs);
}

export async function updateIntegrationSettings(params: {
  userId: string;
  provider: string;
  settings: Record<string, unknown>;
}): Promise<boolean> {
  if (!isIntegrationProvider(params.provider)) return false;
  const allowedKeys = new Set([
    'sync_enabled',
    'import_new_invoices',
    'track_unpaid_invoices',
  ]);
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(params.settings)) {
    if (allowedKeys.has(key) && typeof value === 'boolean') {
      update[key] = value;
    }
  }

  if ('sync_enabled' in update) {
    update.sync_disabled_at = update.sync_enabled
      ? null
      : new Date().toISOString();
  }

  const supabase = createServiceClient();
  const { error } = await (supabase
    .from('integration_connections' as any)
    .update(update)
    .eq('user_id', params.userId)
    .eq('provider', params.provider) as any);

  if (error) throw error;
  return true;
}

export async function triggerIntegrationSync(params: {
  userId: string;
  provider: string;
}): Promise<{ triggered: boolean; reason?: string }> {
  if (!isIntegrationProvider(params.provider)) {
    return { triggered: false, reason: 'Invalid provider' };
  }
  const config = getIntegrationProviderConfig(params.provider);
  if (!config?.supportsManualSync) {
    return { triggered: false, reason: 'Manual sync is not supported' };
  }

  const supabase = createServiceClient();
  const { data, error } = await (supabase
    .from('integration_connections' as any)
    .select('id, status, health_status')
    .eq('user_id', params.userId)
    .eq('provider', params.provider)
    .single() as any);

  if (error || !data) return { triggered: false, reason: 'Not connected' };
  if (data.status !== 'connected') {
    return { triggered: false, reason: 'Integration is disconnected' };
  }
  if (data.health_status === 'needs_reconnect') {
    return { triggered: false, reason: 'Reconnect required' };
  }

  const eventName =
    params.provider === 'docusign'
      ? 'integrations/sync-docusign'
      : 'integrations/sync-invoices';

  await inngest.send({
    name: eventName,
    data: { integrationConnectionId: data.id },
  });

  return { triggered: true };
}

export function buildConnectionHealthUpdate(params: {
  status: SyncLogStatus;
  errorDetails?: unknown;
  completedAt: string;
}): Record<string, unknown> {
  const update: Record<string, unknown> = {
    last_sync_at: params.completedAt,
    updated_at: params.completedAt,
  };
  if (params.status === 'success' || params.status === 'partial') {
    update.last_successful_sync_at = params.completedAt;
    update.health_status = 'healthy';
    update.health_reason = null;
    update.health_detected_at = null;
    return update;
  }

  update.last_failed_sync_at = params.completedAt;
  const errorType = classifyIntegrationError(params.errorDetails);
  if (errorType === 'authentication') {
    update.health_status = 'needs_reconnect';
    update.health_reason =
      'Access token expired or revoked. Reconnect the account to resume syncing.';
    update.health_detected_at = params.completedAt;
  }
  return update;
}
