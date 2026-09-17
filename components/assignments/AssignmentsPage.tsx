'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  createParser,
  useQueryState,
  useQueryStates,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs';
import { Button } from '@/components/ui/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAssignmentsPayload } from '@/hooks/api/useAssignmentsPayload';
import { panelLayoutCookieStorage } from '@/lib/panel-layout-cookie';
import {
  ASSIGNMENTS_DEFAULT_LAYOUT,
  ASSIGNMENTS_SIDEBAR_ID,
} from '@/lib/v2/assignments/layout';
import { computeScopeMetrics } from '@/lib/v2/assignments/metrics';
import {
  buildProductRows,
  buildUnderusedRows,
  buildUserRows,
  type ProductRow,
} from '@/lib/v2/assignments/rows';
import type { AssignmentsPayload, ScopeKey } from '@/lib/v2/assignments/types';
import { FIRMWIDE } from '@/lib/v2/assignments/types';
import {
  assignmentsWindow,
  isAssignmentsMonth,
  stepMonth,
} from '@/lib/v2/assignments/window';
import type { OrgUnitTreeLevel } from '@/lib/v2/org-units/levels';
import { AssignmentsKpiCards } from './AssignmentsKpiCards';
import { ProductSheet, type ProductSheetTab } from './ProductSheet';
import { ProductsTable } from './ProductsTable';
import { ScopeBreadcrumb } from './ScopeBreadcrumb';
import { ScopeTree } from './ScopeTree';
import { UnderusedTable } from './UnderusedTable';
import { UserProfilePanel } from './UserProfilePanel';
import { UsersTable } from './UsersTable';

// The library hides overflow on the group and its panels, which would turn
// them into the containing blocks for the rail's sticky column.
const UNCLIPPED = { overflow: 'visible' } as const;

const TABS = ['products', 'users', 'underused'] as const;
type TabKey = (typeof TABS)[number];
const isTabKey = (value: string): value is TabKey =>
  (TABS as readonly string[]).includes(value);

// The same guard the server applies to the param, so a month the URL cannot
// mean falls back to the rendered one instead of reaching the stepper.
const parseAsMonth = createParser({
  parse: (value) => (isAssignmentsMonth(value) ? value : null),
  serialize: (value: string) => value,
});

