'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { SettingsPage } from '@/components/settings/SettingsPage';
import {
  INTEGRATION_CATEGORIES,
  type IntegrationCategory,
  type IntegrationProvider,
} from '@/lib/v2/integrations/catalog';
import { IntegrationConnectDialog } from './integrations/IntegrationConnectDialog';
import { ProviderIconTile } from './integrations/ProviderIcon';
import { useIntegrationActions } from './integrations/useIntegrationActions';

interface IntegrationSummaryItem {
  provider: IntegrationProvider;
  label: string;
  subtitle: string;
  category: IntegrationCategory;
  connectedBefore: boolean;
  listVisible: boolean;
  marketplaceVisible: boolean;
  buttonMode: 'connect' | 'manage' | 'reconnect';
  status: 'connected' | 'disconnected' | null;
  healthStatus: 'healthy' | 'needs_reconnect' | 'disconnected' | null;
  healthReason: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: 'success' | 'failed' | 'partial' | null;
}

interface IntegrationSummaryResponse {
  providers: IntegrationSummaryItem[];
}

function relativeTime(value: string | null): string | null {
  if (!value) return null;
  return `${formatDistanceToNowStrict(new Date(value), { addSuffix: false })} ago`;
}

function IntegrationRow({
  integration,
  onAction,
}: {
  integration: IntegrationSummaryItem;
  onAction: (integration: IntegrationSummaryItem) => void;
}) {
  const isReconnect = integration.buttonMode === 'reconnect';
  const needsReconnect = integration.healthStatus === 'needs_reconnect';
  const lastSync = relativeTime(integration.lastSyncAt);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <ProviderIconTile provider={integration.provider} />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {integration.connectedBefore ? (
                <Link
                  href={`/settings/integrations/${integration.provider}`}
                  className="font-medium leading-none hover:underline"
                >
                  {integration.label}
                </Link>
              ) : (
                <p className="font-medium leading-none">{integration.label}</p>
              )}
              {needsReconnect ? (
                <AlertTriangle
                  className="h-4 w-4 text-pink-500"
                  aria-label="Reconnect required"
                />
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {integration.subtitle}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 self-start lg:self-center">
          {integration.connectedBefore && lastSync ? (
            <p
              className={
                integration.lastSyncStatus === 'failed' ||
                integration.lastSyncStatus === 'partial' ||
                isReconnect
                  ? 'font-medium text-sm text-pink-500'
                  : 'text-sm text-muted-foreground'
              }
            >
              {integration.lastSyncStatus === 'failed' || isReconnect
                ? 'Last sync failed'
                : integration.lastSyncStatus === 'partial'
                  ? 'Last sync incomplete'
                  : `Last sync ${lastSync}`}
            </p>
          ) : null}
          <Button
            type="button"
            variant={
              isReconnect
                ? 'outline'
                : integration.buttonMode === 'connect'
                  ? 'default'
                  : 'outline'
            }
            size="sm"
            className={
              isReconnect
                ? 'border-pink-300 text-pink-500 hover:bg-pink-50 hover:text-pink-600'
                : undefined
            }
            onClick={() => onAction(integration)}
          >
            {integration.buttonMode === 'manage'
              ? 'Manage'
              : integration.buttonMode === 'reconnect'
                ? 'Reconnect'
                : 'Connect'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function IntegrationsPageClient() {
  const router = useRouter();
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [summary, setSummary] = useState<IntegrationSummaryResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/v2/integrations/summary');
      if (!res.ok) throw new Error('Failed to load integrations');
      setSummary((await res.json()) as IntegrationSummaryResponse);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Failed to load integrations',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const actions = useIntegrationActions(loadSummary, (provider) => {
    router.push(`/settings/integrations/${provider}`);
  });

  const visibleIntegrations = useMemo(
    () => (summary?.providers ?? []).filter((provider) => provider.listVisible),
    [summary],
  );

  const marketplaceByCategory = useMemo(() => {
    const grouped = new Map<IntegrationCategory, IntegrationSummaryItem[]>();
    for (const provider of summary?.providers ?? []) {
      if (!provider.marketplaceVisible) continue;
      const items = grouped.get(provider.category) ?? [];
      items.push(provider);
      grouped.set(provider.category, items);
    }
    return grouped;
  }, [summary]);

  const handleAction = (integration: IntegrationSummaryItem) => {
    if (integration.buttonMode === 'manage') {
      router.push(`/settings/integrations/${integration.provider}`);
      return;
    }
    actions.requestConnect(
      integration.provider,
      integration.label,
      integration.buttonMode === 'reconnect' ? 'reconnect' : 'connect',
    );
  };

  const content = loading ? (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading integrations
    </div>
  ) : loadError ? (
    <div className="rounded-sm border border-pink-200 bg-pink-50/50 p-5 text-sm text-pink-600">
      {loadError}
    </div>
  ) : showMarketplace ? (
    <div className="space-y-8">
      {(Object.keys(INTEGRATION_CATEGORIES) as IntegrationCategory[]).map(
        (category) => {
          const integrations = marketplaceByCategory.get(category) ?? [];
          if (integrations.length === 0) return null;
          return (
            <section key={category} className="space-y-3">
              <div>
                <h5 className="font-medium">
                  {INTEGRATION_CATEGORIES[category].title}
                </h5>
                <p className="text-xs text-muted-foreground">
                  {INTEGRATION_CATEGORIES[category].description}
                </p>
              </div>
              <div className="space-y-3">
                {integrations.map((integration) => (
                  <IntegrationRow
                    key={integration.provider}
                    integration={integration}
                    onAction={handleAction}
                  />
                ))}
              </div>
            </section>
          );
        },
      )}
    </div>
  ) : visibleIntegrations.length > 0 ? (
    <div className="space-y-4">
      {visibleIntegrations.map((integration) => (
        <IntegrationRow
          key={integration.provider}
          integration={integration}
          onAction={handleAction}
        />
      ))}
    </div>
  ) : (
    <div className="rounded-sm border border-dashed p-8 text-center text-sm text-muted-foreground">
      No integrations connected yet. Browse the marketplace to connect one.
    </div>
  );

  return (
    <SettingsPage className="space-y-6">
      <div className="space-y-4">
        {showMarketplace ? (
          <button
            type="button"
            onClick={() => setShowMarketplace(false)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to integrations
          </button>
        ) : null}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="font-medium">
              {showMarketplace ? 'Marketplace' : 'Integrations'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {showMarketplace
                ? 'Discover integrations by category and connect them to PostSig.'
                : 'Connect PostSig to third-party services to automate data sync, reconciliation, and workflows.'}
            </p>
          </div>
          {!showMarketplace ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMarketplace(true)}
            >
              Browse Marketplace
            </Button>
          ) : null}
        </div>
      </div>
      <Separator />
      {content}

      <IntegrationConnectDialog
        provider={actions.pendingNangoConnection?.provider ?? null}
        label={actions.pendingNangoConnection?.label ?? ''}
        intent={actions.pendingNangoConnection?.intent ?? 'connect'}
        open={actions.pendingNangoDialogOpen}
        loading={
          !!actions.pendingNangoConnection &&
          actions.actionLoading === actions.pendingNangoConnection.provider
        }
        onOpenChange={(open) => {
          if (!open) actions.closePendingNangoConnection();
        }}
        onConfirm={actions.confirmNangoConnect}
      />
    </SettingsPage>
  );
}
