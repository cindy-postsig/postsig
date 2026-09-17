import {
  applyColumnLayout,
  columnSpecId,
  COLUMN_LAYOUT_LABELS,
  isDefaultLayout,
  layoutFromEntries,
  parseColumnLayoutStore,
  reorderColumns,
  resolveLayoutEntries,
  STRUCTURAL_COLUMN_IDS,
  type ColumnLayout,
  type ColumnSpec,
} from '@/components/contracts/columnLayout';
import {
  BUDGET_OVERVIEW_COLUMNS,
  CALENDAR_LIST_COLUMNS,
  CONTRACTS_ALL_COLUMNS,
  LIST_VIEW_DEFAULT_COLUMNS,
  VENDORS_LIST_COLUMNS,
} from '@/components/contracts/listViewDefaults';
import { SYSTEM_TYPE_FOLDERS } from '@/app/(app)/(cpm)/contracts/(views)/systemFolderConfig';

const ids = (specs: readonly ColumnSpec[]) => specs.map(columnSpecId);

/** Every id the picker would let a user order: no structural, no pinned vendor. */
const bodyIds = (specs: readonly ColumnSpec[]) =>
  ids(specs).filter((id) => !STRUCTURAL_COLUMN_IDS.has(id) && id !== 'vendor');

const ALL_WITH_SELECT: readonly ColumnSpec[] = [
  'select',
  ...CONTRACTS_ALL_COLUMNS,
];

const layout = (partial: Partial<ColumnLayout>): ColumnLayout => ({
  order: [],
  hidden: [],
  ...partial,
});

