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

// The service client provisions recipients (module lookup, user lookup,
// access/membership upserts). mockProvisionFails simulates an unavailable
// admin client so the keep-existing-recipients path can be exercised.
let mockProvisionFails = false;
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => {
    if (mockProvisionFails) return {};
    let table = '';
    const resolve = () => {
      if (table === 'app_modules') return { data: { id: 7 }, error: null };
      if (table === 'users') return { data: { id: 'ext-1' }, error: null };
      return { data: null, error: null };
    };
    const builder = {
      select: () => builder,
      eq: () => builder,
      ilike: () => builder,
      maybeSingle: () => Promise.resolve(resolve()),
      upsert: () => Promise.resolve({ error: null }),
    };
    return {
      from: (t: string) => {
        table = t;
        return builder;
      },
    };
  },
}));

jest.mock('@/emails/ReportingRequestEmail', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/emails/ReportingReminderEmail', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('resend', () => ({ Resend: jest.fn() }));

const mockCaptured: Record<string, unknown[][]> = {};
const mockUpdated: Record<string, unknown[]> = {};
let mockRecipients: { email: string }[] = [];
let mockCompanyDomain: string | null = null;
let mockRegistryDomain: string | null = null;

type Builder = {
  select: () => Builder;
  eq: () => Builder;
  is: () => Builder;
  ilike: () => Builder;
  upsert: () => Builder;
  delete: () => Builder;
  update: (values: unknown) => Builder;
  insert: (rows: unknown[]) => Promise<{ error: null }>;
  single: () => Promise<unknown>;
  maybeSingle: () => Promise<unknown>;
  then: (resolve: (v: { data: unknown; error: null }) => void) => void;
};

jest.mock('@/utils/supabase/server', () => {
  const resolveSingle = (table: string) => {
    if (table === 'users')
      return { data: { organization_id: 'org-1' }, error: null };
    if (table === 'inv_company')
      return {
        data: { id: 1, company_id: 10, domain: mockCompanyDomain },
        error: null,
      };
    if (table === 'inv_companies')
      return { data: { domain: mockRegistryDomain }, error: null };
    if (table === 'inv_reporting_request')
      return {
        data: {
          id: 1,
          public_id: 'pub-1',
          inv_reporting_request_recipient: mockRecipients,
        },
        error: null,
      };
    return { data: null, error: null };
  };
  const createClient = () => {
    let table = '';
    const builder: Builder = {
      select: () => builder,
      eq: () => builder,
      ilike: () => builder,
      upsert: () => builder,
      delete: () => builder,
      is: () => builder,
      update: (values: unknown) => {
        (mockUpdated[table] ??= []).push(values);
        return builder;
      },
      insert: (rows: unknown[]) => {
        (mockCaptured[table] ??= []).push(rows);
        return Promise.resolve({ error: null });
      },
      single: () => Promise.resolve(resolveSingle(table)),
      maybeSingle: () => Promise.resolve(resolveSingle(table)),
      then: (resolve) =>
        resolve({
          data:
            table === 'inv_reporting_request_recipient' ? mockRecipients : null,
          error: null,
        }),
    };
    return {
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } } }),
      },
      from: (t: string) => {
        table = t;
        return builder;
      },
    };
  };
  return { createClient };
});

import {
  addReportingRequestRecipient,
  createReportingRequest,
  removeReportingRequestRecipient,
} from '@/lib/v2/kpis/requests';
import { userRoles } from '@/constants/data';

const caller = {
  userId: 'user-1',
  organizationId: 'org-1',
  senderName: 'Test Sender',
  userRole: userRoles.clientAdmin,
};

const base = {
  companyId: 1,
  periodYear: 2026,
  periodQuarter: 2,
  recipientEmails: ['founder@company.com'],
};

function kpiRows() {
  return mockCaptured['inv_reporting_request_kpi']?.[0] ?? [];
}
function kpiIdsOf() {
  return kpiRows().map((r) => (r as { kpi_id: number }).kpi_id);
}
function docRows() {
  return mockCaptured['inv_reporting_request_document']?.[0] ?? [];
}

