export type IntegrationProvider = 'docusign' | 'xero' | 'ramp';

export type IntegrationCategory =
  | 'document_repositories'
  | 'financial_accounting';

export type IntegrationHealthStatus =
  | 'healthy'
  | 'needs_reconnect'
  | 'disconnected';

export type IntegrationButtonMode = 'connect' | 'manage' | 'reconnect';

export interface IntegrationScopeConfig {
  key: 'import_new_invoices' | 'track_unpaid_invoices' | 'completed_envelopes';
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export interface IntegrationProviderConfig {
  provider: IntegrationProvider;
  label: string;
  subtitle: string;
  category: IntegrationCategory;
  authProvider: 'nango' | 'native_oauth';
  syncIntervalMinutes: number;
  supportsManualSync: boolean;
  scopes: IntegrationScopeConfig[];
}

export const INTEGRATION_CATEGORIES: Record<
  IntegrationCategory,
  { title: string; description: string }
> = {
  document_repositories: {
    title: 'Document Repositories',
    description: 'Contract ingestion and document storage.',
  },
  financial_accounting: {
    title: 'Financial & Accounting Systems',
    description: 'Invoice ingestion, reconciliation, and status sync.',
  },
};

export const INTEGRATION_PROVIDERS: IntegrationProviderConfig[] = [
  {
    provider: 'docusign',
    label: 'DocuSign',
    subtitle: 'Import Contracts',
    category: 'document_repositories',
    authProvider: 'native_oauth',
    syncIntervalMinutes: 60,
    supportsManualSync: true,
    scopes: [
      {
        key: 'completed_envelopes',
        label: 'Completed envelopes',
        description: 'Ingest fully executed contracts.',
        defaultEnabled: true,
      },
    ],
  },
  {
    provider: 'xero',
    label: 'Xero',
    subtitle: 'Sync Invoices',
    category: 'financial_accounting',
    authProvider: 'nango',
    syncIntervalMinutes: 120,
    supportsManualSync: true,
    scopes: [
      {
        key: 'import_new_invoices',
        label: 'New invoices',
        description: 'Import invoices as they are created.',
        defaultEnabled: true,
      },
      {
        key: 'track_unpaid_invoices',
        label: 'Unpaid invoices',
        description: 'Track outstanding balances for reconciliation.',
        defaultEnabled: true,
      },
    ],
  },
  {
    provider: 'ramp',
    label: 'Ramp',
    subtitle: 'Sync Invoices',
    category: 'financial_accounting',
    authProvider: 'nango',
    syncIntervalMinutes: 120,
    supportsManualSync: true,
    scopes: [
      {
        key: 'import_new_invoices',
        label: 'New invoices',
        description: 'Import invoices as they are created.',
        defaultEnabled: true,
      },
      {
        key: 'track_unpaid_invoices',
        label: 'Unpaid invoices',
        description: 'Track outstanding balances for reconciliation.',
        defaultEnabled: true,
      },
    ],
  },
];

export const INTEGRATION_PROVIDER_IDS = INTEGRATION_PROVIDERS.map(
  (provider) => provider.provider,
);

export function getIntegrationProviderConfig(
  provider: string,
): IntegrationProviderConfig | null {
  return (
    INTEGRATION_PROVIDERS.find((config) => config.provider === provider) ?? null
  );
}

export function isIntegrationProvider(
  provider: string | null | undefined,
): provider is IntegrationProvider {
  return !!provider && INTEGRATION_PROVIDER_IDS.includes(provider as any);
}

export function getIntegrationButtonMode(params: {
  connectedBefore: boolean;
  status?: string | null;
  healthStatus?: string | null;
}): IntegrationButtonMode {
  if (!params.connectedBefore) return 'connect';
  if (
    params.status === 'connected' &&
    (params.healthStatus ?? 'healthy') === 'healthy'
  ) {
    return 'manage';
  }
  return 'reconnect';
}