describe('applyColumnLayout', () => {
  it('returns defaults untouched when there is no stored layout', () => {
    const withOverride: ColumnSpec[] = [
      'vendor',
      { id: 'recordedAmount', header: 'Invoice Amount' },
    ];
    const result = applyColumnLayout(withOverride, null, 'contracts.invoices');

    expect(result).toEqual(withOverride);
    // The override object must survive by reference so the header-override
    // branch in ContractsTableClient keeps working.
    expect(result[1]).toBe(withOverride[1]);
  });

  it('never drops a locked column, however stale the stored layout', () => {
    const result = ids(
      applyColumnLayout(
        ALL_WITH_SELECT,
        layout({
          hidden: [
            'vendor',
            'product',
            'termStartDate',
            'cancelByDate',
            'termEndDate',
            'currentBudget',
          ],
        }),
        'contracts.all',
      ),
    );

    for (const locked of [
      'vendor',
      'product',
      'termStartDate',
      'cancelByDate',
      'termEndDate',
      'currentBudget',
    ]) {
      expect(result).toContain(locked);
    }
  });

  it('drops exactly the removable columns the user hid', () => {
    const result = ids(
      applyColumnLayout(
        ALL_WITH_SELECT,
        layout({ hidden: ['tags', 'folder'] }),
        'contracts.all',
      ),
    );

    expect(result).not.toContain('tags');
    expect(result).not.toContain('folder');
    expect(result).toHaveLength(ids(ALL_WITH_SELECT).length - 2);
  });

  it('honours the stored order for body columns', () => {
    const result = ids(
      applyColumnLayout(
        ALL_WITH_SELECT,
        layout({
          order: ['businessGroup', 'product', 'orderNumber'],
        }),
        'contracts.all',
      ),
    );

    expect(result.indexOf('businessGroup')).toBeLessThan(
      result.indexOf('product'),
    );
    expect(result.indexOf('product')).toBeLessThan(result.indexOf('folder'));
  });

  it('ignores ids that no longer exist in the view', () => {
    const result = ids(
      applyColumnLayout(
        ALL_WITH_SELECT,
        layout({ order: ['doraScoreValue', 'product', 'seatUsageDisplay'] }),
        'contracts.all',
      ),
    );

    expect(result).not.toContain('doraScoreValue');
    expect(result).not.toContain('seatUsageDisplay');
    expect(result).toHaveLength(ids(ALL_WITH_SELECT).length);
  });

  it('reinstates a default column the stored order never mentioned, in place', () => {
    // Spend Overview injects `discount` only when the data has discounts, so a
    // layout saved on a discount-free day must not suppress it forever.
    const saved = ids(BUDGET_OVERVIEW_COLUMNS).filter(
      (id) => id !== 'discount' && id !== 'vendor',
    );

    const result = ids(
      applyColumnLayout(
        BUDGET_OVERVIEW_COLUMNS,
        layout({ order: saved }),
        'budget.overview',
      ),
    );

    expect(result).toContain('discount');
    expect(result.indexOf('termEndDate')).toBeLessThan(
      result.indexOf('discount'),
    );
    expect(result.indexOf('discount')).toBeLessThan(
      result.indexOf('currentBudget'),
    );
  });

  it('keeps structural columns leading and vendor pinned first', () => {
    // Structural and pinned ids planted mid-order must be ignored there.
    const reordered = [
      'tags',
      'select',
      'businessGroup',
      'vendor',
      ...bodyIds(CONTRACTS_ALL_COLUMNS).filter(
        (id) => id !== 'tags' && id !== 'businessGroup',
      ),
    ];

    const result = ids(
      applyColumnLayout(
        ALL_WITH_SELECT,
        layout({ order: reordered }),
        'contracts.all',
      ),
    );

    expect(result.slice(0, 4)).toEqual([
      'select',
      'vendor',
      'tags',
      'businessGroup',
    ]);
  });

  it('preserves header overrides through a reorder and a removal', () => {
    const defaults: ColumnSpec[] = [
      'select',
      'vendor',
      'orderNumber',
      { id: 'recordedAmount', header: 'Invoice Amount' },
      'tags',
    ];

    const result = applyColumnLayout(
      defaults,
      layout({ order: ['recordedAmount', 'orderNumber'], hidden: ['tags'] }),
      'contracts.invoices',
    );

    expect(ids(result)).toEqual([
      'select',
      'vendor',
      'recordedAmount',
      'orderNumber',
    ]);
    expect(result[2]).toBe(defaults[3]);
  });

  it('lets Spend Overview drop its derived money columns, but not Current Spend', () => {
    const entries = resolveLayoutEntries(
      BUDGET_OVERVIEW_COLUMNS,
      null,
      'budget.overview',
    );
    const removable = (id: string) =>
      entries.find((entry) => entry.id === id)?.removable;

    expect(removable('discount')).toBe(true);
    expect(removable('annualDifference')).toBe(true);
    expect(removable('projectedBudget')).toBe(true);
    expect(removable('currentBudget')).toBe(false);

    expect(
      ids(
        applyColumnLayout(
          BUDGET_OVERVIEW_COLUMNS,
          layout({
            hidden: ['discount', 'annualDifference', 'projectedBudget'],
          }),
          'budget.overview',
        ),
      ),
    ).toEqual([
      'vendor',
      'orderNumber',
      'product',
      'type',
      'renewalType',
      'termStartDate',
      'cancelByDate',
      'termEndDate',
      'currentBudget',
      'tags',
      'businessSponsor',
      'businessGroup',
    ]);
  });

  it('lets Calendar drop Term', () => {
    const entries = resolveLayoutEntries(
      CALENDAR_LIST_COLUMNS,
      null,
      'calendar.list',
    );

    expect(entries.find((entry) => entry.id === 'term')?.removable).toBe(true);
    expect(
      ids(
        applyColumnLayout(
          CALENDAR_LIST_COLUMNS,
          layout({ hidden: ['term'] }),
          'calendar.list',
        ),
      ),
    ).not.toContain('term');
  });

  it('keeps view-specific removals locked on other views', () => {
    // discount/annualDifference belong to Spend, term to Calendar; the shared
    // column registry means report views must not inherit any of them.
    const shared: ColumnSpec[] = [
      'vendor',
      'discount',
      'annualDifference',
      'term',
    ];

    expect(
      ids(
        applyColumnLayout(
          shared,
          layout({ hidden: ['discount', 'annualDifference', 'term'] }),
          'contracts.all',
        ),
      ),
    ).toEqual(['vendor', 'discount', 'annualDifference', 'term']);
  });

  it('lets Inventory drop its usage columns but keeps Vendor, Product, dates and Cost', () => {
    const inventoryDefaults = LIST_VIEW_DEFAULT_COLUMNS['inventory.list'];
    const entries = resolveLayoutEntries(
      inventoryDefaults,
      null,
      'inventory.list',
    );
    const removable = (id: string) =>
      entries.find((entry) => entry.id === id)?.removable;

    for (const id of [
      'licensesCount',
      'activeUsers',
      'deliveryMethods',
      'status',
      'businessSponsor',
      'businessGroup',
    ]) {
      expect(removable(id)).toBe(true);
    }
    for (const id of [
      'vendor',
      'productName',
      'startDate',
      'endDate',
      'cost',
    ]) {
      expect(removable(id)).toBe(false);
    }

    expect(
      ids(
        applyColumnLayout(
          inventoryDefaults,
          layout({
            hidden: [
              'licensesCount',
              'activeUsers',
              'deliveryMethods',
              'status',
              'cost',
            ],
          }),
          'inventory.list',
        ),
      ),
    ).toEqual([
      'expander',
      'alerts',
      'vendor',
      'productName',
      'startDate',
      'endDate',
      'cost',
      'businessSponsor',
      'businessGroup',
    ]);
  });

  it('scopes `status` per view: removable in Inventory, locked on contract lists', () => {
    // The same id exists in both registries with different meanings.
    expect(
      ids(
        applyColumnLayout(
          LIST_VIEW_DEFAULT_COLUMNS['archived.standalone'],
          layout({ hidden: ['status'] }),
          'archived.standalone',
        ),
      ),
    ).toContain('status');
  });
});

