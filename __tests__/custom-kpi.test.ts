import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => {
    serviceClientUsed = true;
    return buildSupabaseMock();
  },
}));

jest.mock('@/lib/v2/kpis/events', () => ({
  logKpiEvent: jest.fn(),
}));

jest.mock('@/data/users', () => ({
  getUserMetadata: () => Promise.resolve({ organizationId: 'org-1' }),
}));

let insertedKpi: Record<string, unknown> | null = null;
let insertError: { code?: string } | null = null;
let upsertedValue: Record<string, unknown> | null = null;
let upsertOptions: Record<string, unknown> | null = null;
let deleteCalled = false;
let deleteFilters: Record<string, unknown> = {};
let valueSelectFilters: Record<string, unknown> = {};
let kpiLookup: {
  id: number;
  value_type: string;
  is_active: boolean;
  label: string;
} | null = { id: 7, value_type: 'percent', is_active: true, label: 'NRR' };
let customDefs: Record<string, unknown>[] = [];
let customVals: Record<string, unknown>[] = [];
let defsError: unknown = null;
let valsError: unknown = null;
let updateCall: {
  payload: Record<string, unknown>;
  filters: Record<string, unknown>;
} | null = null;
let updateRows: { id: number }[] = [{ id: 7 }];
let updateError: unknown = null;
let usageCounts = { value: 0, portcoValue: 0, pendingRequest: 0 };
let usageError: unknown = null;
let usageQueries: { table: string; filters: Record<string, unknown> }[] = [];
// Which Supabase client factory ran — custom-KPI mutations must use the service
// role (writes are default-denied for the user client once org_write is dropped).
let userClientUsed = false;
let serviceClientUsed = false;

// Shared fake Supabase client for both the user (server) and service-role
// (service_server) clients — custom-KPI writes now run through the service role,
// value writes/reads through the user client, and both hit the same fake state.
function buildSupabaseMock() {
  const makeBuilder = (table: string) => {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Record<string, unknown> = {};
    let filters: Record<string, unknown> = {};
    let counting = false;
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      select: (
        _columns?: unknown,
        options?: { count?: string; head?: boolean },
      ) => {
        if (options?.count) counting = true;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      },
      is: (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      },
      not: () => builder,
      in: () => builder,
      order: () => builder,
      insert: (row: Record<string, unknown>) => {
        op = 'insert';
        if (table === 'inv_kpi') insertedKpi = row;
        return builder;
      },
      update: (row: Record<string, unknown>) => {
        op = 'update';
        payload = row;
        return builder;
      },
      upsert: (
        row: Record<string, unknown>,
        options: Record<string, unknown>,
      ) => {
        if (table === 'inv_kpi_value') {
          upsertedValue = row;
          upsertOptions = options;
        }
        return Promise.resolve({ error: null });
      },
      delete: () => {
        op = 'delete';
        if (table === 'inv_kpi_value') deleteCalled = true;
        return builder;
      },
      single: () =>
        Promise.resolve(
          table === 'inv_kpi'
            ? {
                data: insertError ? null : { public_id: 'pub-1' },
                error: insertError,
              }
            : { data: null, error: null },
        ),
      maybeSingle: () =>
        Promise.resolve({
          data: table === 'inv_kpi' ? kpiLookup : null,
          error: null,
        }),
      then: (resolve: (value: unknown) => unknown) => {
        if (counting) {
          usageQueries.push({ table, filters: { ...filters } });
          const count =
            table === 'inv_kpi_value'
              ? filters.origin === 'portco'
                ? usageCounts.portcoValue
                : usageCounts.value
              : usageCounts.pendingRequest;
          return resolve({
            count: usageError ? null : count,
            error: usageError,
          });
        }
        if (op === 'delete') {
          deleteFilters = { ...filters };
          return resolve({ error: null });
        }
        if (op === 'update' && table === 'inv_kpi') {
          updateCall = { payload, filters: { ...filters } };
          return resolve({
            data: updateError ? null : updateRows,
            error: updateError,
          });
        }
        if (table === 'inv_kpi')
          return resolve({ data: customDefs, error: defsError });
        if (table === 'inv_kpi_value') {
          valueSelectFilters = { ...filters };
          return resolve({ data: customVals, error: valsError });
        }
        return resolve({ data: null, error: null });
      },
    });
    return builder;
  };
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }),
    },
    from: (t: string) => makeBuilder(t),
  };
}

