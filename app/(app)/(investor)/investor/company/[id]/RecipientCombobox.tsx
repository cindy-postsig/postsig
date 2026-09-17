'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Mail } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserAvatar } from '@/components/ui/user-avatar';
import { apiClient } from '@/lib/api/v2-client';
import { isFreemailEmail } from '@/lib/v2/kpis/transforms';
import type { PortcoUserOption } from '@/lib/v2/kpis/types';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function RecipientCombobox({
  companyId,
  excludeEmails,
  onSelect,
  disabled,
  label = 'Add recipients',
}: {
  companyId: number;
  excludeEmails: string[];
  onSelect: (email: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<PortcoUserOption[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiClient.reporting
      .listPortcoUsers(companyId)
      .then(({ users }) => {
        if (!cancelled) setOptions(users);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const exclude = useMemo(
    () => new Set(excludeEmails.map((e) => e.toLowerCase())),
    [excludeEmails],
  );

  const term = query.trim().toLowerCase();
  const filtered = options.filter(
    (o) =>
      !exclude.has(o.email.toLowerCase()) &&
      (!term ||
        o.email.toLowerCase().includes(term) ||
        (o.name ?? '').toLowerCase().includes(term)),
  );
  // Personal (freemail) addresses can't be invited — the server rejects them —
  // so the invite row is replaced with an explanation instead of failing later.
  const isPersonalEmail = EMAIL_RE.test(term) && isFreemailEmail(term);
  const canInvite =
    EMAIL_RE.test(term) &&
    !isPersonalEmail &&
    !exclude.has(term) &&
    !options.some((o) => o.email.toLowerCase() === term);

  // Keyboard navigation targets, in render order: matching recipients, then the
  // invite row. Focus stays on the Input, so cmdk can't drive this itself.
  const navItems = [
    ...filtered.map((o) => o.email),
    ...(canInvite ? [term] : []),
  ];

  useEffect(() => setActive(0), [term, open]);

  const choose = (email: string) => {
    onSelect(email.trim().toLowerCase());
    setQuery('');
    setOpen(false);
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Opening keeps index 0 highlighted; only move once already open.
      if (!open) {
        setOpen(true);
        return;
      }
      if (navItems.length === 0) return;
      setActive((i) => Math.min(navItems.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (navItems.length === 0) return;
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (open && navItems[active] != null) {
        e.preventDefault();
        choose(navItems[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="font-medium text-sm">{label}</Label>
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <div className="relative">
            <Input
              placeholder="Search or enter email…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onClick={() => setOpen(true)}
              onKeyDown={onInputKeyDown}
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className="h-10 w-full text-sm"
            />
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandList className="max-h-60">
              {filtered.length === 0 && !canInvite && !isPersonalEmail && (
                <CommandEmpty>No recipients found.</CommandEmpty>
              )}
              {filtered.length > 0 && (
                <CommandGroup>
                  {filtered.map((o, idx) => (
                    <CommandItem
                      key={o.id}
                      value={o.email}
                      onSelect={() => choose(o.email)}
                      onMouseMove={() => setActive(idx)}
                      data-active={active === idx || undefined}
                      className="cursor-pointer data-[active]:bg-accent"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <UserAvatar name={o.name} email={o.email} size="md" />
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium truncate text-sm">
                            {o.name ?? o.email}
                          </span>
                          {o.name && (
                            <span className="truncate text-xs text-muted-foreground">
                              {o.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {isPersonalEmail && (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  Personal email addresses can&apos;t be invited. Enter their
                  work email.
                </p>
              )}
              {canInvite && (
                <CommandGroup heading="Invite">
                  <CommandItem
                    value={`invite-${term}`}
                    onSelect={() => choose(term)}
                    onMouseMove={() => setActive(filtered.length)}
                    data-active={active === filtered.length || undefined}
                    className="cursor-pointer data-[active]:bg-accent"
                  >
                    <div className="flex h-6 w-6 items-center justify-center">
                      <Mail className="h-4 w-4" strokeWidth={1.5} />
                    </div>
                    <div>
                      <div className="font-medium text-sm">Invite {term}</div>
                      <div className="text-xs text-muted-foreground">
                        Send a secure link to submit
                      </div>
                    </div>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
