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

jest.mock('@/data/users', () => ({
  getUserMetadata: () => Promise.resolve({ organizationId: 'org-1' }),
}));

let hiddenPrefRow: { preference_value: unknown } | null = null;
let prefError: unknown = null;
let upsertedPref: Record<string, unknown> | null = null;
let upsertError: unknown = null;
let kpiRows: Record<string, unknown>[] = [];
let kpiError: unknown = null;
let valueRows: Record<string, unknown>[] = [];
let valueError: unknown = null;

jest.mock('@/utils/supabase/server', () => {
  const createClient = () => {
    let table = '';
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      not: () => builder,
      or: () => builder,
      in: () => builder,
      order: () => builder,
      upsert: (row: Record<string, unknown>) => {
        if (table === 'org_preferences') upsertedPref = row;
        return Promise.resolve({ error: upsertError });
      },
      maybeSingle: () =>
        Promise.resolve(
          table === 'org_preferences'
            ? { data: hiddenPrefRow, error: prefError }
            : { data: null, error: null },
        ),
      then: (resolve: (value: unknown) => unknown) => {
        if (table === 'inv_kpi')
          return resolve({ data: kpiRows, error: kpiError });
        if (table === 'inv_kpi_value')
          return resolve({ data: valueRows, error: valueError });
        return resolve({ data: null, error: null });
      },
    });
    return {
      from: (t: string) => {
        table = t;
        return builder;
      },
    };
  };
  return { createClient };
});

import { userRoles } from '@/constants/data';
import {
  getHiddenKpiIds,
  setHiddenKpiIds,
  KpiSettingsError,
} from '@/lib/v2/kpis/kpi-settings';
import {
  getKpis,
  getCompanyCustomKpis,
  getCompanyStandardKpiOverrides,
} from '@/lib/v2/kpis/service';

const KPI_A = '11111111-1111-4111-8111-111111111111';
const KPI_B = '22222222-2222-4222-8222-222222222222';

const admin = {
  userId: 'user-1',
  organizationId: 'org-1',
  userRole: userRoles.clientSupervisor,
};
const clientManager = {
  userId: 'user-4',
  organizationId: 'org-1',
  userRole: userRoles.clientAdmin,
};
const postsigAdmin = {
  userId: 'user-5',
  organizationId: 'org-1',
  userRole: userRoles.postsigAdmin,
};
const nonAdmin = {
  userId: 'user-2',
  organizationId: 'org-1',
  userRole: userRoles.clientUser,
};

const kpiDef = (publicId: string, code: string | null) => ({
  id: publicId === KPI_A ? 1 : 2,
  public_id: publicId,
  organization_id: code === null ? 'org-1' : null,
  code,
  label: code ?? 'Custom',
  category: 'Unit Economics',
  value_type: 'percent',
  unit: null,
  description: null,
  placeholder: null,
  sort_order: publicId === KPI_A ? 1 : 2,
  is_flow: false,
});

beforeEach(() => {
  jest.clearAllMocks();
  hiddenPrefRow = null;
  prefError = null;
  upsertedPref = null;
  upsertError = null;
  kpiRows = [];
  kpiError = null;
  valueRows = [];
  valueError = null;
});

describe('setHiddenKpiIds', () => {
  it('upserts a deduped list scoped to the org and returns it', async () => {
    const result = await setHiddenKpiIds([KPI_A, KPI_A, KPI_B], admin);

    expect(result).toEqual([KPI_A, KPI_B]);
    expect(upsertedPref).toEqual({
      organization_id: 'org-1',
      preference_key: 'reporting.hidden_kpis',
      preference_value: [KPI_A, KPI_B],
    });
  });

  it('rejects an internal PostSig admin with a 403 and does not write', async () => {
    const error = await setHiddenKpiIds([KPI_A], postsigAdmin).catch((e) => e);

    expect(error).toBeInstanceOf(KpiSettingsError);
    expect(error.status).toBe(403);
    expect(upsertedPref).toBeNull();
  });

  it('rejects a client manager with a 403 and does not write', async () => {
    const error = await setHiddenKpiIds([KPI_A], clientManager).catch((e) => e);

    expect(error).toBeInstanceOf(KpiSettingsError);
    expect(error.status).toBe(403);
    expect(upsertedPref).toBeNull();
  });

  it('rejects a non-admin caller with a 403 and does not write', async () => {
    const error = await setHiddenKpiIds([KPI_A], nonAdmin).catch((e) => e);

    expect(error).toBeInstanceOf(KpiSettingsError);
    expect(error.status).toBe(403);
    expect(upsertedPref).toBeNull();
  });

  it('rejects non-uuid ids with a 400 and does not write', async () => {
    const error = await setHiddenKpiIds(['not-a-uuid'], admin).catch((e) => e);

    expect(error).toBeInstanceOf(KpiSettingsError);
    expect(error.status).toBe(400);
    expect(upsertedPref).toBeNull();
  });
});