jest.mock('@/utils/supabase/server', () => ({
  createClient: () => {
    userClientUsed = true;
    return buildSupabaseMock();
  },
}));

import {
  createCustomKpi,
  setKpiValue,
  deactivateCustomKpi,
  getCustomKpiUsage,
} from '@/lib/v2/kpis/custom-kpis';
import { customKpiDeleteBlockReason } from '@/lib/v2/kpis/transforms';
import {
  getCompanyCustomKpis,
  getCompanyStandardKpiOverrides,
} from '@/lib/v2/kpis/service';
import { userRoles } from '@/constants/data';

// The client "Admin" role is clientSupervisor; clientAdmin is the lower
// "Manager" role and must not manage custom KPI definitions.
const admin = {
  userId: 'user-1',
  organizationId: 'org-1',
  userRole: userRoles.clientSupervisor,
};
const manager = {
  userId: 'user-3',
  organizationId: 'org-1',
  userRole: userRoles.clientAdmin,
};
const nonAdmin = {
  userId: 'user-2',
  organizationId: 'org-1',
  userRole: userRoles.clientUser,
};
// Internal PostSig role: deliberately excluded from this customer-facing gate.
const postsigAdmin = {
  userId: 'user-4',
  organizationId: 'org-1',
  userRole: userRoles.postsigAdmin,
};

describe('createCustomKpi', () => {
  const base = {
    label: 'Net revenue retention',
    category: 'Unit Economics',
    valueType: 'percent' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    insertedKpi = null;
    insertError = null;
    userClientUsed = false;
    serviceClientUsed = false;
  });

  it('creates an org-wide KPI through the service client', async () => {
    const result = await createCustomKpi({ ...base, isFlow: false }, admin);

    expect(result).toEqual({ publicId: 'pub-1' });
    expect(insertedKpi).toMatchObject({
      organization_id: 'org-1',
      label: 'Net revenue retention',
      category: 'Unit Economics',
      value_type: 'percent',
      is_flow: false,
      created_by: 'user-1',
    });
    expect(insertedKpi).not.toHaveProperty('company_id');
    // Writes go through the service role (RLS carries no role logic), not the
    // user client whose writes are default-denied once org_write is dropped.
    expect(serviceClientUsed).toBe(true);
    expect(userClientUsed).toBe(false);
  });

  it('denies a non-admin caller', async () => {
    const result = await createCustomKpi(base, nonAdmin);

    expect(result).toEqual({
      error: 'You do not have permission to add custom KPIs.',
    });
    expect(insertedKpi).toBeNull();
  });

  it('denies a client manager (clientAdmin), who is not the client Admin role', async () => {
    const result = await createCustomKpi(base, manager);

    expect(result).toEqual({
      error: 'You do not have permission to add custom KPIs.',
    });
    expect(insertedKpi).toBeNull();
  });

  it('allows a client supervisor (the client Admin role)', async () => {
    const result = await createCustomKpi({ ...base, isFlow: false }, admin);

    expect(result).toEqual({ publicId: 'pub-1' });
  });

  it('denies an internal PostSig admin (excluded from customer authorization)', async () => {
    const result = await createCustomKpi(base, postsigAdmin);

    expect(result).toEqual({
      error: 'You do not have permission to add custom KPIs.',
    });
    expect(insertedKpi).toBeNull();
  });

  it('rejects a blank name without inserting', async () => {
    const result = await createCustomKpi({ ...base, label: '   ' }, admin);

    expect('error' in result).toBe(true);
    expect(insertedKpi).toBeNull();
  });

  it('reports a friendly duplicate-label error', async () => {
    insertError = { code: '23505' };
    const result = await createCustomKpi(base, admin);

    expect(result).toEqual({
      error: 'A custom KPI with that name already exists.',
    });
  });
});