function resetMocks() {
  jest.clearAllMocks();
  for (const key of Object.keys(mockCaptured)) delete mockCaptured[key];
  for (const key of Object.keys(mockUpdated)) delete mockUpdated[key];
  mockRecipients = [];
  mockCompanyDomain = null;
  mockRegistryDomain = null;
  mockProvisionFails = false;
  delete process.env.NEXT_PUBLIC_PORTCO_APP_URL;
}

describe('createReportingRequest insert decoupling', () => {
  beforeEach(resetMocks);

  it('inserts only KPI rows for a KPI-only request', async () => {
    const result = await createReportingRequest(
      {
        ...base,
        requestType: 'kpi',
        kpiIds: [1, 2],
      },
      caller,
    );

    expect('publicId' in result).toBe(true);
    expect(kpiIdsOf()).toEqual([1, 2]);
    expect(docRows()).toHaveLength(0);
  });

  it('round-trips a mix of standard and custom KPI ids in order', async () => {
    // Custom KPIs are ordinary inv_kpi rows: the request stores their ids the
    // same way as standard ones, preserving the selection order.
    await createReportingRequest(
      {
        ...base,
        requestType: 'kpi',
        kpiIds: [3, 101, 7],
      },
      caller,
    );

    expect(kpiIdsOf()).toEqual([3, 101, 7]);
    expect(
      kpiRows().map((r) => (r as { sort_order: number }).sort_order),
    ).toEqual([0, 1, 2]);
  });

  it('inserts only document rows for a reporting-pack request', async () => {
    await createReportingRequest(
      {
        ...base,
        requestType: 'reporting_pack',
        docTypeIds: [1, 2],
        customDocLabels: ['Customer cohort analysis'],
      },
      caller,
    );

    expect(kpiRows()).toHaveLength(0);
    expect(docRows()).toHaveLength(3);
    expect(
      docRows().map((r) => (r as { doc_type_id: number | null }).doc_type_id),
    ).toEqual([1, 2, null]);
    expect((docRows()[2] as { custom_doc_type: string }).custom_doc_type).toBe(
      'Customer cohort analysis',
    );
  });

  it('inserts BOTH KPI and document rows for a combined KPI request', async () => {
    await createReportingRequest(
      {
        ...base,
        requestType: 'kpi',
        kpiIds: [1],
        docTypeIds: [3],
        customDocLabels: ['Board minutes'],
      },
      caller,
    );

    expect(kpiIdsOf()).toEqual([1]);
    expect(docRows()).toHaveLength(2);
    expect(
      docRows().map((r) => (r as { doc_type_id: number | null }).doc_type_id),
    ).toEqual([3, null]);
  });

  it('rejects a KPI request with no KPIs even when documents are present', async () => {
    const result = await createReportingRequest(
      {
        ...base,
        requestType: 'kpi',
        kpiIds: [],
        docTypeIds: [1],
      },
      caller,
    );

    expect('error' in result).toBe(true);
    expect(kpiRows()).toHaveLength(0);
    expect(docRows()).toHaveLength(0);
  });

  it('rejects an empty recipient list when the link would admit nobody', async () => {
    // No stored domain, no registry domain, no prior recipients: a
    // recipient-less request would mint a share link no one can use.
    const result = await createReportingRequest(
      {
        ...base,
        recipientEmails: [],
        requestType: 'kpi',
        kpiIds: [1],
      },
      caller,
    );

    expect(result).toEqual({ error: 'Add at least one recipient.' });
  });

  it('errors instead of wiping existing recipients when none can be provisioned', async () => {
    // A reused request that already has recipients; provisioning yields nobody
    // (admin client unavailable), so the prior recipients must be kept, not
    // dropped.
    mockRecipients = [{ email: 'existing@company.com' }];
    mockProvisionFails = true;

    const result = await createReportingRequest(
      {
        ...base,
        requestType: 'kpi',
        kpiIds: [1],
      },
      caller,
    );

    expect('error' in result).toBe(true);
  });

  it('errors when a fresh request provisions no recipients', async () => {
    // No prior recipients and total provisioning failure: success would
    // report a request whose invites all silently vanished.
    mockProvisionFails = true;

    const result = await createReportingRequest(
      {
        ...base,
        requestType: 'kpi',
        kpiIds: [1],
      },
      caller,
    );

    expect(result).toEqual({
      error: 'Could not provision any recipient for this request.',
    });
    expect(mockCaptured['inv_reporting_request_recipient']).toBeUndefined();
  });
});

