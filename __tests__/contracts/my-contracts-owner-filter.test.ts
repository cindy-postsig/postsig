jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

interface RecordedQuery {
  table: string;
  ops: Array<{ method: string; args: unknown[] }>;
}

const queries: RecordedQuery[] = [];
let ownerRows: Array<{ contract_id: number }> = [];

/**
 * Chainable PostgREST stub: every builder method records itself and returns the
 * builder, and awaiting it resolves with the canned rows for that table.
 */
function makeBuilder(table: string) {
  const record: RecordedQuery = { table, ops: [] };
  queries.push(record);
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') {
          return (resolve: (value: unknown) => unknown) =>
            resolve({
              data: table === 'contract_owners' ? ownerRows : [],
              error: null,
            });
        }
        return (...args: unknown[]) => {
          record.ops.push({ method: String(property), args });
          return builder;
        };
      },
    },
  );
  return builder;
}

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));

jest.mock('@/data/users', () => ({
  getAllOrgUsers: async () => ['user-1'],
  getUserMetadata: async () => null,
  getUserProfile: async () => ({
    name: '  Ada Lovelace  ',
    email: 'ada@acme.com',
  }),
}));

jest.mock('@/data/utils', () => ({
  extendSupabaseQueryByUserRole: async (
    _supabase: unknown,
    query: PromiseLike<unknown>,
  ) => await query,
}));

import {
  fetchContractsByUserRoles,
  fetchContractsByUserRolesForLineageAI,
} from '@/data/superuser/contracts';
import type { UserMetadata } from '@/constants/types';

const ORG = 'org-1';
const USER = 'user-1';

const userMetadata: UserMetadata = {
  userId: USER,
  userProfile: null,
  userRole: 2,
  organizationId: ORG,
  organizationName: 'Acme',
  organizationFY: 1,
  dateFormat: 'dd/MM/yyyy',
  organizationDateFormat: 'dd/MM/yyyy',
  baseCurrency: 'USD',
  appModules: [],
  isTrial: false,
  cpmTrialEnabled: false,
  investorTrialEnabled: false,
  cpmMcpEnabled: false,
  investorMcpEnabled: false,
  cpmInvoicesEnabled: false,
  cpmExchangeAgreementsEnabled: false,
  portcoKpisEnabled: false,
};

const ownerQueries = () =>
  queries.filter((query) => query.table === 'contract_owners');
const contractQuery = () =>
  queries.filter((query) => query.table === 'contracts')[0];
const idFilters = () =>
  contractQuery().ops.filter((op) => op.method === 'in' && op.args[0] === 'id');

const fetchers = {
  fetchContractsByUserRoles: () =>
    fetchContractsByUserRoles({ myContractsOnly: true, userMetadata }),
  fetchContractsByUserRolesForLineageAI: () =>
    fetchContractsByUserRolesForLineageAI({
      myContractsOnly: true,
      userMetadata,
    }),
};

beforeEach(() => {
  queries.length = 0;
  ownerRows = [];
});

describe.each(Object.entries(fetchers))(
  '%s myContractsOnly',
  (_name, fetchContracts) => {
    it('filters on the ids the user sponsors in contract_owners', async () => {
      ownerRows = [{ contract_id: 7 }, { contract_id: 9 }, { contract_id: 7 }];

      await fetchContracts();

      expect(ownerQueries()).toHaveLength(2);
      expect(ownerQueries()[0].ops).toEqual(
        expect.arrayContaining([
          { method: 'eq', args: ['organization_id', ORG] },
          { method: 'eq', args: ['role', 'sponsor'] },
          { method: 'in', args: ['user_id', [USER]] },
        ]),
      );
      expect(ownerQueries()[1].ops).toEqual(
        expect.arrayContaining([
          { method: 'in', args: ['label', ['Ada Lovelace', 'ada@acme.com']] },
        ]),
      );
      expect(idFilters()).toEqual([{ method: 'in', args: ['id', [7, 9]] }]);
      for (const query of ownerQueries()) {
        const methods = query.ops.map((op) => op.method);
        expect(query.ops).toContainEqual({ method: 'order', args: ['id'] });
        expect(methods.indexOf('order')).toBeLessThan(methods.indexOf('range'));
      }
    });

    it('matches nothing when the user sponsors nothing', async () => {
      ownerRows = [];

      await fetchContracts();

      expect(idFilters()).toEqual([{ method: 'in', args: ['id', [-1]] }]);
    });

    it('never filters on the frozen business_sponsor column', async () => {
      ownerRows = [{ contract_id: 7 }];

      await fetchContracts();

      expect(JSON.stringify(contractQuery().ops)).not.toContain(
        'business_sponsor',
      );
    });
  },
);