describe('setKpiValue value parsing', () => {
  const valueBase = {
    companyId: 1,
    publicId: '123e4567-e89b-42d3-a456-426614174000',
    periodYear: 2026,
    periodQuarter: 2 as number | null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    upsertedValue = null;
    upsertOptions = null;
    deleteCalled = false;
    deleteFilters = {};
    kpiLookup = { id: 7, value_type: 'percent', is_active: true, label: 'NRR' };
    userClientUsed = false;
    serviceClientUsed = false;
  });

  it('parses a percent into value_numeric through the user client', async () => {
    const result = await setKpiValue({ ...valueBase, value: '112%' }, admin);
    expect(result).toEqual({ ok: true });
    expect(upsertedValue).toMatchObject({
      organization_id: 'org-1',
      company_id: 1,
      kpi_id: 7,
      period_year: 2026,
      period_quarter: 2,
      origin: 'investor',
      value_numeric: 112,
      value_text: null,
    });
    // Value writes go to inv_kpi_value (its own org_access RLS), so they keep
    // using the user client — unchanged by this migration.
    expect(userClientUsed).toBe(true);
    expect(serviceClientUsed).toBe(false);
  });

  it('targets the v2 cell key and never writes the generated period_type', async () => {
    await setKpiValue({ ...valueBase, value: '112%' }, admin);
    // Must match inv_kpi_value_cell_v2_uq column-for-column, or the upsert
    // errors once the old 5-column constraint is dropped.
    expect(upsertOptions).toEqual({
      onConflict:
        'kpi_id,company_id,period_year,period_quarter,period_month,origin',
    });
    // A quarterly cell pins the month to NULL explicitly — it is part of the
    // conflict target, so leaving it out would let the upsert match a month.
    expect(upsertedValue).toMatchObject({ period_month: null });
    // period_type is generated from the two period columns.
    expect(upsertedValue).not.toHaveProperty('period_type');
  });

  it('writes a monthly cell with the month pinned and no quarter', async () => {
    const result = await setKpiValue(
      { ...valueBase, periodQuarter: null, periodMonth: 3, value: '112%' },
      admin,
    );
    expect(result).toEqual({ ok: true });
    expect(upsertedValue).toMatchObject({
      period_year: 2026,
      period_quarter: null,
      period_month: 3,
      origin: 'investor',
      value_numeric: 112,
    });
  });

  it('rejects a cell that is both quarterly and monthly', async () => {
    const result = await setKpiValue(
      { ...valueBase, periodQuarter: 2, periodMonth: 3, value: '112%' },
      admin,
    );
    expect(result).toEqual({ error: 'Invalid value.' });
    expect(upsertedValue).toBeNull();
  });

  it('scopes a monthly clear to that month, not the fiscal year', async () => {
    await setKpiValue(
      { ...valueBase, periodQuarter: null, periodMonth: 3, value: '  ' },
      admin,
    );
    expect(deleteCalled).toBe(true);
    expect(deleteFilters.period_month).toBe(3);
    expect(deleteFilters.period_quarter).toBeNull();
  });

  it('strips currency formatting into value_numeric', async () => {
    kpiLookup = {
      id: 7,
      value_type: 'currency',
      is_active: true,
      label: 'ARR',
    };
    await setKpiValue({ ...valueBase, value: '$1,000,000' }, admin);
    expect(upsertedValue).toMatchObject({
      value_numeric: 1000000,
      value_text: null,
    });
  });

  it('parses a plain number', async () => {
    kpiLookup = { id: 7, value_type: 'number', is_active: true, label: 'FTE' };
    await setKpiValue({ ...valueBase, value: '42' }, admin);
    expect(upsertedValue).toMatchObject({ value_numeric: 42 });
  });

  it('stores text values for text KPIs', async () => {
    kpiLookup = { id: 7, value_type: 'text', is_active: true, label: 'Note' };
    await setKpiValue({ ...valueBase, value: 'Strong' }, admin);
    expect(upsertedValue).toMatchObject({
      value_text: 'Strong',
      value_numeric: null,
    });
  });

  it('stores textarea values as text', async () => {
    kpiLookup = {
      id: 7,
      value_type: 'textarea',
      is_active: true,
      label: 'Summary',
    };
    await setKpiValue({ ...valueBase, value: 'A long narrative.' }, admin);
    expect(upsertedValue).toMatchObject({
      value_text: 'A long narrative.',
      value_numeric: null,
    });
  });

  it('rejects a non-numeric value for a numeric KPI', async () => {
    const result = await setKpiValue({ ...valueBase, value: 'abc' }, admin);
    expect('error' in result).toBe(true);
    expect(upsertedValue).toBeNull();
  });

  it('clears the investor cell when blank (delete, not upsert)', async () => {
    const result = await setKpiValue({ ...valueBase, value: '  ' }, admin);
    expect(result).toEqual({ ok: true });
    expect(upsertedValue).toBeNull();
    expect(deleteCalled).toBe(true);
    expect(deleteFilters).toMatchObject({
      kpi_id: 7,
      company_id: 1,
      period_year: 2026,
      period_quarter: 2,
      origin: 'investor',
      period_month: null,
    });
  });

  it('scopes an annual (null-quarter) clear with is-null', async () => {
    await setKpiValue({ ...valueBase, periodQuarter: null, value: '' }, admin);
    expect(deleteFilters.period_quarter).toBeNull();
    // Without the month filter, the annual clear would also delete
    // extraction-written monthly rows (quarter NULL, month set).
    expect(deleteFilters.period_month).toBeNull();
  });

  it('rejects an inactive or missing KPI', async () => {
    kpiLookup = {
      id: 7,
      value_type: 'percent',
      is_active: false,
      label: 'NRR',
    };
    const result = await setKpiValue({ ...valueBase, value: '10%' }, admin);
    expect(result).toEqual({ error: 'KPI not found.' });
    expect(upsertedValue).toBeNull();
  });
});