describe('createReportingRequest domain capture', () => {
  beforeEach(resetMocks);

  const create = (recipientEmails: string[]) =>
    createReportingRequest(
      { ...base, recipientEmails, requestType: 'kpi', kpiIds: [1] },
      caller,
    );

  it('pins the first corporate recipient domain when none is stored', async () => {
    const result = await create(['founder@acme.io']);

    expect(mockUpdated['inv_company']).toEqual([{ domain: 'acme.io' }]);
    expect(result).toMatchObject({ companyDomain: 'acme.io' });
  });

  it('prefers the global registry domain over recipient emails', async () => {
    mockRegistryDomain = 'registered.io';
    const result = await create(['founder@other.com']);

    expect(mockUpdated['inv_company']).toEqual([{ domain: 'registered.io' }]);
    expect(result).toMatchObject({ companyDomain: 'registered.io' });
  });

  it('never overwrites an already-stored domain', async () => {
    mockCompanyDomain = 'pinned.com';
    const result = await create(['founder@elsewhere.com']);

    expect(mockUpdated['inv_company']).toBeUndefined();
    expect(result).toMatchObject({ companyDomain: 'pinned.com' });
  });

  it('never pins a freemail registry domain; falls back to recipients', async () => {
    mockRegistryDomain = 'gmail.com';
    const result = await create(['founder@acme.io']);

    expect(mockUpdated['inv_company']).toEqual([{ domain: 'acme.io' }]);
    expect(result).toMatchObject({ companyDomain: 'acme.io' });
  });

  // Freemail recipients only exist on requests predating the work-email rule;
  // resending such a request must still never pin their domain.
  it('stores nothing when grandfathered recipients are all freemail', async () => {
    mockRecipients = [
      { email: 'founder@gmail.com' },
      { email: 'cfo@outlook.com' },
    ];
    const result = await create(['founder@gmail.com', 'cfo@outlook.com']);

    expect(mockUpdated['inv_company']).toBeUndefined();
    expect(result).toMatchObject({ companyDomain: null });
  });

  it('skips grandfathered freemail recipients and pins the first corporate one', async () => {
    mockRecipients = [{ email: 'founder@gmail.com' }];
    const result = await create(['founder@gmail.com', 'cfo@acme.io']);

    expect(mockUpdated['inv_company']).toEqual([{ domain: 'acme.io' }]);
    expect(result).toMatchObject({ companyDomain: 'acme.io' });
  });
});

describe('createReportingRequest work-email rule', () => {
  beforeEach(resetMocks);

  const create = (recipientEmails: string[]) =>
    createReportingRequest(
      { ...base, recipientEmails, requestType: 'kpi', kpiIds: [1] },
      caller,
    );

  it('rejects a new freemail recipient before writing anything', async () => {
    const result = await create(['founder@gmail.com']);

    expect(result).toEqual({
      error:
        'founder@gmail.com is a personal email address. Recipients need a work email.',
    });
    expect(kpiRows()).toHaveLength(0);
  });

  it('rejects a new freemail recipient added alongside grandfathered ones', async () => {
    mockRecipients = [{ email: 'founder@gmail.com' }];
    const result = await create(['founder@gmail.com', 'new@yahoo.com']);

    expect(result).toEqual({
      error:
        'new@yahoo.com is a personal email address. Recipients need a work email.',
    });
  });

  it('accepts corporate recipients', async () => {
    const result = await create(['cfo@acme.io']);

    expect('publicId' in result).toBe(true);
    expect(mockCaptured['inv_reporting_request_recipient']?.[0]).toMatchObject([
      { email: 'cfo@acme.io', user_id: 'ext-1', invited_by: 'user-1' },
    ]);
  });
});

