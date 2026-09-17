import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { NotFoundError } from '@/lib/errors';
import { NotFoundToolError } from '@/app/lib/mcp/errors';

const mockGetInvCompany = jest.fn<() => Promise<unknown>>();
const mockGetScopedPortfolioInvCompanies = jest.fn<() => Promise<unknown>>();
const mockGetInvCoInvestors =
  jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetInvCoInvestorNetwork =
  jest.fn<(...args: unknown[]) => Promise<unknown>>();

const ACME_ID = '3f2c9a4e-5b1d-4c8e-9a7f-2d6b8e1c4a90';

jest.mock('@/lib/v2/inv', () => ({
  __esModule: true,
  getInvCompany: () => mockGetInvCompany(),
}));

jest.mock('@/lib/v2/inv/service', () => ({
  __esModule: true,
  getInvCoInvestors: (...args: unknown[]) => mockGetInvCoInvestors(...args),
  getInvCoInvestorNetwork: (...args: unknown[]) =>
    mockGetInvCoInvestorNetwork(...args),
  getScopedPortfolioInvCompanies: () => mockGetScopedPortfolioInvCompanies(),
}));

import { coinvestorTools } from '@/app/lib/mcp/tools/investor/coinvestors';

function tool(name: string) {
  const t = coinvestorTools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return (input: unknown) => t.handler(input, {});
}