// Editing a value is Manager-and-above, one rung wider than the definitions
// gate. It was open to every investor user until PSK-1986.
describe('setKpiValue authorization', () => {
  const valueBase = {
    companyId: 1,
    publicId: '123e4567-e89b-42d3-a456-426614174000',
    periodYear: 2026,
    periodQuarter: 2 as number | null,
    value: '10%',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    upsertedValue = null;
    kpiLookup = { id: 7, value_type: 'percent', is_active: true, label: 'NRR' };
    userClientUsed = false;
    serviceClientUsed = false;
  });

  it.each([
    ['admin', admin],
    ['manager', manager],
  ])('allows a %s', async (_label, caller) => {
    await expect(setKpiValue(valueBase, caller)).resolves.toEqual({ ok: true });
    expect(upsertedValue).not.toBeNull();
  });

  it.each([
    ['viewer', nonAdmin],
    ['internal PostSig admin', postsigAdmin],
  ])('denies a %s before reading anything', async (_label, caller) => {
    await expect(setKpiValue(valueBase, caller)).resolves.toEqual({
      error: 'You do not have permission to edit KPI values.',
    });
    expect(upsertedValue).toBeNull();
    expect(userClientUsed).toBe(false);
    expect(serviceClientUsed).toBe(false);
  });
});