describe('default-hidden columns (vendors.list)', () => {
  const visible = (stored: ColumnLayout | null) =>
    ids(applyColumnLayout(VENDORS_LIST_COLUMNS, stored, 'vendors.list'));

  it('leaves Asset Classes off until the user turns it on', () => {
    expect(visible(null)).not.toContain('assetClasses');
    expect(visible(layout({}))).toContain('assetClasses');
  });

  it('offers it in the picker, unchecked, in its default slot', () => {
    const entries = resolveLayoutEntries(
      VENDORS_LIST_COLUMNS,
      null,
      'vendors.list',
    );
    const last = entries[entries.length - 1];
    expect(last).toMatchObject({
      id: 'assetClasses',
      label: 'Asset Classes',
      visible: false,
      removable: true,
    });
  });

  it('treats a layout that only re-hides it as the default', () => {
    expect(
      isDefaultLayout(
        VENDORS_LIST_COLUMNS,
        layout({ hidden: ['assetClasses'] }),
        'vendors.list',
      ),
    ).toBe(true);
    expect(
      isDefaultLayout(VENDORS_LIST_COLUMNS, layout({}), 'vendors.list'),
    ).toBe(false);
  });

  it('keeps Vendor, Products and Current Spend locked', () => {
    expect(
      visible(layout({ hidden: ['vendor', 'products', 'currentSpend'] })),
    ).toEqual(expect.arrayContaining(['vendor', 'products', 'currentSpend']));
  });

  it('does not hide anything by default on the other views', () => {
    for (const [viewKey, defaults] of Object.entries(
      LIST_VIEW_DEFAULT_COLUMNS,
    )) {
      if (viewKey === 'vendors.list') continue;
      expect(
        ids(
          applyColumnLayout(
            defaults,
            null,
            viewKey as keyof typeof LIST_VIEW_DEFAULT_COLUMNS,
          ),
        ),
      ).toEqual(ids(defaults));
    }
  });
});

