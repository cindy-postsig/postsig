'use client';

import { useState, useTransition } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDateFormat } from '@/hooks/useDateFormat';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  revokeOAuthGrant,
  type ConnectedAppGrant,
} from '@/app/lib/actions/oauth-grants';
import { synthesizeFaviconUrl } from '@/app/lib/mcp/favicon';

interface ConnectedAppsListProps {
  initialGrants: ConnectedAppGrant[];
}

function formatScopeLabel(scope: string): string {
  if (scope === 'read') return 'Read';
  if (scope === 'write') return 'Write';
  return scope;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function safeHttpUrl(input: string | null): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function initials(value: string | null | undefined, max = 2): string {
  if (!value) return '?';
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, max)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function ConnectedAppsList({ initialGrants }: ConnectedAppsListProps) {
  const { toast } = useToast();
  const { dateFormat } = useDateFormat();
  const [grants, setGrants] = useState<ConnectedAppGrant[]>(initialGrants);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [confirmGrant, setConfirmGrant] = useState<ConnectedAppGrant | null>(
    null,
  );

  const handleRevoke = (grant: ConnectedAppGrant) => {
    setPendingId(grant.id);
    startTransition(async () => {
      try {
        await revokeOAuthGrant(grant.id);
        setGrants((prev) => prev.filter((g) => g.id !== grant.id));
        toast({
          description: `Revoked access for ${grant.clientName}`,
        });
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Could not revoke access',
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        setPendingId(null);
      }
    });
  };

  if (grants.length === 0) {
    return (
      <div className="rounded border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No applications have been authorized yet.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          When you sign in to a third-party app with PostSig, it will appear
          here.
        </p>
      </div>
    );
  }

  return (
    <>
      <Table stickyHeader scrollClassName="rounded border">
        <TableHeader>
          <TableRow>
            <TableHead className="py-3 text-xs">Application</TableHead>
            <TableHead className="py-3 text-xs">Access</TableHead>
            <TableHead className="py-3 text-xs">Connected</TableHead>
            <TableHead className="py-3 text-xs">Last active</TableHead>
            <TableHead className="w-[1%] py-3 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {grants.map((grant) => {
            const isPending = pendingId === grant.id;
            const clientHref = safeHttpUrl(grant.clientUri);
            // Hide loopback hosts — "localhost" doesn't differentiate
            // one local client from another, and faviconV2 only returns
            // a generic globe for it. Initials read better.
            const candidateHost =
              grant.clientUriHost ?? grant.redirectUriHost ?? null;
            const displayHost =
              candidateHost && !LOOPBACK_HOSTS.has(candidateHost)
                ? candidateHost
                : null;
            const effectiveLogo =
              grant.logoUri ??
              (displayHost ? synthesizeFaviconUrl(displayHost) : null);

            return (
              <TableRow key={grant.id} className="align-top font-sans">
                <TableCell className="bg-card py-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9 rounded-md border border-border">
                      {effectiveLogo && (
                        <AvatarImage
                          src={effectiveLogo}
                          alt=""
                          className="object-contain"
                        />
                      )}
                      <AvatarFallback className="font-medium rounded-md bg-muted font-sans text-xs">
                        {initials(grant.clientName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium leading-tight">
                        {grant.clientName}
                      </span>
                      {displayHost && (
                        <span className="text-xs text-muted-foreground">
                          {clientHref ? (
                            <a
                              href={clientHref}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="hover:underline"
                            >
                              {displayHost}
                            </a>
                          ) : (
                            displayHost
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="bg-card py-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm">{grant.moduleLabel}</span>
                    <div className="flex flex-wrap gap-1">
                      {grant.scopes.map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="font-normal px-1.5 py-0 text-[10px]"
                        >
                          {formatScopeLabel(s)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="bg-card py-3 text-xs text-muted-foreground">
                  {format(new Date(grant.connectedAt), dateFormat)}
                </TableCell>
                <TableCell className="bg-card py-3 text-xs text-muted-foreground">
                  {grant.lastUsedAt
                    ? formatDistanceToNow(new Date(grant.lastUsedAt), {
                        addSuffix: true,
                      })
                    : '—'}
                </TableCell>
                <TableCell className="bg-card py-3 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setConfirmGrant(grant)}
                  >
                    {isPending ? 'Revoking…' : 'Revoke'}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <AlertDialog
        open={Boolean(confirmGrant)}
        onOpenChange={(open) => !open && setConfirmGrant(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmGrant && (
                <>
                  <strong>{confirmGrant.clientName}</strong> will immediately
                  lose access to your{' '}
                  <strong>{confirmGrant.moduleLabel}</strong> data. You can
                  reauthorize it later by signing in again.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmGrant) return;
                const target = confirmGrant;
                setConfirmGrant(null);
                handleRevoke(target);
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
