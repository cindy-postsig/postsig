'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { createClient } from '@/utils/supabase/client';
import type { IntegrationProvider } from '@/lib/v2/integrations/catalog';

type NangoProvider = 'xero' | 'ramp';

export type IntegrationConnectIntent = 'connect' | 'reconnect';

interface PendingNangoConnection {
  provider: NangoProvider;
  label: string;
  intent: IntegrationConnectIntent;
}

interface DocuSignConnectionStatus {
  connected: boolean;
  updatedAt: string | null;
}

function clearStaleDialogPointerLock() {
  const hasOpenDialog = document.querySelector(
    '[role="dialog"][data-state="open"]',
  );
  if (!hasOpenDialog) {
    document.body.style.pointerEvents = '';
  }
}

function isNangoProvider(
  provider: IntegrationProvider,
): provider is NangoProvider {
  return provider === 'xero' || provider === 'ramp';
}

export function useIntegrationActions(
  onComplete?: () => void,
  onConnected?: (provider: IntegrationProvider) => void,
) {
  const { toast } = useToast();
  const [pendingNangoConnection, setPendingNangoConnection] =
    useState<PendingNangoConnection | null>(null);
  const [pendingNangoDialogOpen, setPendingNangoDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] =
    useState<IntegrationProvider | null>(null);
  const popupPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingNangoCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nangoAuthAttemptRef = useRef(0);

  const clearPopupPoll = useCallback(() => {
    if (popupPollIntervalRef.current) {
      clearInterval(popupPollIntervalRef.current);
      popupPollIntervalRef.current = null;
    }
  }, []);

  const clearPendingNangoCloseTimeout = useCallback(() => {
    if (pendingNangoCloseTimeoutRef.current) {
      clearTimeout(pendingNangoCloseTimeoutRef.current);
      pendingNangoCloseTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearPopupPoll();
      clearPendingNangoCloseTimeout();
    };
  }, [clearPendingNangoCloseTimeout, clearPopupPoll]);

  const closePendingNangoConnection = useCallback(() => {
    nangoAuthAttemptRef.current += 1;
    setActionLoading((current) =>
      current && isNangoProvider(current) ? null : current,
    );
    setPendingNangoDialogOpen(false);
    clearPendingNangoCloseTimeout();
    window.setTimeout(clearStaleDialogPointerLock, 0);
    pendingNangoCloseTimeoutRef.current = setTimeout(() => {
      setPendingNangoConnection(null);
      clearStaleDialogPointerLock();
      pendingNangoCloseTimeoutRef.current = null;
    }, 300);
  }, [clearPendingNangoCloseTimeout]);

  const checkDocuSignStatus =
    useCallback(async (): Promise<DocuSignConnectionStatus> => {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return { connected: false, updatedAt: null };

        const { data, error } = await supabase
          .from('users')
          .select('docusign_connected, docusign_account_id, updated_at')
          .eq('id', userData.user.id)
          .single();

        if (error) return { connected: false, updatedAt: null };
        return {
          connected: !!(data as any)?.docusign_connected,
          updatedAt: ((data as any)?.updated_at as string | null) ?? null,
        };
      } catch {
        return { connected: false, updatedAt: null };
      }
    }, []);

  const connectDocuSign = useCallback(
    async (intent: IntegrationConnectIntent) => {
      setActionLoading('docusign');
      try {
        const startedAt = new Date();
        const response = await fetch('/api/docusign/auth/url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnUrl: '/settings/integrations' }),
        });
        const result = await response.json();
        if (!response.ok || !result?.url) {
          throw new Error(
            result?.error ?? 'Failed to create DocuSign auth URL',
          );
        }

        const popup = window.open(
          result.url,
          'docusign_auth',
          'width=600,height=700,menubar=no,toolbar=no,location=no,status=no',
        );
        if (!popup) throw new Error('Popup window blocked or failed to open.');

        clearPopupPoll();
        popupPollIntervalRef.current = setInterval(async () => {
          try {
            if (popup.closed) {
              clearPopupPoll();
              setActionLoading(null);
              await checkDocuSignStatus();
              onComplete?.();
              return;
            }

            const status = await checkDocuSignStatus();
            const completedCurrentOAuth =
              intent === 'connect'
                ? status.connected
                : status.connected &&
                  !!status.updatedAt &&
                  new Date(status.updatedAt).getTime() > startedAt.getTime();

            if (completedCurrentOAuth) {
              popup.close();
              clearPopupPoll();
              setActionLoading(null);
              toast({ description: 'DocuSign connected successfully!' });
              onComplete?.();
            }
          } catch {
            // Keep polling; transient failures should not interrupt OAuth.
          }
        }, 2000);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `Error connecting to DocuSign: ${message}`,
        });
        setActionLoading(null);
      }
    },
    [checkDocuSignStatus, clearPopupPoll, onComplete, toast],
  );

  const requestConnect = useCallback(
    (
      provider: IntegrationProvider,
      label: string,
      intent: IntegrationConnectIntent,
    ) => {
      if (provider === 'docusign') {
        void connectDocuSign(intent);
        return;
      }
      if (isNangoProvider(provider)) {
        clearPendingNangoCloseTimeout();
        setPendingNangoConnection({ provider, label, intent });
        setPendingNangoDialogOpen(true);
      }
    },
    [clearPendingNangoCloseTimeout, connectDocuSign],
  );

  const confirmNangoConnect = useCallback(async () => {
    if (!pendingNangoConnection) return;
    const { provider, label } = pendingNangoConnection;
    const attemptId = nangoAuthAttemptRef.current + 1;
    nangoAuthAttemptRef.current = attemptId;
    setActionLoading(provider);
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

      const nangoModule = await import('@nangohq/frontend');
      const NangoClass = nangoModule.default;
      const nango = new NangoClass({ connectSessionToken: sessionToken });

      const result = await nango.auth(providerConfigKey);
      if (nangoAuthAttemptRef.current !== attemptId) return;

      const callbackRes = await fetch('/api/v2/integrations/nango/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: result.connectionId, provider }),
      });

      if (!callbackRes.ok) throw new Error('Failed to save connection');
      if (nangoAuthAttemptRef.current !== attemptId) return;

      toast({ description: `${label} connected successfully!` });
      closePendingNangoConnection();
      onComplete?.();
      onConnected?.(provider);
    } catch (error) {
      if (nangoAuthAttemptRef.current !== attemptId) return;
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Error connecting to ${label}: ${message}`,
      });
    } finally {
      if (nangoAuthAttemptRef.current === attemptId) {
        setActionLoading(null);
      }
    }
  }, [
    closePendingNangoConnection,
    onComplete,
    onConnected,
    pendingNangoConnection,
    toast,
  ]);

  return {
    actionLoading,
    pendingNangoConnection,
    pendingNangoDialogOpen,
    setPendingNangoConnection,
    closePendingNangoConnection,
    requestConnect,
    confirmNangoConnect,
  };
}