describe('parseColumnLayoutStore', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an array', []],
    ['a string', 'nope'],
    ['a number', 7],
    ['a future version', { version: 2, views: {} }],
    ['a missing views key', { version: 1 }],
    ['a non-object views key', { version: 1, views: 'x' }],
  ])('degrades to an empty store for %s', (_label, value) => {
    expect(parseColumnLayoutStore(value)).toEqual({ version: 1, views: {} });
  });

  it('drops unknown view keys and non-string ids, and dedupes', () => {
    const parsed = parseColumnLayoutStore({
      version: 1,
      views: {
        'contracts.all': {
          order: ['vendor', 'vendor', 42, null, 'tags'],
          hidden: ['tags'],
        },
        'reports.spend': { order: ['vendor'] },
      },
    });

    expect(parsed.views['contracts.all']).toEqual({
      order: ['vendor', 'tags'],
      hidden: ['tags'],
    });
    expect(Object.keys(parsed.views)).toEqual(['contracts.all']);
  });
});

describe('resolveLayoutEntries', () => {
  it('excludes structural columns and marks vendor locked', () => {
    const entries = resolveLayoutEntries(
      ALL_WITH_SELECT,
      null,
      'contracts.all',
    );

    expect(entries.some((entry) => STRUCTURAL_COLUMN_IDS.has(entry.id))).toBe(
      false,
    );

    const vendor = entries.find((entry) => entry.id === 'vendor');
    expect(vendor).toMatchObject({ removable: false, reorderable: false });

    expect(entries.find((entry) => entry.id === 'tags')).toMatchObject({
      removable: true,
      reorderable: true,
      visible: true,
    });
    expect(entries.find((entry) => entry.id === 'product')).toMatchObject({
      removable: false,
      reorderable: true,
    });
  });

  it('keeps a removed column in its remembered slot, marked hidden', () => {
    const reordered = [
      'tags',
      ...bodyIds(CONTRACTS_ALL_COLUMNS).filter((id) => id !== 'tags'),
    ];

    const entries = resolveLayoutEntries(
      ALL_WITH_SELECT,
      layout({ order: reordered, hidden: ['tags'] }),
      'contracts.all',
    );

    expect(entries[0]).toMatchObject({ id: 'vendor' });
    expect(entries[1]).toMatchObject({ id: 'tags', visible: false });
  });

  it('labels invoice columns with their invoice-flavoured headers', () => {
    const entries = resolveLayoutEntries(
      ['vendor', 'orderNumber', 'termStartDate'],
      null,
      'contracts.invoices',
    );

    expect(entries.map((entry) => entry.label)).toEqual([
      'Vendor',
      'Invoice No.',
      'Billing Period Start Date',
    ]);
  });
});