export function AssignmentsPage({
  initialPayload,
  pathLevels,
  baseCurrency,
  dateFormat,
  defaultLayout = ASSIGNMENTS_DEFAULT_LAYOUT,
}: {
  initialPayload: AssignmentsPayload;
  /** The org's HR levels in order: the columns the Users table shows. */
  pathLevels: readonly OrgUnitTreeLevel[];
  baseCurrency: string;
  dateFormat: string;
  /** Rail and content shares, in percent, as last saved by this reader. */
  defaultLayout?: number[];
}) {
  // Scope, tab and the selected person are shallow query state: the whole tree
  // ships in one payload, so drilling in is a pure re-derivation that never
  // re-runs the server component, and the URL stays shareable. Drilling into
  // a unit or a person is a step the browser's Back button must undo, so
  // those two push history; a tab switch replaces it.
  const [{ unit, tab, user: userParam }, setQuery] = useQueryStates({
    unit: parseAsString.withDefault('').withOptions({ history: 'push' }),
    tab: parseAsStringLiteral(TABS).withDefault('products'),
    user: parseAsString.withDefault('').withOptions({ history: 'push' }),
  });

  // The month is shallow too: it changes what the engine was asked for, but the
  // answer comes from the API rather than a server-component re-render, so the
  // whole payload is not re-shipped with the rest of the page.
  const [month, setMonth] = useQueryState(
    'month',
    parseAsMonth.withDefault(initialPayload.window.month),
  );
  const {
    data,
    isFetching: monthLoading,
    isError: monthFailed,
  } = useAssignmentsPayload(month, initialPayload);
  const payload = data ?? initialPayload;

  const scope: ScopeKey = useMemo(() => {
    const id = Number(unit);
    return unit !== '' && Number.isFinite(id) && payload.nodes[id]
      ? id
      : FIRMWIDE;
  }, [unit, payload.nodes]);

  const selectedUser = useMemo(() => {
    const id = Number(userParam);
    if (userParam === '' || !Number.isFinite(id)) return null;
    return payload.users[id] ?? null;
  }, [userParam, payload.users]);

  const breadcrumbScope: ScopeKey = selectedUser
    ? (selectedUser.orgUnitId ?? FIRMWIDE)
    : scope;

  const [product, setProduct] = useState<{
    row: ProductRow;
    tab: ProductSheetTab;
  } | null>(null);

  const metrics = useMemo(
    () => computeScopeMetrics(payload, scope),
    [payload, scope],
  );
  const productGroups = useMemo(
    () => buildProductRows(payload, scope),
    [payload, scope],
  );
  const userRows = useMemo(
    () => buildUserRows(payload, scope),
    [payload, scope],
  );
  const underusedRows = useMemo(
    () => buildUnderusedRows(payload, scope),
    [payload, scope],
  );

  const selectScope = (next: ScopeKey) => {
    setProduct(null);
    void setQuery({ unit: next === FIRMWIDE ? '' : String(next), user: '' });
  };
  // Stable, or every render hands the tables new columns, which invalidates
  // their row models and queues a page reset that can land before they mount.
  const selectUser = useCallback(
    (employeeId: number) => void setQuery({ user: String(employeeId) }),
    [setQuery],
  );
  const openProduct = useCallback(
    (row: ProductRow, sheetTab: ProductSheetTab) =>
      setProduct({ row, tab: sheetTab }),
    [],
  );

  if (payload.empty) {
    return (
      <PageBody>
        <PageHeading />
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No employees yet. Assignments reads the HR roster to work out who
            holds what.
          </p>
          <Link
            href="/settings/employees"
            className="mt-2 inline-block text-sm underline"
          >
            Go to Settings › Employees
          </Link>
        </div>
      </PageBody>
    );
  }

  return (
    <ResizablePanelGroup
      direction="horizontal"
      autoSaveId={ASSIGNMENTS_SIDEBAR_ID}
      storage={panelLayoutCookieStorage}
      style={UNCLIPPED}
    >
      <ResizablePanel
        defaultSize={defaultLayout[0]}
        minSize={12}
        maxSize={40}
        className="flex min-w-0"
        style={UNCLIPPED}
      >
        <ScopeTree
          payload={payload}
          pathLevels={pathLevels}
          scope={scope}
          selectedUserId={selectedUser?.id ?? null}
          onSelectScope={selectScope}
          onSelectUser={selectUser}
        />
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel
        defaultSize={defaultLayout[1]}
        className="min-w-0"
        style={UNCLIPPED}
      >
        <PageBody>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <PageHeading />
            <MonthStepper
              month={month}
              busy={monthLoading}
              failed={monthFailed}
              onStep={(months) => void setMonth(stepMonth(month, months))}
            />
          </div>
          <ScopeBreadcrumb
            nodes={payload.nodes}
            scope={breadcrumbScope}
            userName={selectedUser?.name}
            onSelect={selectScope}
          />

          {selectedUser ? (
            <UserProfilePanel
              user={selectedUser}
              payload={payload}
              pathLevels={pathLevels}
              baseCurrency={baseCurrency}
              dateFormat={dateFormat}
            />
          ) : (
            <>
              <AssignmentsKpiCards
                metrics={metrics}
                baseCurrency={baseCurrency}
                windowLabel={payload.window.label}
              />

              <Tabs
                size="default"
                value={tab}
                onValueChange={(next) => {
                  if (isTabKey(next)) void setQuery({ tab: next });
                }}
              >
                <TabsList className="w-full justify-start border-b">
                  <TabsTrigger value="products">Products in scope</TabsTrigger>
                  <TabsTrigger value="users">User assignments</TabsTrigger>
                  <TabsTrigger value="underused">
                    Underutilized licences ({underusedRows.length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="products" className="mt-4">
                  <ProductsTable groups={productGroups} onOpen={openProduct} />
                </TabsContent>
                <TabsContent value="users" className="mt-4">
                  <UsersTable
                    rows={userRows}
                    pathLevels={pathLevels}
                    onSelect={selectUser}
                  />
                </TabsContent>
                <TabsContent value="underused" className="mt-4">
                  <UnderusedTable
                    rows={underusedRows}
                    onSelectUser={selectUser}
                  />
                </TabsContent>
              </Tabs>
            </>
          )}
        </PageBody>
      </ResizablePanel>

      <ProductSheet
        product={product?.row ?? null}
        payload={payload}
        defaultTab={product?.tab ?? 'details'}
        baseCurrency={baseCurrency}
        dateFormat={dateFormat}
        onClose={() => setProduct(null)}
      />
    </ResizablePanelGroup>
  );
}

/**
 * The month every figure is priced for. The label names the month that was
 * asked for rather than the one still on screen, so a step reads as immediate
 * while the tables below keep the previous month until its replacement lands.
 */
function MonthStepper({
  month,
  busy,
  failed,
  onStep,
}: {
  month: string;
  busy: boolean;
  failed: boolean;
  onStep: (months: number) => void;
}) {
  const { label } = assignmentsWindow(month);

  return (
    <div className="flex items-center gap-3">
      {failed && (
        <span className="text-xs text-destructive">Couldn’t load {label}.</span>
      )}
      <div className="flex items-center gap-1" aria-busy={busy}>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Previous month"
          disabled={busy}
          onClick={() => onStep(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium min-w-32 text-center font-sans text-sm">
          {label}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label="Next month"
          disabled={busy}
          onClick={() => onStep(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// The route is full-width (LayoutWrapper), so the content column carries the
// page padding itself, as the invoices layout does beside its sidebar.
function PageBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 px-6 pb-24 pt-6 2xl:px-8 2xl:pt-8">
      {children}
    </div>
  );
}

function PageHeading() {
  return (
    <div>
      <p className="font-label text-xs uppercase tracking-wide text-muted-foreground">
        Inventory management
      </p>
      <h1 className="mt-1 font-serif leading-none">Assignments</h1>
    </div>
  );
}