function networkEntry(
  investorName: string,
  over: Partial<{
    investorType: string | null;
    roundsParticipated: number;
    companiesCoinvested: number;
    companyNames: string[];
    totalCoinvested: number | null;
  }> = {},
) {
  return {
    investorName,
    investorType: over.investorType ?? 'VC',
    roundsParticipated: over.roundsParticipated ?? 1,
    companiesCoinvested: over.companiesCoinvested ?? 1,
    companyNames: over.companyNames ?? ['Acme'],
    totalCoinvested: over.totalCoinvested ?? 1_000_000,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('get_company_co_investors', () => {
  it('groups co-investors by round, newest first, with totals', async () => {
    mockGetInvCompany.mockResolvedValue({
      company: { id: 7, publicId: ACME_ID, name: 'Acme' },
    });
    mockGetInvCoInvestors.mockResolvedValue({
      coInvestors: [
        {
          financingRoundId: 1,
          investorName: 'Alpha',
          investorType: 'VC',
          relationship: 'co-investor',
          hasBoardSeat: true,
          isMajorInvestor: true,
          amountInvested: 500,
          currency: 'USD',
          roundStageName: 'Seed',
          roundStageCode: 'SEED',
          roundDate: '2021-01-01',
        },
        {
          financingRoundId: 2,
          investorName: 'Beta',
          investorType: 'VC',
          relationship: 'co-investor',
          hasBoardSeat: false,
          isMajorInvestor: false,
          amountInvested: 300,
          currency: 'USD',
          roundStageName: 'Series A',
          roundStageCode: 'A',
          roundDate: '2023-06-01',
        },
        {
          financingRoundId: 2,
          investorName: 'Alpha',
          investorType: 'VC',
          relationship: 'co-investor',
          hasBoardSeat: false,
          isMajorInvestor: false,
          amountInvested: 200,
          currency: 'USD',
          roundStageName: 'Series A',
          roundStageCode: 'A',
          roundDate: '2023-06-01',
        },
      ],
    });

    const res = (await tool('get_company_co_investors')({
      public_id: ACME_ID,
    })) as {
      count: number;
      dealCount: number;
      totalInvested: number;
      rounds: Array<{
        stage: string;
        totalInvested: number;
        coInvestorCount: number;
      }>;
    };

    expect(res.dealCount).toBe(3);
    expect(res.count).toBe(2); // Alpha + Beta unique
    expect(res.totalInvested).toBe(1000);
    // newest round first
    expect(res.rounds[0].stage).toBe('Series A');
    expect(res.rounds[0].coInvestorCount).toBe(2);
    expect(res.rounds[0].totalInvested).toBe(500);
    expect(res.rounds[1].stage).toBe('Seed');
  });

  it('maps a missing company to a structured not-found error', async () => {
    mockGetInvCompany.mockRejectedValue(new NotFoundError('nope'));
    await expect(
      tool('get_company_co_investors')({
        public_id: '00000000-0000-4000-8000-000000000000',
      }),
    ).rejects.toBeInstanceOf(NotFoundToolError);
  });
});

describe('list_co_investors', () => {
  function seedNetwork() {
    mockGetInvCoInvestorNetwork.mockResolvedValue(
      new Map([
        [
          'Alpha',
          networkEntry('Alpha', {
            companiesCoinvested: 3,
            roundsParticipated: 4,
            totalCoinvested: 9,
            companyNames: ['Acme', 'Beta', 'Gamma'],
          }),
        ],
        [
          'Bravo',
          networkEntry('Bravo', {
            companiesCoinvested: 1,
            roundsParticipated: 1,
            totalCoinvested: 50,
            companyNames: ['Acme'],
          }),
        ],
        [
          'Charlie',
          networkEntry('Charlie', {
            companiesCoinvested: 2,
            roundsParticipated: 2,
            totalCoinvested: 2,
            companyNames: ['Delta'],
          }),
        ],
      ]),
    );
  }

  it('sorts by companies shared then total dollars', async () => {
    seedNetwork();
    const res = (await tool('list_co_investors')({})) as {
      coInvestors: Array<{ name: string }>;
    };
    expect(res.coInvestors.map((c) => c.name)).toEqual([
      'Alpha',
      'Charlie',
      'Bravo',
    ]);
  });

  it('applies min_companies and min_rounds filters', async () => {
    seedNetwork();
    const byCompanies = (await tool('list_co_investors')({
      min_companies: 2,
    })) as {
      count: number;
      coInvestors: Array<{ name: string }>;
    };
    expect(byCompanies.coInvestors.map((c) => c.name)).toEqual([
      'Alpha',
      'Charlie',
    ]);

    const byRounds = (await tool('list_co_investors')({ min_rounds: 3 })) as {
      coInvestors: Array<{ name: string }>;
    };
    expect(byRounds.coInvestors.map((c) => c.name)).toEqual(['Alpha']);
  });

  it('filters by shared_company via resolved company name', async () => {
    seedNetwork();
    mockGetInvCompany.mockResolvedValue({
      company: { id: 7, publicId: ACME_ID, name: 'Acme' },
    });
    const res = (await tool('list_co_investors')({
      shared_company: ACME_ID,
    })) as { coInvestors: Array<{ name: string }> };
    // Only Alpha and Bravo list 'Acme'
    expect(res.coInvestors.map((c) => c.name).sort()).toEqual([
      'Alpha',
      'Bravo',
    ]);
  });
});

describe('get_co_investor', () => {
  it('matches case-insensitively and resolves shared company public ids', async () => {
    mockGetInvCoInvestorNetwork.mockResolvedValue(
      new Map([
        [
          'Alpha Partners',
          networkEntry('Alpha Partners', { companyNames: ['Acme', 'Mystery'] }),
        ],
      ]),
    );
    mockGetScopedPortfolioInvCompanies.mockResolvedValue([
      { id: 7, publicId: ACME_ID, name: 'Acme' },
    ]);

    const res = (await tool('get_co_investor')({
      name: 'alpha partners',
    })) as {
      name: string;
      sharedCompanies: Array<{ publicId: string | null; name: string }>;
    };

    expect(res.name).toBe('Alpha Partners');
    expect(res.sharedCompanies).toEqual([
      { publicId: ACME_ID, name: 'Acme' },
      { publicId: null, name: 'Mystery' },
    ]);
  });

  it('leaves the public id null when several companies share a name', async () => {
    mockGetInvCoInvestorNetwork.mockResolvedValue(
      new Map([
        [
          'Alpha Partners',
          networkEntry('Alpha Partners', { companyNames: ['Test Co'] }),
        ],
      ]),
    );
    mockGetScopedPortfolioInvCompanies.mockResolvedValue([
      { id: 7, publicId: ACME_ID, name: 'Test Co' },
      {
        id: 8,
        publicId: '00000000-0000-4000-8000-000000000000',
        name: 'Test Co',
      },
    ]);

    const res = (await tool('get_co_investor')({ name: 'Alpha Partners' })) as {
      sharedCompanies: Array<{ publicId: string | null; name: string }>;
    };

    expect(res.sharedCompanies).toEqual([{ publicId: null, name: 'Test Co' }]);
  });

  it('throws when the co-investor is unknown', async () => {
    mockGetInvCoInvestorNetwork.mockResolvedValue(new Map());
    await expect(tool('get_co_investor')({ name: 'nobody' })).rejects.toThrow();
  });
});