describe('getCompanyCustomKpis provenance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    customDefs = [];
    customVals = [];
    defsError = null;
    valsError = null;
  });

  it('surfaces both origins per cell, investor winning the display', async () => {
    customDefs = [
      {
        id: 7,
        public_id: 'pub-1',
        label: 'Net revenue retention',
        category: 'Unit Economics',
        value_type: 'percent',
        is_flow: false,
      },
    ];
    customVals = [
      {
        kpi_id: 7,
        period_year: 2026,
        period_quarter: 2,
        origin: 'portco',
        value_numeric: 100,
        value_text: null,
        updated_at: '2026-01-01T00:00:00Z',
        inv_reporting_submission: { status: 'submitted' },
      },
      {
        kpi_id: 7,
        period_year: 2026,
        period_quarter: 2,
        origin: 'investor',
        value_numeric: 120,
        value_text: null,
        updated_at: '2026-02-01T00:00:00Z',
      },
    ];

    const result = await getCompanyCustomKpis(1);

    expect(result).toEqual([
      {
        publicId: 'pub-1',
        label: 'Net revenue retention',
        category: 'Unit Economics',
        valueType: 'percent',
        isFlow: false,
        values: [
          {
            periodYear: 2026,
            periodQuarter: 2,
            portcoValue: { numeric: 100, text: null },
            investorValue: { numeric: 120, text: null },
            displayValue: { numeric: 120, text: null },
            edited: true,
            portcoUpdatedAt: '2026-01-01T00:00:00Z',
            investorUpdatedAt: '2026-02-01T00:00:00Z',
          },
        ],
      },
    ]);
  });

  it('displays a portco-only cell as not edited', async () => {
    customDefs = [
      {
        id: 7,
        public_id: 'pub-1',
        label: 'NRR',
        category: 'Unit Economics',
        value_type: 'percent',
        is_flow: false,
      },
    ];
    customVals = [
      {
        kpi_id: 7,
        period_year: 2026,
        period_quarter: 1,
        origin: 'portco',
        value_numeric: 90,
        value_text: null,
        updated_at: '2026-01-01T00:00:00Z',
        inv_reporting_submission: { status: 'submitted' },
      },
    ];

    const [kpi] = await getCompanyCustomKpis(1);
    expect(kpi.values[0]).toEqual({
      periodYear: 2026,
      periodQuarter: 1,
      portcoValue: { numeric: 90, text: null },
      investorValue: null,
      displayValue: { numeric: 90, text: null },
      edited: false,
      portcoUpdatedAt: '2026-01-01T00:00:00Z',
      investorUpdatedAt: null,
    });
  });

  it('keeps a month and the fiscal year on separate cells', async () => {
    customDefs = [
      {
        id: 7,
        public_id: 'pub-1',
        label: 'NRR',
        category: 'Unit Economics',
        value_type: 'percent',
        is_flow: false,
      },
    ];
    // Both rows carry a NULL quarter, so keying on the quarter alone would
    // collapse the extracted month onto the FY cell.
    customVals = [
      {
        kpi_id: 7,
        period_year: 2026,
        period_quarter: null,
        period_month: null,
        origin: 'investor',
        value_numeric: 100,
        value_text: null,
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        kpi_id: 7,
        period_year: 2026,
        period_quarter: null,
        period_month: 3,
        origin: 'investor',
        value_numeric: 25,
        value_text: null,
        updated_at: '2026-04-01T00:00:00Z',
      },
    ];

    const [kpi] = await getCompanyCustomKpis(1);

    expect(kpi.values).toHaveLength(2);
    expect(kpi.values).toContainEqual(
      expect.objectContaining({
        periodQuarter: null,
        periodMonth: null,
        displayValue: { numeric: 100, text: null },
      }),
    );
    expect(kpi.values).toContainEqual(
      expect.objectContaining({
        periodQuarter: null,
        periodMonth: 3,
        displayValue: { numeric: 25, text: null },
      }),
    );
  });

  it('hides portco values until their submission is submitted', async () => {
    customDefs = [
      {
        id: 7,
        public_id: 'pub-1',
        label: 'NRR',
        category: 'Unit Economics',
        value_type: 'percent',
        is_flow: false,
      },
    ];
    // The portal saves values onto a draft (or reopened) submission as the
    // portco types, before anything is sent to the investor.
    customVals = [
      {
        kpi_id: 7,
        period_year: 2026,
        period_quarter: 1,
        origin: 'portco',
        value_numeric: 90,
        value_text: null,
        updated_at: '2026-01-01T00:00:00Z',
        inv_reporting_submission: { status: 'draft' },
      },
      {
        kpi_id: 7,
        period_year: 2026,
        period_quarter: 2,
        origin: 'portco',
        value_numeric: 95,
        value_text: null,
        updated_at: '2026-04-01T00:00:00Z',
        inv_reporting_submission: { status: 'reopened' },
      },
      {
        kpi_id: 7,
        period_year: 2026,
        period_quarter: 2,
        origin: 'investor',
        value_numeric: 97,
        value_text: null,
        updated_at: '2026-05-01T00:00:00Z',
      },
    ];

    const [kpi] = await getCompanyCustomKpis(1);

    expect(kpi.values).toEqual([
      {
        periodYear: 2026,
        periodQuarter: 2,
        portcoValue: null,
        investorValue: { numeric: 97, text: null },
        displayValue: { numeric: 97, text: null },
        edited: true,
        portcoUpdatedAt: null,
        investorUpdatedAt: '2026-05-01T00:00:00Z',
      },
    ]);
  });

  it('returns [] when the definitions query fails', async () => {
    defsError = { message: 'boom' };
    customDefs = [{ id: 7, public_id: 'pub-1' }];
    expect(await getCompanyCustomKpis(1)).toEqual([]);
  });

  it('returns [] when the values query fails', async () => {
    customDefs = [
      {
        id: 7,
        public_id: 'pub-1',
        label: 'NRR',
        category: 'Unit Economics',
        value_type: 'percent',
        is_flow: false,
      },
    ];
    valsError = { message: 'boom' };
    expect(await getCompanyCustomKpis(1)).toEqual([]);
  });
});

