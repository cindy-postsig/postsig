'use client';

import * as React from 'react';
import { useToast } from '@/components/ui/use-toast';
import { saveListViewColumns } from '@/app/lib/actions/list-view-columns';
import {
  EMPTY_COLUMN_LAYOUT_STORE,
  type ColumnLayout,
  type ColumnLayoutStore,
  type ColumnLayoutViewKey,
} from '@/components/contracts/columnLayout';

const SAVE_DEBOUNCE_MS = 500;

type ColumnLayoutContextValue = {
  store: ColumnLayoutStore;
  setLayout: (viewKey: ColumnLayoutViewKey, layout: ColumnLayout) => void;
  resetLayout: (viewKey: ColumnLayoutViewKey) => void;
};

const ColumnLayoutContext =
  React.createContext<ColumnLayoutContextValue | null>(null);

/**
 * Single owner of every view's column layout.
 *
 * Deliberately not per-table state: Calendar renders three tables that share
 * one layout key and Radix unmounts inactive tabs, so per-table state would
 * re-seed from the stale server prop and silently revert a change on tab
 * switch. Being the sole writer also keeps the shared preference row's
 * read-modify-write coherent.
 */
export function ColumnLayoutProvider({
  initialStore,
  children,
}: {
  initialStore?: ColumnLayoutStore;
  children: React.ReactNode;
}) {
  const [store, setStore] = React.useState<ColumnLayoutStore>(
    initialStore ?? EMPTY_COLUMN_LAYOUT_STORE,
  );
  const { toast } = useToast();

  const storeRef = React.useRef(store);
  storeRef.current = store;

  // Keyed by view so two views saving at once don't cancel each other.
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const persist = React.useCallback(
    (viewKey: ColumnLayoutViewKey, layout: ColumnLayout | null) => {
      // Capture only this view's prior layout. Snapshotting the whole store
      // would roll back every other view too, discarding edits made elsewhere
      // while this save was in flight.
      const previousForView = storeRef.current.views[viewKey];

      const rollback = () => {
        setStore((current) => {
          const views = { ...current.views };
          if (previousForView) views[viewKey] = previousForView;
          else delete views[viewKey];
          return { version: 1, views };
        });
        toast({
          title: 'Column layout not saved',
          description: 'Your change was reverted. Please try again.',
          variant: 'destructive',
        });
      };

      const existing = timers.current.get(viewKey);
      if (existing) clearTimeout(existing);

      timers.current.set(
        viewKey,
        setTimeout(() => {
          timers.current.delete(viewKey);
          void saveListViewColumns(viewKey, layout)
            .then((result) => {
              if (!result.ok) rollback();
            })
            // A server action can reject outright (network, deploy mid-flight),
            // which the result check never sees.
            .catch(() => rollback());
        }, SAVE_DEBOUNCE_MS),
      );
    },
    [toast],
  );

  const setLayout = React.useCallback(
    (viewKey: ColumnLayoutViewKey, layout: ColumnLayout) => {
      setStore((current) => ({
        version: 1,
        views: { ...current.views, [viewKey]: layout },
      }));
      persist(viewKey, layout);
    },
    [persist],
  );

  const resetLayout = React.useCallback(
    (viewKey: ColumnLayoutViewKey) => {
      setStore((current) => {
        const views = { ...current.views };
        delete views[viewKey];
        return { version: 1, views };
      });
      persist(viewKey, null);
    },
    [persist],
  );

  const value = React.useMemo(
    () => ({ store, setLayout, resetLayout }),
    [store, setLayout, resetLayout],
  );

  return (
    <ColumnLayoutContext.Provider value={value}>
      {children}
    </ColumnLayoutContext.Provider>
  );
}

export type UseColumnLayout = {
  layout: ColumnLayout | null;
  setLayout: (layout: ColumnLayout) => void;
  reset: () => void;
};

/**
 * Read and write one view's layout. Returns a null layout (defaults, no
 * controls wired) when the provider is absent, so tables outside the app
 * layout keep working.
 */
export function useColumnLayout(
  viewKey: ColumnLayoutViewKey | undefined,
): UseColumnLayout {
  const context = React.useContext(ColumnLayoutContext);
  const layout = viewKey ? (context?.store.views[viewKey] ?? null) : null;

  const setLayout = React.useCallback(
    (next: ColumnLayout) => {
      if (viewKey) context?.setLayout(viewKey, next);
    },
    [context, viewKey],
  );

  const reset = React.useCallback(() => {
    if (viewKey) context?.resetLayout(viewKey);
  }, [context, viewKey]);

  return { layout, setLayout, reset };
}
