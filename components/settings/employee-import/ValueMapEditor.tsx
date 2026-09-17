'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { COUNTRIES_ALPHA3 } from '@/constants/countries';
import { useCreateBusinessGroup } from '@/hooks/api/useOrgUnits';
import { normalizeValueMapKey } from '@/lib/v2/employee-import/resolve-rows';
import type { ImportTargetField } from '@/lib/v2/employee-import/types';
import logger from '@/utils/pino';

const NONE = '__none__';
const CREATE = '__create__';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: ImportTargetField;
  fieldLabel: string;
  /** Distinct values from the file that still need a target. */
  sourceValues: string[];
  valueMap: Record<string, string> | undefined;
  orgGroups: Array<{ id: number; name: string }>;
  onGroupCreated: (group: { id: number; name: string }) => void;
  onSave: (valueMap: Record<string, string> | undefined) => void;
};

export function ValueMapEditor({
  open,
  onOpenChange,
  field,
  fieldLabel,
  sourceValues,
  valueMap,
  orgGroups,
  onGroupCreated,
  onSave,
}: Props) {
  const createBusinessGroup = useCreateBusinessGroup();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const isCountry = field === 'country';
  const isBusinessGroup = field === 'business_group';

  // Seed the left column from the values actually present in the file, so the
  // admin fills a known list rather than typing source values from memory.
  // Matching is case- and whitespace-insensitive, so one normalized key is one
  // row no matter how the file spells it.
  const rows = useMemo(() => {
    const seen = new Map<string, string>();
    for (const value of sourceValues) {
      const key = normalizeValueMapKey(value);
      if (key !== '' && !seen.has(key)) seen.set(key, value);
    }
    // A mapping saved against a value the file no longer contains still needs a
    // row, and its normalized key is the only spelling left to show.
    for (const key of Object.keys(valueMap ?? {})) {
      if (!seen.has(key)) seen.set(key, key);
    }
    return Array.from(seen.entries()).map(([key, display]) => ({
      key,
      display,
    }));
  }, [sourceValues, valueMap]);

  const autoMatched = useMemo(() => {
    if (!isBusinessGroup) return new Map<string, string>();
    return new Map(
      orgGroups.map((group) => [normalizeValueMapKey(group.name), group.name]),
    );
  }, [isBusinessGroup, orgGroups]);

  const current = (key: string) =>
    draft[key] ?? valueMap?.[key] ?? autoMatched.get(key) ?? '';

  const isAutoMatched = (key: string) =>
    draft[key] === undefined &&
    valueMap?.[key] === undefined &&
    autoMatched.has(key);

  const setValue = (key: string, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name || !creatingFor) return;

    setIsCreating(true);
    try {
      const { group } = await createBusinessGroup.mutateAsync(name);
      onGroupCreated(group);
      setValue(creatingFor, group.name);
      setCreatingFor(null);
      setNewGroupName('');
    } catch (err) {
      logger.error({ err, name }, 'Failed to create group from value map');
      toast({
        title: 'Error',
        description:
          err instanceof Error ? err.message : 'Failed to create the group',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSave = () => {
    const merged: Record<string, string> = { ...valueMap, ...draft };
    const cleaned = Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value.trim() !== ''),
    );
    onSave(Object.keys(cleaned).length > 0 ? cleaned : undefined);
    setDraft({});
    onOpenChange(false);
  };

  const mappedCount = rows.filter((r) => current(r.key) !== '').length;
  const autoCount = rows.filter((r) => isAutoMatched(r.key)).length;

  const emptyMessage = isCountry
    ? 'Every location in your file was matched automatically — nothing to fix here.'
    : 'Choose a source column for this field first, then its values will be listed here.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100vh-4rem)] min-w-0 max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {isCountry ? 'Unmatched locations' : `Map values — ${fieldLabel}`}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto">
          <p className="mb-3 text-sm text-muted-foreground">
            {rows.length === 0
              ? emptyMessage
              : isCountry
                ? `${mappedCount} of ${rows.length} unmatched locations set. Anything left blank imports with no country.`
                : `${mappedCount} of ${rows.length} values mapped${
                    autoCount > 0
                      ? `, ${autoCount} matched automatically by name`
                      : ''
                  }. Anything left blank imports empty.`}
          </p>

          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3"
              >
                <div className="min-w-0">
                  <Label
                    className="font-normal block truncate text-sm"
                    title={row.display}
                  >
                    {row.display}
                  </Label>
                  {isAutoMatched(row.key) && (
                    <span className="text-xs text-muted-foreground">
                      Matched by name
                    </span>
                  )}
                </div>

                {isCountry && (
                  <Select
                    value={current(row.key) || NONE}
                    onValueChange={(value) =>
                      setValue(row.key, value === NONE ? '' : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— None —</SelectItem>
                      {COUNTRIES_ALPHA3.map((country) => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {isBusinessGroup &&
                  (creatingFor === row.key ? (
                    <div className="flex items-center gap-2">
                      <Input
                        autoFocus
                        value={newGroupName}
                        placeholder="New group name"
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                          }
                          if (e.key === 'Enter') handleCreateGroup();
                          if (e.key === 'Escape') setCreatingFor(null);
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-8 shrink-0"
                        disabled={isCreating || !newGroupName.trim()}
                        onClick={handleCreateGroup}
                      >
                        {isCreating ? 'Adding…' : 'Add'}
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={current(row.key) || NONE}
                      onValueChange={(value) => {
                        if (value === CREATE) {
                          setNewGroupName(row.display);
                          setCreatingFor(row.key);
                          return;
                        }
                        setValue(row.key, value === NONE ? '' : value);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a business group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— No override —</SelectItem>
                        {orgGroups.map((group) => (
                          <SelectItem key={group.id} value={group.name}>
                            {group.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={CREATE}>
                          + Create new group…
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ))}

                {!isCountry && !isBusinessGroup && (
                  <Input
                    value={current(row.key)}
                    placeholder="Leave blank to skip"
                    onChange={(e) => setValue(row.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setDraft({});
              setCreatingFor(null);
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSave}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