describe('createReportingRequest optional recipients', () => {
  beforeEach(resetMocks);

  const create = () =>
    createReportingRequest(
      { ...base, recipientEmails: [], requestType: 'kpi', kpiIds: [1] },
      caller,
    );

  it('creates a recipient-less request when the company has a domain', async () => {
    mockCompanyDomain = 'acme.io';
    const result = await create();

    expect(result).toEqual({
      publicId: 'pub-1',
      emailed: false,
      companyDomain: 'acme.io',
    });
    expect(mockCaptured['inv_reporting_request_recipient']).toBeUndefined();
  });

  it('creates a recipient-less request by pinning the registry domain', async () => {
    mockRegistryDomain = 'acme.io';
    const result = await create();

    expect(mockUpdated['inv_company']).toEqual([{ domain: 'acme.io' }]);
    expect(result).toMatchObject({ companyDomain: 'acme.io' });
  });

  it('keeps prior recipients when resent with an empty list', async () => {
    mockRecipients = [{ email: 'existing@company.com' }];
    const result = await create();

    expect('publicId' in result).toBe(true);
    expect(mockCaptured['inv_reporting_request_recipient']).toBeUndefined();
  });
});

describe('createReportingRequest confirmed domain', () => {
  beforeEach(resetMocks);

  const create = (
    companyDomain: string | null | undefined,
    recipientEmails: string[] = [],
  ) =>
    createReportingRequest(
      {
        ...base,
        recipientEmails,
        companyDomain,
        requestType: 'kpi',
        kpiIds: [1],
      },
      caller,
    );

  it('pins the confirmed domain over the registry suggestion', async () => {
    mockRegistryDomain = 'other.com';
    const result = await create('acme.io');

    expect(mockUpdated['inv_company']).toEqual([{ domain: 'acme.io' }]);
    expect(result).toMatchObject({ companyDomain: 'acme.io' });
  });

  it('normalizes pasted input to the bare host', async () => {
    const result = await create('https://www.Acme.io/about');

    expect(mockUpdated['inv_company']).toEqual([{ domain: 'acme.io' }]);
    expect(result).toMatchObject({ companyDomain: 'acme.io' });
  });

  it('rejects a freemail domain', async () => {
    const result = await create('gmail.com');

    expect(result).toEqual({
      error:
        "gmail.com is a personal email domain. Use the company's work domain.",
    });
  });

  it('rejects a malformed domain', async () => {
    const result = await create('not a domain');

    expect(result).toEqual({ error: 'Enter a valid domain like acme.com.' });
  });

  it('a cleared field pins nothing, even with corporate recipients', async () => {
    const result = await create(null, ['founder@acme.io']);

    expect(mockUpdated['inv_company']).toBeUndefined();
    expect(result).toMatchObject({ companyDomain: null });
  });

  it('treats an empty confirmed field as no domain', async () => {
    const result = await create('');

    expect(mockUpdated['inv_company']).toBeUndefined();
    expect(result).toEqual({ error: 'Add at least one recipient.' });
  });
});

describe('addReportingRequestRecipient', () => {
  beforeEach(resetMocks);

  it('rejects a freemail recipient', async () => {
    const result = await addReportingRequestRecipient(
      'pub-1',
      'Founder@GMAIL.com',
      caller,
    );

    expect(result).toEqual({
      error:
        'founder@gmail.com is a personal email address. Recipients need a work email.',
    });
  });
});

describe('removeReportingRequestRecipient', () => {
  beforeEach(resetMocks);

  it('refuses to remove the last recipient', async () => {
    mockRecipients = [{ email: 'only@company.com' }];
    const result = await removeReportingRequestRecipient(
      'pub-1',
      'only@company.com',
      caller,
    );

    expect(result).toEqual({ error: 'Cannot remove the last recipient.' });
  });

  it('removes a recipient when others remain', async () => {
    mockRecipients = [{ email: 'a@x.com' }, { email: 'b@x.com' }];
    const result = await removeReportingRequestRecipient(
      'pub-1',
      'a@x.com',
      caller,
    );

    expect(result).toEqual({ ok: true });
  });
});
