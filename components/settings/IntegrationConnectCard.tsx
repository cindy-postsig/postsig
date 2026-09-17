'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { CheckCircle2, LockKeyhole, Loader2, ShieldCheck } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface IntegrationConnectCardProps {
  provider: 'xero' | 'ramp';
  label: string;
  description: string;
  icon: ReactNode;
  connectDialog?: {
    eyebrow?: string;
    title?: string;
    description: string;
    details: string[];
    credentialsNote?: string;
    primaryActionLabel?: string;
  };
}

function IntegrationConnectCard({
  provider,
  label,
  description,
  icon,
  connectDialog,
}: IntegrationConnectCardProps) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const { toast } = useToast();

  const fetchConnectionStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v2/integrations/status?provider=${provider}`,
      );
      if (!res.ok) return false;
      const data = (await res.json()) as { connected: boolean };
      setConnected(data.connected ?? false);
      return data.connected ?? false;
    } catch {
      return false;
    }
  }, [provider]);

  useEffect(() => {
    fetchConnectionStatus().finally(() => setLoading(false));
  }, [fetchConnectionStatus]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/integrations/nango/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });

      if (!res.ok) throw new Error('Failed to create connect session');
      const { sessionToken, providerConfigKey } = (await res.json()) as {
        sessionToken: string;
        providerConfigKey: string;
      };

      // Dynamically import Nango frontend SDK
      const nangoModule = await import('@nangohq/frontend');
      const NangoClass = nangoModule.default;
      const nango = new NangoClass({ connectSessionToken: sessionToken });

      const result = await nango.auth(providerConfigKey);

      const callbackRes = await fetch('/api/v2/integrations/nango/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: result.connectionId, provider }),
      });

      if (!callbackRes.ok) throw new Error('Failed to save connection');

      setConnected(true);
      toast({ description: `${label} connected successfully!` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Error connecting to ${label}: ${message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnectClick = () => {
    if (connectDialog) {
      setConnectDialogOpen(true);
      return;
    }

    void handleConnect();
  };

  const handleConfirmConnect = () => {
    setConnectDialogOpen(false);
    void handleConnect();
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/integrations/nango/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });

      if (!res.ok) throw new Error('Failed to disconnect');

      setConnected(false);
      toast({ description: `${label} disconnected successfully` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Error disconnecting ${label}: ${message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="shrink-0">{icon}</div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium leading-none">{label}</p>
                {connected && !loading ? (
                  <span className="font-medium inline-flex h-5 items-center gap-1 rounded-sm border border-emerald-200 bg-emerald-50 px-1.5 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Connected
                  </span>
                ) : null}
              </div>
              <p className="max-w-xl text-sm text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
            {loading ? (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading
              </span>
            ) : connected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={loading}
              >
                Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={handleConnectClick} disabled={loading}>
                Connect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {connectDialog ? (
        <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
          <DialogContent className="max-w-[420px] gap-0 border-border/80 bg-[#f7f7fb] p-0 shadow-xl sm:rounded-sm">
            <div className="px-6 pb-3 pt-6">
              <DialogHeader className="space-y-4 pr-8 text-left">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-border bg-white [&_svg]:h-8 [&_svg]:w-8">
                    {icon}
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="font-semibold text-xl tracking-normal">
                      {connectDialog.title ?? `Connect ${label}`}
                    </DialogTitle>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {connectDialog.eyebrow ?? 'Secure OAuth via Nango'}
                    </p>
                  </div>
                </div>
                <DialogDescription className="text-[15px] leading-5 text-foreground/75">
                  {connectDialog.description}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="space-y-4 px-6 pb-5">
              <div className="rounded-sm border border-border bg-transparent px-4 py-3.5">
                <div className="font-semibold mb-3 flex items-center gap-2 text-sm">
                  <ShieldCheck className="h-4 w-4" />
                  Permissions requested
                </div>
                <div className="space-y-2.5">
                  {connectDialog.details.map((detail) => (
                    <div key={detail} className="flex items-center gap-3">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <p className="text-[15px] leading-5 text-muted-foreground">
                        {detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LockKeyhole className="h-4 w-4" />
                {connectDialog.credentialsNote ??
                  'Credentials are never stored by PostSig.'}
              </p>
            </div>

            <DialogFooter className="gap-2 px-6 pb-6 sm:space-x-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConnectDialogOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmConnect}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {connectDialog.primaryActionLabel ?? `Connect ${label}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

export default IntegrationConnectCard;
