'use client';

import { CheckCircle2, LockKeyhole, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProviderIcon } from './ProviderIcon';
import type { IntegrationProvider } from '@/lib/v2/integrations/catalog';
import type { IntegrationConnectIntent } from './useIntegrationActions';

const permissions: Record<'xero' | 'ramp', string[]> = {
  xero: [
    'Read invoices and bills',
    'Read contacts & organisation profile',
    'Read payment status',
  ],
  ramp: [
    'Read invoices and bills',
    'Read contacts & organisation profile',
    'Read payment status',
  ],
};

const syncNounByProvider: Record<'xero' | 'ramp', string> = {
  xero: 'invoices',
  ramp: 'invoices',
};

export function IntegrationConnectDialog({
  provider,
  label,
  intent,
  open,
  loading,
  onOpenChange,
  onConfirm,
}: {
  provider: Extract<IntegrationProvider, 'xero' | 'ramp'> | null;
  label: string;
  intent: IntegrationConnectIntent;
  open: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  if (!provider) return null;

  const title = `${intent === 'reconnect' ? 'Reconnect' : 'Connect'} ${label}`;
  const syncNoun = syncNounByProvider[provider];
  const closeDialog = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader className="space-y-4 pr-8 text-left">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-border bg-secondary/20 [&_svg]:h-8 [&_svg]:w-8">
              <ProviderIcon provider={provider} className="h-8 w-8" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-semibold text-xl tracking-normal">
                {title}
              </DialogTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Secure OAuth via Nango
              </p>
            </div>
          </div>
          <DialogDescription className="text-[15px] leading-5 text-foreground/75">
            PostSig is requesting access to your {label} account to sync
            {` ${syncNoun}`}. You&apos;ll be asked to sign in and grant the
            permissions below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-sm border border-border px-4 py-3.5">
            <div className="font-semibold mb-3 flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4" />
              Permissions requested
            </div>
            <div className="space-y-2.5">
              {permissions[provider].map((permission) => (
                <div key={permission} className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="text-[15px] leading-5 text-muted-foreground">
                    {permission}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LockKeyhole className="h-4 w-4" />
            Credentials are never stored by PostSig.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue to {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
