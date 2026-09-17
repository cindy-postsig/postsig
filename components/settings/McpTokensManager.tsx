'use client';

import { useCallback, useState, useTransition } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  createMcpToken,
  deleteMcpToken,
  listMcpTokens,
  revealMcpToken,
  revokeMcpToken,
  type McpTokenSummary,
} from '@/app/lib/actions/mcp-tokens';

interface McpTokensManagerProps {
  initialTokens: McpTokenSummary[];
  defaultTokenName: string;
}

export function McpTokensManager({
  initialTokens,
  defaultTokenName,
}: McpTokensManagerProps) {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<McpTokenSummary[]>(initialTokens);
  const [name, setName] = useState(defaultTokenName);
  const [creating, startCreating] = useTransition();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const startPending = (tokenId: string) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.add(tokenId);
      return next;
    });
  };

  const endPending = (tokenId: string) => {
    setPendingIds((prev) => {
      if (!prev.has(tokenId)) return prev;
      const next = new Set(prev);
      next.delete(tokenId);
      return next;
    });
  };
  const [newToken, setNewToken] = useState<{
    id: string;
    plaintext: string;
  } | null>(null);
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {},
  );
  const [formOpen, setFormOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    tokenId: string;
    tokenName: string;
    kind: 'revoke' | 'delete';
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const refreshTokens = useCallback(async () => {
    const { tokens: latest } = await listMcpTokens();
    setTokens(latest);
  }, []);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({
        variant: 'destructive',
        title: 'Name required',
        description: 'Give your token a label so you can identify it later.',
      });
      return;
    }
    startCreating(async () => {
      let result;
      try {
        result = await createMcpToken({ name: trimmed });
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Could not create token',
          description: err instanceof Error ? err.message : 'Unknown error',
        });
        return;
      }
      setNewToken({ id: result.id, plaintext: result.plaintext });
      setName(defaultTokenName);
      setFormOpen(false);
      try {
        await refreshTokens();
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Token created, but list could not be refreshed',
          description: err instanceof Error ? err.message : 'Reload the page.',
        });
      }
    });
  };

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 2000);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Copy failed',
        description: 'Your browser blocked clipboard access.',
      });
    }
  };

  const handleReveal = async (tokenId: string) => {
    if (revealedValues[tokenId]) {
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      });
      return;
    }
    startPending(tokenId);
    try {
      const plaintext = await revealMcpToken(tokenId);
      setRevealedValues((prev) => ({ ...prev, [tokenId]: plaintext }));
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not reveal token',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      endPending(tokenId);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    startPending(tokenId);
    try {
      try {
        await revokeMcpToken(tokenId);
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Could not revoke token',
          description: err instanceof Error ? err.message : 'Unknown error',
        });
        return;
      }
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      });
      toast({ description: 'Token revoked' });
      try {
        await refreshTokens();
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Revoked, but list could not be refreshed',
          description: err instanceof Error ? err.message : 'Reload the page.',
        });
      }
    } finally {
      endPending(tokenId);
    }
  };

  const handleDelete = async (tokenId: string) => {
    startPending(tokenId);
    try {
      try {
        await deleteMcpToken(tokenId);
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Could not delete token',
          description: err instanceof Error ? err.message : 'Unknown error',
        });
        return;
      }
      setRevealedValues((prev) => {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      });
      toast({ description: 'Token deleted' });
      try {
        await refreshTokens();
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Deleted, but list could not be refreshed',
          description: err instanceof Error ? err.message : 'Reload the page.',
        });
      }
    } finally {
      endPending(tokenId);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="font-medium">MCP Server Access Tokens</h4>
            <p className="text-sm text-muted-foreground">
              These tokens are for test usage of our MCP server.
            </p>
          </div>
          {!formOpen && (
            <Button onClick={() => setFormOpen(true)} className="shrink-0">
              <KeyRound className="h-4 w-4" />
              New token
            </Button>
          )}
        </div>

        {formOpen && (
          <div className="flex items-center gap-2">
            <Input
              id="mcp-token-name"
              className="h-9"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !creating) handleCreate();
                if (e.key === 'Escape') {
                  setFormOpen(false);
                  setName(defaultTokenName);
                }
              }}
              placeholder="Token name — e.g. Claude Desktop"
              aria-label="Token name"
              maxLength={80}
              disabled={creating}
              autoFocus
            />
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="shrink-0"
            >
              {creating ? 'Generating…' : 'Generate'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setFormOpen(false);
                setName(defaultTokenName);
              }}
              disabled={creating}
              className="shrink-0"
            >
              Cancel
            </Button>
          </div>
        )}

        {newToken && (
          <div className="border-green-200 bg-green-50/60 space-y-2 rounded-md border p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="text-green-900 font-medium flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green" />
                Token created
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-green-900/70 hover:text-green-900 -mr-1 -mt-1 h-6 w-6"
                onClick={() => setNewToken(null)}
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2 rounded border bg-muted p-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap pl-2 font-mono text-xs">
                {newToken.plaintext}
              </code>
              <Button
                variant="outline"
                className="bg-card/80 hover:bg-card"
                size="sm"
                onClick={() => handleCopy(newToken.plaintext, 'new')}
              >
                {copiedKey === 'new' ? (
                  <>
                    <Check className="text-green-600 h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Treat this like a password. Expires in 30 days. You can view it
              again from the table below until then.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h4 className="font-medium text-sm">Your tokens</h4>
        {tokens.length === 0 ? (
          <div className="rounded border p-8 text-center">
            <p className="text-xs text-muted-foreground">
              No tokens yet. Create one above to start using the MCP server.
            </p>
          </div>
        ) : (
          <Table stickyHeader scrollClassName="rounded border">
            <TableHeader>
              <TableRow>
                <TableHead className="py-3 text-xs">Name</TableHead>
                <TableHead className="py-3 text-xs">Token</TableHead>
                <TableHead className="py-3 text-xs">Created</TableHead>
                <TableHead className="py-3 text-xs">Last used</TableHead>
                <TableHead className="py-3 text-xs">Expires</TableHead>
                <TableHead className="w-[1%] py-3" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => {
                const revealed = revealedValues[token.id];
                const isPending = pendingIds.has(token.id);
                const isRevoked = Boolean(token.revokedAt);
                return (
                  <TableRow key={token.id} className="align-top font-sans">
                    <TableCell className="bg-card py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium leading-tight">
                            {token.name}
                          </span>
                          {isRevoked && (
                            <Badge variant="secondary" size={'xs'}>
                              Revoked
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {token.scopes.map((s) => (
                            <Badge
                              key={s}
                              variant="outline"
                              className="font-normal px-1.5 py-0 text-[10px]"
                            >
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="bg-card py-3">
                      <div className="flex items-center gap-1.5">
                        <code className="block max-w-[60ch] truncate rounded bg-muted px-1.5 py-1 font-mono text-xs">
                          {revealed ?? `${token.tokenPrefix}••••••••`}
                        </code>
                        {token.revealable && !isRevoked && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => handleReveal(token.id)}
                            disabled={isPending}
                            aria-label={revealed ? 'Hide token' : 'Show token'}
                            title={revealed ? 'Hide' : 'Show'}
                          >
                            {revealed ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        {revealed && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => handleCopy(revealed, token.id)}
                            aria-label="Copy token"
                            title="Copy"
                          >
                            {copiedKey === token.id ? (
                              <Check className="text-green-600 h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="bg-card py-3 text-xs text-muted-foreground">
                      {format(new Date(token.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="bg-card py-3 text-xs text-muted-foreground">
                      {token.lastUsedAt
                        ? formatDistanceToNow(new Date(token.lastUsedAt), {
                            addSuffix: true,
                          })
                        : 'Never'}
                    </TableCell>
                    <TableCell className="bg-card py-3 text-xs text-muted-foreground">
                      {token.expiresAt
                        ? (() => {
                            const expiry = new Date(token.expiresAt);
                            const expired = expiry.getTime() < Date.now();
                            return (
                              <span
                                className={
                                  expired ? 'text-destructive' : undefined
                                }
                              >
                                {format(expiry, 'MMM d, yyyy')}
                              </span>
                            );
                          })()
                        : '—'}
                    </TableCell>
                    <TableCell className="bg-card py-3 text-right">
                      <div className="flex items-center justify-end gap-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={isPending}
                              aria-label="Token actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!isRevoked && (
                              <>
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setConfirmAction({
                                      tokenId: token.id,
                                      tokenName: token.name,
                                      kind: 'revoke',
                                    })
                                  }
                                >
                                  Revoke
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem
                              className="text-destructive"
                              onSelect={() =>
                                setConfirmAction({
                                  tokenId: token.id,
                                  tokenName: token.name,
                                  kind: 'delete',
                                })
                              }
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <AlertDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.kind === 'revoke'
                ? 'Revoke token?'
                : 'Delete token?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.kind === 'revoke' ? (
                <>
                  Anything using <strong>{confirmAction.tokenName}</strong> will
                  immediately lose access. This cannot be undone.
                </>
              ) : confirmAction ? (
                <>
                  This permanently removes{' '}
                  <strong>{confirmAction.tokenName}</strong> and its history.
                  This cannot be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmAction) return;
                const { tokenId, kind } = confirmAction;
                setConfirmAction(null);
                if (kind === 'revoke') handleRevoke(tokenId);
                else handleDelete(tokenId);
              }}
            >
              {confirmAction?.kind === 'revoke' ? 'Revoke' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
