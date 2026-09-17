'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Info,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SettingsPage } from '@/components/settings/SettingsPage';
import type { IntegrationProvider } from '@/lib/v2/integrations/catalog';
import { IntegrationConnectDialog } from './integrations/IntegrationConnectDialog';
import { ProviderIconTile } from './integrations/ProviderIcon';
import { useIntegrationActions } from './integrations/useIntegrationActions';

interface IntegrationDetail {
  provider: IntegrationProvider;
  label: string;
  subtitle: string;
  supportsManualSync: boolean;
  status: 'connected' | 'disconnected';
  healthStatus: 'healthy' | 'needs_reconnect' | 'disconnected';
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
  recentRuns: Array<{
    id: number;
    status: 'success' | 'failed' | 'partial';
    startedAt: string;
    completedAt: string | null;
    recordsProcessed: number;
    durationMs: number | null;
  }>;
}

function relativeTime(value: string | null): string {
  if (!value) return 'Never';
  return `${formatDistanceToNowStrict(new Date(value), { addSuffix: false })} ago`;
}

function durationLabel(durationMs: number | null): string {
  if (durationMs == null || durationMs < 0) return '-';
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function syncIntervalLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    if (hours === 1) return 'Every hour';
    return `Every ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `Every ${minutes} minutes`;
}

function HealthIcon({
  healthStatus,
}: {
  healthStatus: IntegrationDetail['healthStatus'];
}) {
  if (healthStatus === 'healthy') {
    return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  }
  if (healthStatus === 'needs_reconnect') {
    return <XCircle className="h-5 w-5 text-pink-500" />;
  }
  return <XCircle className="h-5 w-5 text-muted-foreground" />;
}

function ConnectionRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0">
      <div className="flex items-center gap-3 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="font-medium text-foreground">{value}</div>
    </div>
  );
}

export default function IntegrationDetailPageClient({
  provider,
}: {
  provider: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [detail, setDetail] = useState<IntegrationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSetting, setSavingSetting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshingRuns, setRefreshingRuns] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/integrations/${provider}/detail`);
      if (res.status === 404) {
        router.replace('/settings/integrations');
        return;
      }
      if (!res.ok) throw new Error('Failed to load integration');
      const data = (await res.json()) as { integration: IntegrationDetail };
      setDetail(data.integration);
    } finally {
      setLoading(false);
    }
  }, [provider, router]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const actions = useIntegrationActions(loadDetail);

  const accountLabel = useMemo(() => {
    if (!detail) return '-';
    const fallbackAccountLabels: Partial<Record<IntegrationProvider, string>> =
      {
        docusign: 'PostSig Inc.',
        xero: 'PostSig (Xero)',
        ramp: 'PostSig (Ramp)',
      };

    return (
      detail.accountName ??
      detail.providerAccountId ??
      fallbackAccountLabels[detail.provider] ??
      '-'
    );
  }, [detail]);

  const updateSetting = async (key: string, value: boolean) => {
    if (!detail) return;
    setSavingSetting(key);
    const optimistic = {
      ...detail,
      syncSettings: { ...detail.syncSettings, [key]: value },
      scopes: detail.scopes.map((scope) =>
        scope.key === key ? { ...scope, enabled: value } : scope,
      ),
    };
    setDetail(optimistic);
    try {
      const res = await fetch(
        `/api/v2/integrations/${detail.provider}/settings`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        },
      );
      if (!res.ok) throw new Error('Failed to update settings');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to update settings',
      });
      void loadDetail();
    } finally {
      setSavingSetting(null);
    }
  };

  const syncNow = async () => {
    if (!detail) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/v2/integrations/${detail.provider}/sync`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Failed to trigger sync');
      toast({ description: `${detail.label} sync started.` });
      void loadDetail();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to trigger sync',
      });
    } finally {
      setSyncing(false);
    }
  };

  const refreshRecentRuns = async () => {
    if (!detail) return;
    setRefreshingRuns(true);
    try {
      const res = await fetch(`/api/v2/integrations/${detail.provider}/runs`);
      const data = (await res.json().catch(() => ({}))) as {
        recentRuns?: IntegrationDetail['recentRuns'];
        error?: string;
      };
      if (!res.ok || !data.recentRuns) {
        throw new Error(data.error ?? 'Failed to refresh recent runs');
      }
      setDetail((current) =>
        current ? { ...current, recentRuns: data.recentRuns ?? [] } : current,
      );
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to refresh recent runs',
      });
    } finally {
      setRefreshingRuns(false);
    }
  };

  const disconnect = async () => {
    if (!detail) return;
    setDisconnecting(true);
    try {
      const endpoint =
        detail.provider === 'docusign'
          ? '/api/docusign/auth/disconnect'
          : '/api/v2/integrations/nango/disconnect';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:
          detail.provider === 'docusign'
            ? undefined
            : JSON.stringify({ provider: detail.provider }),
      });
      if (!res.ok) throw new Error('Failed to disconnect');
      toast({ description: `${detail.label} disconnected successfully.` });
      router.push('/settings/integrations');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to disconnect',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading || !detail) {
    return (
      <SettingsPage className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading integration
        </div>
      </SettingsPage>
    );
  }

  const reconnect = () => {
    actions.requestConnect(detail.provider, detail.label, 'reconnect');
  };
  const reconnectRequired = detail.healthStatus === 'needs_reconnect';
  const actionRequiredItems =
    detail.actionRequired.length > 0
      ? detail.actionRequired
      : reconnectRequired
        ? [
            {
              type: 'authentication' as const,
              title: 'Authentication',
              message:
                detail.healthReason ??
                'Reconnect the account to resume syncing.',
              occurredAt: null,
              canReconnect: true,
            },
          ]
        : [];

  return (
    <SettingsPage wide className="space-y-8">
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/settings/integrations" className="hover:text-foreground">
            Integrations
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span>{detail.label}</span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <ProviderIconTile provider={detail.provider} />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold font-sans text-3xl leading-none">
                  {detail.label}
                </h2>
                <HealthIcon healthStatus={detail.healthStatus} />
                {reconnectRequired ? (
                  <span className="font-medium inline-flex items-center gap-1 rounded-sm border border-pink-300 bg-pink-50 px-1.5 py-0.5 text-xs text-pink-600">
                    <AlertTriangle className="h-3 w-3" />
                    Reconnect required
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {detail.subtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={syncNow}
              disabled={
                syncing ||
                !detail.supportsManualSync ||
                detail.status !== 'connected' ||
                detail.healthStatus === 'needs_reconnect'
              }
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync now
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon">
                  <MoreHorizontal className="h-5 w-5" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={reconnect}>
                  Reconnect
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={disconnect}
                  disabled={disconnecting}
                  className="text-pink-500 focus:text-pink-500"
                >
                  Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <Separator />

      {actionRequiredItems.length > 0 ? (
        <section className="space-y-4">
          <h3 className="font-semibold text-xl">Action required</h3>
          <div className="space-y-4">
            {actionRequiredItems.map((item) => (
              <div
                key={`${item.title}-${item.occurredAt ?? item.message}`}
                className="rounded-sm border border-pink-300 bg-pink-50/40 p-6"
              >
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-4">
                    <div className="font-semibold flex items-center gap-2 text-lg text-pink-500">
                      <AlertTriangle className="h-5 w-5" />
                      {item.title}
                    </div>
                    <p className="max-w-4xl text-base text-foreground/80">
                      {item.message}
                    </p>
                    {item.canReconnect ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="border-pink-300 text-pink-500 hover:bg-pink-50 hover:text-pink-600"
                        onClick={reconnect}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Reconnect
                      </Button>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm text-muted-foreground">
                    {relativeTime(item.occurredAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-4">
          <h3 className="font-medium">Connection</h3>
          <div className="rounded-sm border bg-card px-5">
            <ConnectionRow
              icon={<Building2 className="h-4 w-4" />}
              label="Account"
              value={accountLabel}
            />
            <ConnectionRow
              icon={<CalendarDays className="h-4 w-4" />}
              label="Connected"
              value={
                detail.connectedAt
                  ? format(new Date(detail.connectedAt), 'd MMM yyyy')
                  : '-'
              }
            />
            <ConnectionRow
              icon={<Clock3 className="h-4 w-4" />}
              label="Last successful sync"
              value={relativeTime(detail.lastSuccessfulSyncAt)}
            />
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="font-medium">Sync configuration</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-sm border bg-card p-4">
              <div>
                <p className="font-medium">Enable sync</p>
                <p className="text-sm text-muted-foreground">
                  {reconnectRequired
                    ? 'Reconnect required before sync can resume'
                    : syncIntervalLabel(
                        detail.syncSettings.syncIntervalMinutes,
                      )}
                </p>
              </div>
              <Switch
                checked={detail.syncSettings.syncEnabled}
                disabled={savingSetting === 'syncEnabled'}
                onCheckedChange={(checked) =>
                  void updateSetting('syncEnabled', checked)
                }
              />
            </div>

            <div className="space-y-3">
              <p className="font-medium text-sm text-muted-foreground">
                Data scope
              </p>
              {detail.scopes.map((scope) => (
                <div
                  key={scope.key}
                  className="flex items-center justify-between rounded-sm border bg-card p-4"
                >
                  <div>
                    <p className="font-medium">{scope.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {scope.description}
                    </p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <h3 className="font-medium">Recent runs</h3>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Only shows runs within the last 7 days</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={refreshRecentRuns}
            disabled={refreshingRuns}
            aria-label="Refresh recent runs"
          >
            <RefreshCw
              className={refreshingRuns ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
            />
          </Button>
        </div>
        {(() => {
          const visibleRuns = detail.recentRuns;

          if (visibleRuns.length === 0) {
            return (
              <div className="rounded-sm border border-dashed p-12 text-center text-sm text-muted-foreground">
                No sync runs yet.
              </div>
            );
          }

          return (
            <Table stickyHeader scrollClassName="rounded-sm border">
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <span
                        className={
                          run.status === 'failed'
                            ? 'inline-flex items-center gap-2 text-pink-500'
                            : run.status === 'partial'
                              ? 'inline-flex items-center gap-2 text-amber-600'
                              : 'inline-flex items-center gap-2 text-emerald-700'
                        }
                      >
                        {run.status === 'failed' ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : run.status === 'partial' ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {run.status === 'failed'
                          ? 'Failed'
                          : run.status === 'partial'
                            ? 'Partial'
                            : 'Success'}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {relativeTime(run.startedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {run.recordsProcessed > 0
                        ? `${run.recordsProcessed} records`
                        : 'No records'}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {durationLabel(run.durationMs)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          );
        })()}
      </section>

      <IntegrationConnectDialog
        provider={
          actions.pendingNangoConnection?.provider === 'xero' ||
          actions.pendingNangoConnection?.provider === 'ramp'
            ? actions.pendingNangoConnection.provider
            : null
        }
        label={actions.pendingNangoConnection?.label ?? ''}
        intent={actions.pendingNangoConnection?.intent ?? 'reconnect'}
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
