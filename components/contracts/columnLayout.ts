/**
 * Per-user column layout policy for CPM list views.
 *
 * Pure module by design: no React, no `'use client'`, no @tanstack runtime
 * imports. It runs in the ts-jest node env and is imported by both the picker
 * UI and the code that applies a stored layout, so the two cannot drift.
 *
 * Layouts operate on column *ids* (the `Array<string | {id, header}>` shape
 * call sites already pass to ContractsTableClient), not resolved ColumnDefs.
 * That keeps `{id, header}` override objects intact by reference.
 *
 * Removal works by dropping the id from the returned array. In
 * ContractsTableClient the four filter columns are force-appended afterwards
 * so filtering keeps working, and `columnVisibility` hides them because they
 * are no longer among the effective ids — the existing mechanism, unchanged.
 */

export type ColumnLayoutViewKey =
  | 'contracts.all'
  | 'contracts.pending'
  | 'contracts.archived'
  | 'contracts.folder'
  | 'contracts.invoices'
  | 'contracts.trials'
  | 'contracts.ndas'
  | 'calendar.list'
  | 'budget.overview'
  | 'inventory.list'
  | 'archived.standalone'
  | 'vendors.list';

export const COLUMN_LAYOUT_VIEW_KEYS: readonly ColumnLayoutViewKey[] = [
  'contracts.all',
  'contracts.pending',
  'contracts.archived',
  'contracts.folder',
  'contracts.invoices',
  'contracts.trials',
  'contracts.ndas',
  'calendar.list',
  'budget.overview',
  'inventory.list',
  'archived.standalone',
  'vendors.list',
];

export type ColumnSpec = string | { id: string; header: string };

export type ColumnLayout = {
  /** Body column ids in user order. Ids missing here fall back to default position. */
  order: string[];
  /** Body column ids the user removed. Ids outside the allowlist are ignored. */
  hidden: string[];
};

export type ColumnLayoutStore = {
  version: 1;
  views: Partial<Record<ColumnLayoutViewKey, ColumnLayout>>;
};

/** The single `user_preferences` key every view's layout is stored under. */
export const COLUMN_LAYOUTS_PREFERENCE_KEY = 'cpm.column_layouts';

export const EMPTY_COLUMN_LAYOUT_STORE: ColumnLayoutStore = Object.freeze({
  version: 1,
  views: Object.freeze({}),
}) as ColumnLayoutStore;

const VIEW_KEYS = new Set<string>(COLUMN_LAYOUT_VIEW_KEYS);

export function isColumnLayoutViewKey(
  value: unknown,
): value is ColumnLayoutViewKey {
  return typeof value === 'string' && VIEW_KEYS.has(value);
}

/**
 * Table plumbing, not data. Never offered in the picker, never reorderable,
 * always kept leading in default order — `groupByVendor` re-pins `select` and
 * `expander` itself, and the lineage indent renders inside `expander`.
 *
 * `expand` was a long-standing typo for `expander` in the default arrays,
 * since fixed; it lingers in stored layouts, where it resolves to nothing.
 * Kept structural so such a layout can never relocate it into the middle of
 * a table.
 */
export const STRUCTURAL_COLUMN_IDS: ReadonlySet<string> = new Set([
  'select',
  'expand',
  'expander',
  'alerts',
]);

/**
 * Visible and locked, and pinned ahead of every other data column. The sticky
 * leading column depends on this staying first regardless of stored order.
 */
export const PINNED_LEADING_COLUMN_IDS: ReadonlySet<string> = new Set([
  'vendor',
  'vendorAndProduct',
]);

/**
 * The only columns a user may remove, per the ticket. Everything else is
 * locked by absence — which is how "Vendor, Product, Dates and Current Spend"
 * stay put without having to enumerate the six date columns.
 *
 * Intersected with each view's own defaults at call time, so e.g. the
 * standalone archived view (which has no Tags or Folder) simply offers fewer.
 */
const CONTRACT_REMOVABLE_COLUMN_IDS: ReadonlySet<string> = new Set([
  'orderNumber',
  'businessSponsor',
  'businessGroup',
  'tags',
  'renewalType',
  'folder',
  'projectedBudget',
  'totalContractValue',
]);

/**
 * Spend Overview also exposes its two derived money columns. Discount is only
 * rendered at all when some contract has one, and Annual Difference is a
 * comparison rather than a spend figure — neither is the "Current Spend" the
 * ticket locks, so both are safe to remove.
 */
const BUDGET_REMOVABLE_COLUMN_IDS: ReadonlySet<string> = new Set([
  ...CONTRACT_REMOVABLE_COLUMN_IDS,
  'discount',
  'annualDifference',
]);

