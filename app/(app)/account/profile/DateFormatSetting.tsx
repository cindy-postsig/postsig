'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { invalidateOrganizationDataCache } from '@/app/lib/actions/cache-actions';
import {
  deleteUserPreference,
  setUserPreference,
} from '@/app/lib/actions/preferences';
import {
  DATE_FORMAT_PATTERNS,
  formatDate,
  resolveDateFormat,
} from '@/lib/date-format';
import { cn } from '@/lib/utils';

// The nine patterns split into their three separator groups (dash / dot /
// slash), matching the order of DATE_FORMAT_PATTERNS.
const PATTERN_GROUPS = [
  DATE_FORMAT_PATTERNS.slice(0, 3),
  DATE_FORMAT_PATTERNS.slice(3, 6),
  DATE_FORMAT_PATTERNS.slice(6, 9),
];

interface Props {
  userId: string;
  initialPattern: string | null;
  orgPattern: string | null;
}

export function DateFormatSetting({
  userId,
  initialPattern,
  orgPattern,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // The org's effective default is one of the nine patterns. When the user has
  // no override, that pattern is selected; picking it clears the override so the
  // user keeps following the org default.
  const orgDefault = resolveDateFormat(null, orgPattern);
  const [value, setValue] = useState<string>(initialPattern ?? orgDefault);

  const today = new Date();

  async function onChange(next: string) {
    setValue(next);
    setSaving(true);
    try {
      const ok =
        next === orgDefault
          ? await deleteUserPreference(userId, 'regional.date_format')
          : await setUserPreference(userId, 'regional.date_format', next);
      if (!ok) throw new Error('Could not save date format');
      try {
        await invalidateOrganizationDataCache();
      } catch {
        // best-effort; router.refresh() below pulls fresh data
      }
      toast({ description: 'Date format updated' });
      router.refresh();
    } catch (err) {
      setValue(initialPattern ?? orgDefault);
      toast({
        variant: 'destructive',
        description:
          err instanceof Error ? err.message : 'Could not save date format',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h4 className="font-medium text-base">Date Format</h4>
      </div>
      <Card>
        <CardContent className="p-0">
          <div
            className={cn(
              'grid grid-cols-[160px_1fr] items-center gap-4 px-5 py-4',
            )}
          >
            <div className="text-sm text-muted-foreground">Date format</div>
            <div className="flex items-center">
              <Select value={value} onValueChange={onChange} disabled={saving}>
                <SelectTrigger className="w-80">
                  <div className="flex w-full items-center gap-6 font-mono">
                    <span>{value.toUpperCase()}</span>
                    <span className="text-muted-foreground">
                      {formatDate(today, value)}
                    </span>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {PATTERN_GROUPS.map((group, groupIndex) => (
                    <Fragment key={group[0]}>
                      {groupIndex > 0 && <SelectSeparator />}
                      {group.map((pattern) => (
                        <SelectItem key={pattern} value={pattern}>
                          <span className="flex w-full items-center gap-6">
                            <span className="font-mono">
                              {pattern.toUpperCase()}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              {formatDate(today, pattern)}
                            </span>
                            {pattern === orgDefault && (
                              <span className="ml-auto text-xs text-muted-foreground">
                                Org default
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