describe('getHiddenKpiIds', () => {
  it('returns [] when no preference row exists', async () => {
    hiddenPrefRow = null;
    expect(await getHiddenKpiIds()).toEqual([]);
  });

  it('returns the stored uuids', async () => {
    hiddenPrefRow = { preference_value: [KPI_A, KPI_B] };
    expect(await getHiddenKpiIds()).toEqual([KPI_A, KPI_B]);
  });

  it('returns [] when the stored value is malformed', async () => {
    hiddenPrefRow = { preference_value: [42] };
    expect(await getHiddenKpiIds()).toEqual([]);
  });
});

describe('getKpis hidden filtering', () => {
  it('excludes hidden KPIs by default', async () => {
    kpiRows = [kpiDef(KPI_A, 'arr'), kpiDef(KPI_B, 'nrr')];
    hiddenPrefRow = { preference_value: [KPI_B] };

    const result = await getKpis();
    expect(result.map((k) => k.publicId)).toEqual([KPI_A]);
  });

  it('returns all KPIs when includeHidden is set', async () => {
    kpiRows = [kpiDef(KPI_A, 'arr'), kpiDef(KPI_B, 'nrr')];
    hiddenPrefRow = { preference_value: [KPI_B] };

    const result = await getKpis({ includeHidden: true });
    expect(result.map((k) => k.publicId)).toEqual([KPI_A, KPI_B]);
  });

  it('returns all KPIs when no preference row exists', async () => {
    kpiRows = [kpiDef(KPI_A, 'arr'), kpiDef(KPI_B, 'nrr')];
    hiddenPrefRow = null;

    const result = await getKpis();
    expect(result.map((k) => k.publicId)).toEqual([KPI_A, KPI_B]);
  });
});

describe('getCompanyCustomKpis hidden filtering', () => {
  it('drops hidden custom KPIs from the result', async () => {
    kpiRows = [
      {
        id: 1,
        public_id: KPI_A,
        label: 'Custom A',
        category: 'Unit Economics',
        value_type: 'percent',
        is_flow: false,
      },
      {
        id: 2,
        public_id: KPI_B,
        label: 'Custom B',
        category: 'Unit Economics',
        value_type: 'percent',
        is_flow: false,
      },
    ];
    valueRows = [];
    hiddenPrefRow = { preference_value: [KPI_B] };

    const result = await getCompanyCustomKpis(1);
    expect(result.map((k) => k.publicId)).toEqual([KPI_A]);
  });
});

describe('getCompanyStandardKpiOverrides hidden filtering', () => {
  it('drops overrides for hidden standard KPIs', async () => {
    valueRows = [
      {
        period_year: 2026,
        period_quarter: 2,
        value_numeric: 120,
        value_text: null,
        updated_at: '2026-02-01T00:00:00Z',
        inv_kpi: { public_id: KPI_A, code: 'arr', is_active: true },
      },
      {
        period_year: 2026,
        period_quarter: 1,
        value_numeric: 90,
        value_text: null,
        updated_at: '2026-01-01T00:00:00Z',
        inv_kpi: { public_id: KPI_B, code: 'nrr', is_active: true },
      },
    ];
    hiddenPrefRow = { preference_value: [KPI_B] };

    const result = await getCompanyStandardKpiOverrides(1);
    expect(result.map((o) => o.code)).toEqual(['arr']);
  });
});
