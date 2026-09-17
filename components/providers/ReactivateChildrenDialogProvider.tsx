'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { ReactivatableChild } from '@/lib/v2/contracts/archive';

type SelectReactivateChildren = (
  children: ReactivatableChild[],
) => Promise<number[]>;

const ReactivateChildrenContext =
  createContext<SelectReactivateChildren | null>(null);

/**
 * Returns a function that opens the reactivate-children popup and resolves with
 * the ids the user chose to also mark active (empty array when they skip/close,
 * or when no provider is mounted).
 */
export function useReactivateChildrenSelect(): SelectReactivateChildren {
  const select = useContext(ReactivateChildrenContext);
  return select ?? (async () => []);
}

export function ReactivateChildrenDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ReactivatableChild[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const resolverRef = useRef<((ids: number[]) => void) | null>(null);

  const select = useCallback<SelectReactivateChildren>((childrenToOffer) => {
    setItems(childrenToOffer);
    setSelected(new Set(childrenToOffer.map((child) => child.id)));
    setOpen(true);
    return new Promise<number[]>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((ids: number[]) => {
    setOpen(false);
    resolverRef.current?.(ids);
    resolverRef.current = null;
  }, []);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(items.map((c) => c.id)));

  return (
    <ReactivateChildrenContext.Provider value={select}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) settle([]);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reactivate related contracts?</DialogTitle>
            <DialogDescription>
              These archived contracts are linked to the one you reactivated.
              Select any you also want to mark active.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 border-b pb-2">
            <Checkbox
              id="reactivate-all"
              checked={
                allSelected ? true : someSelected ? 'indeterminate' : false
              }
              variant={someSelected && !allSelected ? 'minus' : 'check'}
              onCheckedChange={toggleAll}
            />
            <label htmlFor="reactivate-all" className="font-medium text-sm">
              Select all ({items.length})
            </label>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {items.map((child) => (
              <div key={child.id} className="flex items-center gap-2">
                <Checkbox
                  id={`reactivate-${child.id}`}
                  checked={selected.has(child.id)}
                  onCheckedChange={() => toggle(child.id)}
                />
                <label
                  htmlFor={`reactivate-${child.id}`}
                  className="text-sm text-foreground"
                >
                  {child.label}
                </label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => settle([])}>
              Skip
            </Button>
            <Button
              onClick={() => settle([...selected])}
              disabled={selected.size === 0}
            >
              Reactivate selected ({selected.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ReactivateChildrenContext.Provider>
  );
}
