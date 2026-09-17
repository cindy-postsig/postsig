'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { Button } from '../ui/button';
import { User } from '@supabase/supabase-js';
import { track } from '@vercel/analytics';
import { DocuSignService } from '@/lib/api/docusign';
import { DocuSignIcon } from '@/components/icons/DocuSignIcon';
import { Card, CardContent } from '../ui/card';
import { CheckCircle2, Loader2 } from 'lucide-react';

export default function DocuSignConnect({ user }: { user: User | null }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const docuSignService = new DocuSignService();
  const [docuSignPopup, setDocuSignPopup] = useState<Window | null>(null);
  const popupPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isDocuSignEnabled = process.env.DOCUSIGN_ENABLED === 'true';

  const fetchDocuSignStatus = useCallback(async () => {
    if (!user) return false;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('docusign_connected, docusign_account_id')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      const isConnected = !!(data as any)?.docusign_connected;
      setConnected(isConnected);
      return isConnected;
    } catch (error: any) {
      console.error('Error checking DocuSign status:', error);
      return false;
    }
  }, [user, supabase, toast]);

  useEffect(() => {
    fetchDocuSignStatus().finally(() => setLoading(false));
  }, [fetchDocuSignStatus]);

  useEffect(() => {
    const error = searchParams.get('error');
    const success = searchParams.get('success');

    if (error) {
      const errorMessages: Record<string, string> = {
        auth_failed: 'DocuSign authorization failed',
        no_code: 'No authorization code received',
        config_error: 'DocuSign integration is not properly configured',
        token_error: 'Failed to exchange authorization code for tokens',
        userinfo_error: 'Failed to get DocuSign user information',
        no_account: 'No default DocuSign account found',
        db_error: 'Failed to update user information',
        unexpected: 'An unexpected error occurred',
      };

      const message = errorMessages[error] || 'Error connecting to DocuSign';
      setTimeout(() => {
        toast({
          description: message,
          variant: 'destructive',
        });
      }, 100);

      if (popupPollIntervalRef.current)
        clearInterval(popupPollIntervalRef.current);
      if (docuSignPopup) {
        docuSignPopup.close();
      }
      setDocuSignPopup(null);
      setLoading(false);

      window.history.replaceState({}, '', window.location.pathname);
    }

    if (success === 'docusign_connected') {
      setTimeout(() => {
        toast({
          description: 'DocuSign connected successfully!',
        });
      }, 100);
      fetchDocuSignStatus().finally(() => setLoading(false));

      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, toast, fetchDocuSignStatus]);

  useEffect(() => {
    if (docuSignPopup) {
      popupPollIntervalRef.current = setInterval(async () => {
        try {
          if (docuSignPopup.closed) {
            if (popupPollIntervalRef.current) {
              clearInterval(popupPollIntervalRef.current);
            }
            setDocuSignPopup(null);
            await fetchDocuSignStatus();
            setLoading(false);
            return;
          }

          const isConnected = await fetchDocuSignStatus();

          if (isConnected) {
            if (popupPollIntervalRef.current) {
              clearInterval(popupPollIntervalRef.current);
            }
            docuSignPopup.close();
            setDocuSignPopup(null);
            setLoading(false);
            toast({
              description: 'DocuSign connected successfully!',
              variant: 'default',
            });
          }
        } catch (error) {
          console.error('Error during DocuSign polling:', error);
        }
      }, 2000);
    }

    return () => {
      if (popupPollIntervalRef.current) {
        clearInterval(popupPollIntervalRef.current);
      }
    };
  }, [docuSignPopup, fetchDocuSignStatus, toast]);

  const connectDocuSign = async () => {
    track('Connect DocuSign');
    try {
      setLoading(true);
      const { data, error } = await docuSignService.getAuthUrl();

      if (error) throw error;
      if (!data?.url) throw new Error('Failed to get DocuSign auth URL.');

      const popup = window.open(
        data.url,
        'docusign_auth',
        'width=600,height=700,menubar=no,toolbar=no,location=no,status=no',
      );

      if (!popup) {
        throw new Error('Popup window blocked or failed to open.');
      }

      setDocuSignPopup(popup);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Error connecting to DocuSign: ${error.message}`,
      });
      setLoading(false);
    }
  };

  const disconnectDocuSign = async () => {
    track('Disconnect DocuSign');
    if (!user) return;

    try {
      setLoading(true);

      const response = await fetch('/api/docusign/auth/disconnect', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect DocuSign');
      }

      const { error } = await (supabase.from('users').update as any)({
        docusign_connected: false,
        docusign_access_token: null,
        docusign_refresh_token: null,
        docusign_account_id: null,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);

      if (error) throw error;

      setConnected(false);
      toast({
        description: 'DocuSign disconnected successfully',
        variant: 'default',
      });
    } catch (error: any) {
      toast(generateToastError(error.message, 'Error disconnecting DocuSign!'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-border bg-secondary/20">
            <DocuSignIcon className="w-8" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium leading-none">DocuSign</p>
              {connected && !loading ? (
                <span className="font-medium inline-flex h-5 items-center gap-1 rounded-sm border border-emerald-200 bg-emerald-50 px-1.5 text-xs text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">Import Contracts</p>
          </div>
        </div>
        {!isDocuSignEnabled && (
          <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
            <span className="text-sm text-muted-foreground">Coming soon!</span>
          </div>
        )}
        {isDocuSignEnabled && (
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
                onClick={disconnectDocuSign}
                disabled={loading}
              >
                Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={connectDocuSign} disabled={loading}>
                Connect
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