/**
 * Calendar also exposes Term. It is the only view that shows contract length
 * as a column, and it duplicates information already carried by the start and
 * end dates beside it.
 */
const CALENDAR_REMOVABLE_COLUMN_IDS: ReadonlySet<string> = new Set([
  ...CONTRACT_REMOVABLE_COLUMN_IDS,
  'term',
]);

/**
 * Inventory has its own registry, so it defines its own set outright rather
 * than extending the contract one. Vendor, Product, the dates and Cost stay
 * locked — Cost is Inventory's Current Spend.
 */
const INVENTORY_REMOVABLE_COLUMN_IDS: ReadonlySet<string> = new Set([
  'businessSponsor',
  'businessGroup',
  'licensesCount',
  'activeUsers',
  'deliveryMethods',
  'status',
]);

/**
 * Vendors is an entity list rather than a contract list, so its own set:
 * Vendor, Products and Current Spend stay locked — the row's identity, what
 * it expands into, and the figure the vendor page header repeats.
 */
const VENDORS_REMOVABLE_COLUMN_IDS: ReadonlySet<string> = new Set([
  'activeAgreements',
  'cancelByDate',
  'termEndDate',
  'projectedSpend',
  'spendShare',
  'relationshipStart',
  'assetClasses',
]);

export const REMOVABLE_BY_VIEW: Record<
  ColumnLayoutViewKey,
  ReadonlySet<string>
> = {
  'contracts.all': CONTRACT_REMOVABLE_COLUMN_IDS,
  'contracts.pending': CONTRACT_REMOVABLE_COLUMN_IDS,
  'contracts.archived': CONTRACT_REMOVABLE_COLUMN_IDS,
  'contracts.folder': CONTRACT_REMOVABLE_COLUMN_IDS,
  'contracts.invoices': CONTRACT_REMOVABLE_COLUMN_IDS,
  'contracts.trials': CONTRACT_REMOVABLE_COLUMN_IDS,
  'contracts.ndas': CONTRACT_REMOVABLE_COLUMN_IDS,
  'calendar.list': CALENDAR_REMOVABLE_COLUMN_IDS,
  'budget.overview': BUDGET_REMOVABLE_COLUMN_IDS,
  'archived.standalone': CONTRACT_REMOVABLE_COLUMN_IDS,
  'inventory.list': INVENTORY_REMOVABLE_COLUMN_IDS,
  'vendors.list': VENDORS_REMOVABLE_COLUMN_IDS,
};

/**
 * Columns a view offers in the picker but leaves off until the user turns
 * them on. Each must also be removable — turning one off again is a removal.
 */
const DEFAULT_HIDDEN_BY_VIEW: Partial<
  Record<ColumnLayoutViewKey, ReadonlySet<string>>
> = {
  'vendors.list': new Set(['assetClasses']),
};

/** What an unstored layout means for a view: default order, default-hidden columns off. */
function defaultLayoutFor(viewKey: ColumnLayoutViewKey): ColumnLayout {
  return { order: [], hidden: [...(DEFAULT_HIDDEN_BY_VIEW[viewKey] ?? [])] };
}

/**
 * Picker labels. The registry stores headers as render functions, so they
 * cannot be read back as text; three of them additionally vary with
 * `reportType`. A static map is the honest answer — test coverage asserts
 * every id in every default array has an entry.
 */
export const COLUMN_LAYOUT_LABELS: Readonly<Record<string, string>> = {
  activeAgreements: 'Active Agreements',
  activeUsers: 'Active Users',
  annualDifference: 'Annual Difference',
  assetClasses: 'Asset Classes',
  businessGroup: 'Business Group',
  businessSponsor: 'Business Sponsor',
  cancelByDate: 'Cancel By',
  cost: 'Cost',
  currentBudget: 'Current Spend',
  currentSpend: 'Current Spend',
  daysRemaining: 'Days Remaining',
  deliveryMethods: 'Delivery Method',
  discount: 'Discount',
  endDate: 'End Date',
  executionDate: 'Execution Date',
  folder: 'Folder',
  invoiceStatus: 'Status',
  licensesCount: 'Licenses / Seats',
  orderNumber: 'Contract No.',
  product: 'Product',
  productName: 'Product / Dataset / Service',
  products: 'Products',
  projectedBudget: 'Projected Spend',
  projectedSpend: 'Projected Spend',
  recordedAmount: 'Amount',
  relationshipStart: 'Since',
  renewalType: 'Renewal',
  spendShare: 'Share of Spend',
  startDate: 'Start Date',
  status: 'Status',
  tags: 'Tags',
  term: 'Term',
  termEndDate: 'End Date',
  termStartDate: 'Start Date',
  totalContractValue: 'TCV',
  type: 'Type',
  vendor: 'Vendor',
  vendorAndProduct: 'Vendor',
};