describe('getCompanyStandardKpiOverrides', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    customVals = [];
    valsError = null;
    valueSelectFilters = {};
  });

  it('carries the granularity of an extracted monthly override', async () => {
    customVals = [
      {
        period_year: 2026,
        period_quarter: null,
        period_month: 3,
        value_numeric: 25,
        value_text: null,
        updated_at: '2026-04-01T00:00:00Z',
        inv_kpi: { code: 'arr', is_active: true },
      },
    ];

    expect(await getCompanyStandardKpiOverrides(1)).toEqual([
      {
        code: 'arr',
        periodYear: 2026,
        periodQuarter: null,
        periodMonth: 3,
        value: { numeric: 25, text: null },
        updatedAt: '2026-04-01T00:00:00Z',
      },
    ]);
  });

  it('returns only active standard (coded) investor values', async () => {
    customVals = [
      {
        period_year: 2026,
        period_quarter: 2,
        value_numeric: 120,
        value_text: null,
        updated_at: '2026-02-01T00:00:00Z',
        inv_kpi: { code: 'arr', is_active: true },
      },
      // Custom KPI (code NULL) — surfaces via the custom payload, not here.
      {
        period_year: 2026,
        period_quarter: 1,
        value_numeric: 5,
        value_text: null,
        updated_at: '2026-01-01T00:00:00Z',
        inv_kpi: { code: null, is_active: true },
      },
      // Inactive KPI is dropped.
      {
        period_year: 2025,
        period_quarter: null,
        value_numeric: 9,
        value_text: null,
        updated_at: '2025-06-01T00:00:00Z',
        inv_kpi: { code: 'nrr', is_active: false },
      },
    ];

    const result = await getCompanyStandardKpiOverrides(1);
    expect(result).toEqual([
      {
        code: 'arr',
        periodYear: 2026,
        periodQuarter: 2,
        value: { numeric: 120, text: null },
        updatedAt: '2026-02-01T00:00:00Z',
      },
    ]);
  });

  it('returns [] when the query fails', async () => {
    valsError = { message: 'boom' };
    customVals = [
      {
        period_year: 2026,
        period_quarter: 2,
        value_numeric: 120,
        value_text: null,
        inv_kpi: { code: 'arr', is_active: true },
      },
    ];
    expect(await getCompanyStandardKpiOverrides(1)).toEqual([]);
  });
});

const resetUsage = () => {
  kpiLookup = { id: 7, value_type: 'percent', is_active: true, label: 'NRR' };
  usageCounts = { value: 0, portcoValue: 0, pendingRequest: 0 };
  usageError = null;
  usageQueries = [];
};

describe('customKpiDeleteBlockReason', () => {
  it('allows removal when the KPI is untouched', () => {
    expect(
      customKpiDeleteBlockReason({
        valueCount: 0,
        portcoValueCount: 0,
        pendingRequestCount: 0,
      }),
    ).toBeNull();
  });

  it('reports a pending request ahead of any values', () => {
    const reason = customKpiDeleteBlockReason({
      valueCount: 4,
      portcoValueCount: 4,
      pendingRequestCount: 1,
    });
    expect(reason).toContain('1 pending request');
    expect(reason).not.toContain('portfolio company');
  });

  it('points a portco-sourced block at the Settings toggle', () => {
    const reason = customKpiDeleteBlockReason({
      valueCount: 3,
      portcoValueCount: 2,
      pendingRequestCount: 0,
    });
    expect(reason).toContain('2 values submitted by a portfolio company');
    expect(reason).toContain('Disable this KPI in Settings');
  });

  it('tells an investor to clear their own values first', () => {
    const reason = customKpiDeleteBlockReason({
      valueCount: 1,
      portcoValueCount: 0,
      pendingRequestCount: 0,
    });
    expect(reason).toContain('1 recorded value');
    expect(reason).toContain('Clear them first');
  });
});

