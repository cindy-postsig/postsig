'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { useCanManageKpis } from '@/hooks/useCanManageKpis';
import { apiClient, ApiRequestError } from '@/lib/api/v2-client';
import { SettingsPage } from '@/components/settings/SettingsPage';
import {
  CustomKpiFields,
  customKpiDraftPayload,
  emptyCustomKpiDraft,
  type CustomKpiDraft,
} from '@/app/(app)/(investor)/investor/components/CustomKpiFields';
import { DeleteCustomKpiDialog } from '@/app/(app)/(investor)/investor/components/DeleteCustomKpiDialog';
import type { KpiDefinition } from '@/lib/v2/kpis/types';
import {
  groupKpisByCategory,
  setAllHidden,
  toggleHidden,
} from './kpi-settings-logic';

interface Props {
  kpis: KpiDefinition[];
  initialHiddenKpiIds: string[];
}

export function KpiSettingsClient({ kpis, initialHiddenKpiIds }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const canManage = useCanManageKpis();
  const [hidden, setHidden] = useState(() => new Set(initialHiddenKpiIds));
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addingCategory, setAddingCategory] = useState<string | null>(null);
  const [draft, setDraft] = useState<CustomKpiDraft>(emptyCustomKpiDraft);
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<KpiDefinition | null>(
    null,
  );
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const groups = groupKpisByCategory(kpis);
  const shownKpis = groups.flatMap(([, categoryKpis]) => categoryKpis);
  const reserveRemoveSlot = shownKpis.some((k) => k.isCustom);

  async function persist(next: Set<string>, savingKey: string) {
    const previous = hidden;
    setHidden(next);
    setSavingId(savingKey);
    try {
      const result = await apiClient.reporting.updateKpiSettings({
        hiddenKpiIds: Array.from(next),
      });
      setHidden(new Set(result.hiddenKpiIds));
      setSavedKey(savingKey);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSavedKey(null), 2000);
      router.refresh();
    } catch (err) {
      setHidden(previous);
      toast({
        variant: 'destructive',
        title: 'Could not update KPI settings',
        description:
          err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.',
      });
    } finally {
      setSavingId(null);
    }
  }

  const onToggle = (kpi: KpiDefinition, enabled: boolean) =>
    persist(toggleHidden(hidden, kpi.publicId, enabled), kpi.publicId);

  const onToggleAll = (
    kpisInScope: KpiDefinition[],
    enabled: boolean,
    savingKey: string,
  ) =>
    persist(
      setAllHidden(
        hidden,
        kpisInScope.map((k) => k.publicId),
        enabled,
      ),
      savingKey,
    );

  const startAdd = (category: string) => {
    setAddingCategory(category);
    setDraft(emptyCustomKpiDraft());
  };
  const cancelAdd = () => {
    setAddingCategory(null);
    setDraft(emptyCustomKpiDraft());
  };

  const handleAdd = async (category: string) => {
    const payload = customKpiDraftPayload(draft);
    if (!payload.label || adding) return;
    setAdding(true);
    try {
      await apiClient.reporting.createCustomKpi({ ...payload, category });
      cancelAdd();
      router.refresh();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not add KPI',
        description:
          err instanceof ApiRequestError
            ? err.message
            : 'Something went wrong. Please try again.',
      });
    } finally {
      setAdding(false);
    }
  };

  const saving = savingId !== null;

  // Visual only (aria-hidden): opacity changes don't trigger live-region
  // announcements, so a single sr-only region below announces saves instead.
  const savedBadge = (key: string) => (
    <span
      aria-hidden="true"
      className={cn(
        'flex items-center gap-1 font-sans-neue text-xs text-muted-foreground transition-opacity duration-300',
        savedKey === key ? 'opacity-100' : 'opacity-0',
      )}
    >
      <CheckCircle2 className="h-3 w-3" />
      Saved
    </span>
  );

  const toggleAllButton = (
    kpisInScope: KpiDefinition[],
    savingKey: string,
    labels: { on: string; off: string },
  ) => {
    const enabled = kpisInScope.every((k) => !hidden.has(k.publicId));
    return (
      <button
        type="button"
        disabled={saving}
        onClick={() => onToggleAll(kpisInScope, !enabled, savingKey)}
        className="font-sans-neue text-xs text-foreground/50 transition-colors hover:text-foreground disabled:opacity-50"
      >
        {enabled ? labels.off : labels.on}
      </button>
    );
  };

  return (
    <SettingsPage className="space-y-6">
      <DeleteCustomKpiDialog
        kpi={pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onDeleted={() => router.refresh()}
      />
      <span aria-live="polite" className="sr-only">
        {savedKey ? 'Saved' : ''}
      </span>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="font-medium">KPIs</h3>
          <p className="text-sm text-muted-foreground">
            Choose which metrics your organization tracks. Disabled KPIs are
            hidden from the KPI tab and from reporting requests. Custom KPIs can
            be added and removed here.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedBadge('all')}
          {canManage &&
            toggleAllButton(shownKpis, 'all', {
              on: 'Enable All',
              off: 'Disable All',
            })}
        </div>
      </div>
      <Separator />
      <div className="space-y-8">
        {groups.map(([category, categoryKpis]) => (
          <div key={category}>
            <div className="mb-3 flex items-center justify-between gap-4">
              <h4 className="font-sans-neue text-[0.65rem] uppercase tracking-wider text-foreground/60">
                {category}
              </h4>
              <div className="flex items-center gap-3">
                {savedBadge(category)}
                {canManage &&
                  toggleAllButton(categoryKpis, category, {
                    on: 'Enable All',
                    off: 'Disable All',
                  })}
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                {categoryKpis.map((kpi, index) => {
                  const enabled = !hidden.has(kpi.publicId);
                  return (
                    <div key={kpi.publicId}>
                      {index > 0 && <Separator />}
                      <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm">
                              {kpi.label}
                            </span>
                            {kpi.isCustom && (
                              <Badge
                                variant="secondary"
                                size="xs"
                                className="font-normal shrink-0"
                              >
                                Custom
                              </Badge>
                            )}
                          </div>
                          {kpi.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {kpi.description}
                            </p>
                          )}
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-3">
                            {savedBadge(kpi.publicId)}
                            <Switch
                              checked={enabled}
                              disabled={saving}
                              onCheckedChange={(checked) =>
                                onToggle(kpi, checked)
                              }
                            />
                            {reserveRemoveSlot && (
                              <span className="flex w-3.5 justify-center">
                                {kpi.isCustom && (
                                  <button
                                    type="button"
                                    aria-label={`Remove ${kpi.label}`}
                                    onClick={() => setPendingDelete(kpi)}
                                    className="text-muted-foreground transition-colors hover:text-foreground"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {canManage && (
                  <>
                    <Separator />
                    <div className="px-5 py-3.5">
                      {addingCategory === category ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <CustomKpiFields
                            draft={draft}
                            onChange={setDraft}
                            onSubmit={() => handleAdd(category)}
                            onCancel={cancelAdd}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleAdd(category)}
                            disabled={!draft.label.trim() || adding}
                          >
                            {adding ? 'Adding…' : 'Add'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelAdd}
                            disabled={adding}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startAdd(category)}
                          className="flex items-center gap-1.5 font-sans-neue text-xs leading-6 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add custom KPI
                        </button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </SettingsPage>
  );
}