/** The invoices folder renders the same ids under invoice-flavoured headers. */
const INVOICE_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  orderNumber: 'Invoice No.',
  executionDate: 'Invoice Date',
  termStartDate: 'Billing Period Start Date',
  termEndDate: 'Billing Period End Date',
  recordedAmount: 'Invoice Amount',
};

export function columnSpecId(spec: ColumnSpec): string {
  return typeof spec === 'string' ? spec : spec.id;
}

function columnLabel(spec: ColumnSpec, viewKey: ColumnLayoutViewKey): string {
  if (typeof spec !== 'string') return spec.header;
  if (viewKey === 'contracts.invoices' && spec in INVOICE_LABEL_OVERRIDES) {
    return INVOICE_LABEL_OVERRIDES[spec];
  }
  return COLUMN_LAYOUT_LABELS[spec] ?? spec;
}

function isStructural(spec: ColumnSpec): boolean {
  return STRUCTURAL_COLUMN_IDS.has(columnSpecId(spec));
}

function isPinnedLeading(spec: ColumnSpec): boolean {
  return PINNED_LEADING_COLUMN_IDS.has(columnSpecId(spec));
}

/**
 * Splice ids that the stored order never mentioned back in at their default
 * relative position, anchored to the nearest preceding id the order does know.
 *
 * Load-bearing: Spend Overview injects `discount` only when the data has
 * discounts, so a layout saved on a discount-free day must not suppress it
 * forever. Same for any column added to a view's defaults after the fact.
 */
function mergeMissingIds(
  defaultIds: readonly string[],
  orderedIds: readonly string[],
): string[] {
  const ordered = new Set(orderedIds);
  const trailing = new Map<string | null, string[]>();

  let anchor: string | null = null;
  for (const id of defaultIds) {
    if (ordered.has(id)) {
      anchor = id;
      continue;
    }
    const bucket = trailing.get(anchor);
    if (bucket) bucket.push(id);
    else trailing.set(anchor, [id]);
  }

  const merged: string[] = [...(trailing.get(null) ?? [])];
  for (const id of orderedIds) {
    merged.push(id);
    const after = trailing.get(id);
    if (after) merged.push(...after);
  }
  return merged;
}

/**
 * Apply a stored layout to a view's default column specs.
 *
 * Every guarantee is enforced here rather than trusted from storage: a layout
 * written before a column became locked, hand-edited, or left over from an
 * older build can never drop a locked column or relocate table plumbing.
 *
 * No stored layout means the view's default layout, not the raw default
 * array: the same pipeline runs, so a view's default-hidden columns stay
 * off until a stored layout says otherwise.
 */