describe('reorderColumns', () => {
  const entries = () =>
    resolveLayoutEntries(ALL_WITH_SELECT, null, 'contracts.all');

  it('drops an entry at the target position, shifting the rest', () => {
    const moved = reorderColumns(entries(), 'businessGroup', 'orderNumber');
    expect(moved.map((e) => e.id).slice(0, 4)).toEqual([
      'vendor',
      'businessGroup',
      'orderNumber',
      'product',
    ]);
  });

  it('moves an entry to the end', () => {
    const start = entries();
    const last = start[start.length - 1].id;
    const moved = reorderColumns(start, 'orderNumber', last);

    expect(moved[moved.length - 1].id).toBe('orderNumber');
    expect(moved).toHaveLength(start.length);
  });

  it('is a no-op when dropped on itself or on an unknown id', () => {
    const start = entries();
    const unchanged = start.map((e) => e.id);

    expect(
      reorderColumns(start, 'product', 'product').map((e) => e.id),
    ).toEqual(unchanged);
    expect(reorderColumns(start, 'product', 'nope').map((e) => e.id)).toEqual(
      unchanged,
    );
  });

  it('never displaces the pinned entry, whichever way it is dragged', () => {
    const start = entries();

    // Dragging the pinned entry itself does nothing…
    expect(reorderColumns(start, 'vendor', 'tags').map((e) => e.id)).toEqual(
      start.map((e) => e.id),
    );
    // …and dropping something onto it still leaves it first.
    expect(reorderColumns(start, 'tags', 'vendor')[0].id).toBe('vendor');
  });

  it('produces a layout that applies cleanly', () => {
    const moved = reorderColumns(entries(), 'businessGroup', 'orderNumber');
    const applied = ids(
      applyColumnLayout(
        ALL_WITH_SELECT,
        layoutFromEntries(moved),
        'contracts.all',
      ),
    );

    expect(applied.slice(0, 4)).toEqual([
      'select',
      'vendor',
      'businessGroup',
      'orderNumber',
    ]);
  });
});

describe('isDefaultLayout', () => {
  const entries = () =>
    resolveLayoutEntries(ALL_WITH_SELECT, null, 'contracts.all');

  const check = (l: ColumnLayout | null) =>
    isDefaultLayout(ALL_WITH_SELECT, l, 'contracts.all');

  it('treats a missing layout as default', () => {
    expect(check(null)).toBe(true);
  });

  it('treats an explicit full default order as default', () => {
    expect(check(layoutFromEntries(entries()))).toBe(true);
  });

  it('is true again after a column is removed and put back', () => {
    const removed = entries().map((entry) =>
      entry.id === 'orderNumber' ? { ...entry, visible: false } : entry,
    );
    expect(check(layoutFromEntries(removed))).toBe(false);

    const restored = removed.map((entry) =>
      entry.id === 'orderNumber' ? { ...entry, visible: true } : entry,
    );
    expect(check(layoutFromEntries(restored))).toBe(true);
  });

  it('is true again after a reorder is undone', () => {
    const moved = reorderColumns(entries(), 'businessGroup', 'orderNumber');
    expect(check(layoutFromEntries(moved))).toBe(false);

    const back = reorderColumns(moved, 'businessGroup', 'businessSponsor');
    expect(check(layoutFromEntries(back))).toBe(true);
  });

  it('ignores a stale hidden entry for a locked column', () => {
    // The column is never dropped, so the layout still renders the defaults.
    expect(check(layout({ hidden: ['vendor'] }))).toBe(true);
  });
});

describe('layoutFromEntries round trip', () => {
  it('reproduces the same effective columns', () => {
    const stored = layout({
      order: ['businessGroup', 'product', 'orderNumber'],
      hidden: ['tags'],
    });

    const roundTripped = layoutFromEntries(
      resolveLayoutEntries(ALL_WITH_SELECT, stored, 'contracts.all'),
    );

    expect(
      ids(applyColumnLayout(ALL_WITH_SELECT, roundTripped, 'contracts.all')),
    ).toEqual(ids(applyColumnLayout(ALL_WITH_SELECT, stored, 'contracts.all')));
  });
});

describe('label coverage', () => {
  const systemFolderColumns = SYSTEM_TYPE_FOLDERS.flatMap(
    (folder) => folder.columns ?? [],
  );

  const everyDefaultId = new Set(
    [...Object.values(LIST_VIEW_DEFAULT_COLUMNS).flat(), ...systemFolderColumns]
      .map(columnSpecId)
      .filter((id) => !STRUCTURAL_COLUMN_IDS.has(id)),
  );

  it('has a picker label for every column any configurable view can show', () => {
    const missing = [...everyDefaultId].filter(
      (id) => !(id in COLUMN_LAYOUT_LABELS),
    );
    expect(missing).toEqual([]);
  });
});
