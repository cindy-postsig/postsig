import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { NotFoundError } from '@/lib/errors';

const mockGetInvCompany = jest.fn<(publicId: string) => Promise<unknown>>();
const mockGetScopedPortfolioInvCompanies = jest.fn<() => Promise<unknown>>();

jest.mock('@/lib/v2/inv', () => ({
  __esModule: true,
  getInvCompany: (publicId: string) => mockGetInvCompany(publicId),
}));

jest.mock('@/lib/v2/inv/service', () => ({
  __esModule: true,
  getScopedPortfolioInvCompanies: () => mockGetScopedPortfolioInvCompanies(),
}));

import { NotFoundToolError, ValidationToolError } from '@/app/lib/mcp/errors';
import { resolveCompanyRef } from '@/app/lib/mcp/tools/investor/resolve-company';

const ACME_ID = '3f2c9a4e-5b1d-4c8e-9a7f-2d6b8e1c4a90';
const ACME_LABS_ID = '7a1e4c2b-9d3f-4e6a-8b5c-1f0d2e3a4b5c';
const TEST_CO_IDS = [
  'c4d5e6f7-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  'd5e6f7a8-2b3c-4d4e-9f0a-1b2c3d4e5f60',
];

const invCompany = (publicId: string, name: string) => ({
  id: 7,
  publicId,
  name,
});

async function rejection(promise: Promise<unknown>): Promise<Error> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (err: Error) => err,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetScopedPortfolioInvCompanies.mockResolvedValue([]);
  mockGetInvCompany.mockImplementation(async (publicId: string) => {
    if (publicId !== ACME_ID) throw new NotFoundError('Portfolio company');
    return { company: invCompany(ACME_ID, 'Acme, Inc.') };
  });
});

describe('resolveCompanyRef', () => {
  it('looks a public_id up directly, without listing the portfolio', async () => {
    await expect(resolveCompanyRef(ACME_ID)).resolves.toMatchObject({
      publicId: ACME_ID,
    });
    expect(mockGetScopedPortfolioInvCompanies).not.toHaveBeenCalled();
  });

  it('reports an unknown public_id as not found, without trying it as a name', async () => {
    await expect(
      resolveCompanyRef('00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundToolError);
    expect(mockGetScopedPortfolioInvCompanies).not.toHaveBeenCalled();
  });

  it('treats any UUID-shaped reference as a public_id, RFC bits or not', async () => {
    await expect(
      resolveCompanyRef('3f2c9a4e-5b1d-0c8e-0a7f-2d6b8e1c4a90'),
    ).rejects.toBeInstanceOf(NotFoundToolError);
    expect(mockGetInvCompany).toHaveBeenCalledWith(
      '3f2c9a4e-5b1d-0c8e-0a7f-2d6b8e1c4a90',
    );
    expect(mockGetScopedPortfolioInvCompanies).not.toHaveBeenCalled();
  });

  it('matches a name ignoring case, spacing and punctuation', async () => {
    mockGetScopedPortfolioInvCompanies.mockResolvedValue([
      invCompany(ACME_ID, 'Acme, Inc.'),
      invCompany(ACME_LABS_ID, 'Other Co'),
    ]);

    await expect(resolveCompanyRef('  acme inc ')).resolves.toMatchObject({
      publicId: ACME_ID,
    });
    // public_id is a UUID column, so a name must never reach that lookup — it
    // would be rejected by the database and logged as a miss.
    expect(mockGetInvCompany).toHaveBeenCalledTimes(1);
    expect(mockGetInvCompany).toHaveBeenCalledWith(ACME_ID);
  });

  it('matches a partial name when it singles out one company', async () => {
    mockGetScopedPortfolioInvCompanies.mockResolvedValue([
      invCompany(ACME_ID, 'Acme, Inc.'),
      invCompany(ACME_LABS_ID, 'Other Co'),
    ]);

    await expect(resolveCompanyRef('acme')).resolves.toMatchObject({
      publicId: ACME_ID,
    });
  });

  it('prefers the full-name match over partial ones', async () => {
    mockGetScopedPortfolioInvCompanies.mockResolvedValue([
      invCompany(ACME_LABS_ID, 'Acme Labs'),
      invCompany(ACME_ID, 'Acme'),
    ]);

    await expect(resolveCompanyRef('ACME')).resolves.toMatchObject({
      publicId: ACME_ID,
    });
  });

  it('lists the candidates when a partial name fits several companies', async () => {
    mockGetScopedPortfolioInvCompanies.mockResolvedValue([
      invCompany(ACME_ID, 'Acme, Inc.'),
      invCompany(ACME_LABS_ID, 'Acme Labs'),
    ]);

    const error = await rejection(resolveCompanyRef('acme'));

    expect(error).toBeInstanceOf(ValidationToolError);
    expect(error.message).toContain(`Acme, Inc. (${ACME_ID})`);
    expect(error.message).toContain(`Acme Labs (${ACME_LABS_ID})`);
    expect(mockGetInvCompany).not.toHaveBeenCalled();
  });

  it('asks for a public_id when several companies share the full name', async () => {
    mockGetScopedPortfolioInvCompanies.mockResolvedValue(
      TEST_CO_IDS.map((id) => invCompany(id, 'Test Co')),
    );

    const error = await rejection(resolveCompanyRef('Test Co'));

    expect(error).toBeInstanceOf(ValidationToolError);
    for (const id of TEST_CO_IDS) expect(error.message).toContain(id);
  });

  it('reports an unknown name as not found', async () => {
    mockGetScopedPortfolioInvCompanies.mockResolvedValue([
      invCompany(ACME_ID, 'Acme, Inc.'),
    ]);

    await expect(resolveCompanyRef('nope')).rejects.toBeInstanceOf(
      NotFoundToolError,
    );
    expect(mockGetInvCompany).not.toHaveBeenCalled();
  });

  it('never lets a name with no letters or digits match everything', async () => {
    mockGetScopedPortfolioInvCompanies.mockResolvedValue([
      invCompany(ACME_ID, 'Acme, Inc.'),
    ]);

    await expect(resolveCompanyRef(' ?! ')).rejects.toBeInstanceOf(
      NotFoundToolError,
    );
  });
});