describe('getCustomKpiUsage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetUsage();
    userClientUsed = false;
    serviceClientUsed = false;
  });

  it('counts values by origin and pending request lines', async () => {
    usageCounts = { value: 5, portcoValue: 2, pendingRequest: 1 };

    const result = await getCustomKpiUsage('pub-1', admin);

    expect(result).toEqual({
      valueCount: 5,
      portcoValueCount: 2,
      pendingRequestCount: 1,
    });
    expect(serviceClientUsed).toBe(true);
  });

  it('pins every count to the KPI and the caller org', async () => {
    await getCustomKpiUsage('pub-1', admin);

    expect(usageQueries).toHaveLength(3);
    for (const query of usageQueries) {
      expect(query.filters).toMatchObject({
        kpi_id: 7,
        organization_id: 'org-1',
      });
    }
    // Only requests still awaiting a submission block removal.
    expect(usageQueries[2]).toMatchObject({
      table: 'inv_reporting_request_kpi',
      filters: { 'inv_reporting_request.status': 'sent' },
    });
  });

  it('does not resolve a KPI outside the caller org', async () => {
    kpiLookup = null;
    const result = await getCustomKpiUsage('pub-1', admin);
    expect(result).toEqual({ error: 'Custom KPI not found.' });
    expect(usageQueries).toHaveLength(0);
  });

  it('denies a non-admin caller before reading anything', async () => {
    const result = await getCustomKpiUsage('pub-1', nonAdmin);
    expect(result).toEqual({
      error: 'You do not have permission to remove custom KPIs.',
    });
    expect(usageQueries).toHaveLength(0);
  });

  it('reports a failed count rather than an empty one', async () => {
    usageError = { message: 'boom' };
    const result = await getCustomKpiUsage('pub-1', admin);
    expect(result).toEqual({
      error: 'Could not check where this KPI is used.',
    });
  });
});

describe('deactivateCustomKpi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateCall = null;
    updateError = null;
    updateRows = [{ id: 7 }];
    resetUsage();
    userClientUsed = false;
    serviceClientUsed = false;
  });

  it('soft-deletes scoped to the org through the service client', async () => {
    const result = await deactivateCustomKpi('pub-1', admin);

    expect(result).toEqual({ ok: true });
    expect(updateCall?.payload).toEqual({ is_active: false });
    expect(updateCall?.filters).toMatchObject({
      public_id: 'pub-1',
      organization_id: 'org-1',
    });
    expect(serviceClientUsed).toBe(true);
    expect(userClientUsed).toBe(false);
  });

  it('denies a non-admin caller', async () => {
    const result = await deactivateCustomKpi('pub-1', nonAdmin);
    expect(result).toEqual({
      error: 'You do not have permission to remove custom KPIs.',
    });
    expect(updateCall).toBeNull();
  });

  it('denies a client manager (clientAdmin)', async () => {
    const result = await deactivateCustomKpi('pub-1', manager);
    expect(result).toEqual({
      error: 'You do not have permission to remove custom KPIs.',
    });
    expect(updateCall).toBeNull();
  });

  it('returns an error when no KPI matches', async () => {
    updateRows = [];
    const result = await deactivateCustomKpi('pub-1', admin);
    expect(result).toEqual({ error: 'Custom KPI not found.' });
  });

  it('refuses to remove a KPI with investor-entered values', async () => {
    usageCounts = { value: 2, portcoValue: 0, pendingRequest: 0 };

    const result = await deactivateCustomKpi('pub-1', admin);

    expect(result).toEqual({
      error:
        'This KPI has 2 recorded values. Clear them first, or disable the KPI in Settings to stop tracking it.',
    });
    expect(updateCall).toBeNull();
  });

  it('refuses to remove a KPI a portco has submitted values for', async () => {
    usageCounts = { value: 3, portcoValue: 3, pendingRequest: 0 };

    const result = await deactivateCustomKpi('pub-1', admin);

    expect(result).toMatchObject({
      error: expect.stringContaining('submitted by a portfolio company'),
    });
    expect(updateCall).toBeNull();
  });

  it('refuses to remove a KPI that is in a pending request', async () => {
    usageCounts = { value: 0, portcoValue: 0, pendingRequest: 2 };

    const result = await deactivateCustomKpi('pub-1', admin);

    expect(result).toMatchObject({
      error: expect.stringContaining('2 pending requests'),
    });
    expect(updateCall).toBeNull();
  });

  it('removes a KPI whose only request lines are already settled', async () => {
    // Submitted/cancelled requests are not counted, so nothing blocks here even
    // though the KPI has been requested before.
    usageCounts = { value: 0, portcoValue: 0, pendingRequest: 0 };

    const result = await deactivateCustomKpi('pub-1', admin);

    expect(result).toEqual({ ok: true });
    expect(updateCall?.payload).toEqual({ is_active: false });
  });

  it('checks permission before reading usage', async () => {
    usageCounts = { value: 9, portcoValue: 9, pendingRequest: 9 };

    const result = await deactivateCustomKpi('pub-1', nonAdmin);

    expect(result).toEqual({
      error: 'You do not have permission to remove custom KPIs.',
    });
    expect(usageQueries).toHaveLength(0);
  });
});