export function applyColumnLayout(
  defaults: readonly ColumnSpec[],
  layout: ColumnLayout | null | undefined,
  viewKey: ColumnLayoutViewKey,
): ColumnSpec[] {
  const effective = layout ?? defaultLayoutFor(viewKey);

  const structural = defaults.filter(isStructural);
  const pinned = defaults.filter(
    (spec) => !isStructural(spec) && isPinnedLeading(spec),
  );
  const body = defaults.filter(
    (spec) => !isStructural(spec) && !isPinnedLeading(spec),
  );

  const bodyById = new Map(body.map((spec) => [columnSpecId(spec), spec]));
  const bodyIds = body.map(columnSpecId);

  // Unknown ids (renamed or deleted columns), structural ids and pinned ids
  // planted in `order` are all discarded here.
  const seen = new Set<string>();
  const storedOrder = effective.order.filter((id) => {
    if (!bodyById.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const removable = REMOVABLE_BY_VIEW[viewKey];
  const hidden = new Set(
    effective.hidden.filter((id) => removable.has(id) && bodyById.has(id)),
  );

  const orderedBody = mergeMissingIds(bodyIds, storedOrder)
    .filter((id) => !hidden.has(id))
    .map((id) => bodyById.get(id) as ColumnSpec);

  return [...structural, ...pinned, ...orderedBody];
}

export type LayoutEntry = {
  id: string;
  label: string;
  visible: boolean;
  removable: boolean;
  reorderable: boolean;
};

/**
 * The picker's view of a layout: every non-structural column in effective
 * order, including the ones the user removed (so they can be restored to
 * their remembered position).
 */
export function resolveLayoutEntries(
  defaults: readonly ColumnSpec[],
  layout: ColumnLayout | null | undefined,
  viewKey: ColumnLayoutViewKey,
): LayoutEntry[] {
  const removable = REMOVABLE_BY_VIEW[viewKey];
  const visibleIds = new Set(
    applyColumnLayout(defaults, layout, viewKey).map(columnSpecId),
  );

  // Reuse the ordering logic by asking for the layout with nothing hidden,
  // so removed columns keep their remembered slot in the list.
  const ordered = applyColumnLayout(
    defaults,
    { order: layout?.order ?? [], hidden: [] },
    viewKey,
  );

  return ordered
    .filter((spec) => !isStructural(spec))
    .map((spec) => {
      const id = columnSpecId(spec);
      return {
        id,
        label: columnLabel(spec, viewKey),
        visible: visibleIds.has(id),
        removable: removable.has(id),
        reorderable: !isPinnedLeading(spec),
      };
    });
}

/**
 * Drop the entry `activeId` at the position of `overId`.
 *
 * Pinned entries always lead (`applyColumnLayout` guarantees it), so they are
 * held aside and the move happens purely among the draggable ones — dropping
 * onto or past a pinned entry can never displace it.
 */
export function reorderColumns(
  entries: readonly LayoutEntry[],
  activeId: string,
  overId: string,
): LayoutEntry[] {
  if (activeId === overId) return [...entries];

  const pinned = entries.filter((entry) => !entry.reorderable);
  const movable = entries.filter((entry) => entry.reorderable);

  const from = movable.findIndex((entry) => entry.id === activeId);
  const to = movable.findIndex((entry) => entry.id === overId);
  if (from === -1 || to === -1) return [...entries];

  const next = [...movable];
  next.splice(to, 0, ...next.splice(from, 1));
  return [...pinned, ...next];
}

/**
 * True when `layout` yields exactly the view's default columns.
 *
 * Compared against the *canonical* default (defaults run through the same
 * pipeline with no stored layout) rather than the raw array, so the two sides
 * agree on structural/pinned placement and on default-hidden columns.
 *
 * Callers use this to avoid storing a no-op layout: removing a column and
 * putting it back should leave no trace, both so "Reset to default" reads
 * honestly and so the user still picks up later changes to the defaults.
 */
export function isDefaultLayout(
  defaults: readonly ColumnSpec[],
  layout: ColumnLayout | null | undefined,
  viewKey: ColumnLayoutViewKey,
): boolean {
  if (!layout) return true;

  const canonical = applyColumnLayout(defaults, null, viewKey).map(
    columnSpecId,
  );
  const applied = applyColumnLayout(defaults, layout, viewKey).map(
    columnSpecId,
  );

  return (
    applied.length === canonical.length &&
    applied.every((id, index) => id === canonical[index])
  );
}

export function layoutFromEntries(
  entries: readonly LayoutEntry[],
): ColumnLayout {
  return {
    order: entries.filter((e) => e.reorderable).map((e) => e.id),
    hidden: entries.filter((e) => !e.visible).map((e) => e.id),
  };
}

/**
 * Narrow one view's layout from untrusted input: drops non-string ids and
 * duplicates. Exported so the server action can normalise what a client sends
 * rather than persisting it verbatim.
 */
export function parseColumnLayout(value: unknown): ColumnLayout | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const { order, hidden } = value as Record<string, unknown>;
  const asIds = (input: unknown): string[] =>
    Array.isArray(input)
      ? Array.from(
          new Set(input.filter((id): id is string => typeof id === 'string')),
        )
      : [];

  return { order: asIds(order), hidden: asIds(hidden) };
}

/**
 * Narrow an untrusted jsonb blob. Never throws — a malformed or
 * future-versioned store degrades to "no customisation" rather than breaking
 * every list view in the app.
 */
export function parseColumnLayoutStore(value: unknown): ColumnLayoutStore {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return EMPTY_COLUMN_LAYOUT_STORE;
  }

  const record = value as Record<string, unknown>;
  if (record.version !== 1) return EMPTY_COLUMN_LAYOUT_STORE;

  const rawViews = record.views;
  if (
    typeof rawViews !== 'object' ||
    rawViews === null ||
    Array.isArray(rawViews)
  ) {
    return EMPTY_COLUMN_LAYOUT_STORE;
  }

  const views: ColumnLayoutStore['views'] = {};
  for (const key of COLUMN_LAYOUT_VIEW_KEYS) {
    const layout = parseColumnLayout(
      (rawViews as Record<string, unknown>)[key],
    );
    if (layout && (layout.order.length > 0 || layout.hidden.length > 0)) {
      views[key] = layout;
    }
  }

  return { version: 1, views };
}
