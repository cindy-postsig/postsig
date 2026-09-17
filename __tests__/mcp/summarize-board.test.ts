import { describe, expect, it } from '@jest/globals';
import { summarizeBoard } from '@/app/lib/mcp/tools/investor/companies';
import type { InvBoardSeat, InvFund } from '@/lib/v2/inv';

const ourFund: InvFund = {
  id: 356,
  publicId: 'fund-356',
  organizationId: 'org-1',
  name: 'Connecticut Innovations, Incorporated',
  shortName: 'CII',
  code: null,
  description: null,
  currency: 'USD',
} as InvFund;

const coInvestorFund: InvFund = {
  ...ourFund,
  id: 362,
  publicId: 'fund-362',
  name: 'Lassen LLC',
  shortName: null,
};

function seat(overrides: Partial<InvBoardSeat>): InvBoardSeat {
  return {
    id: 1,
    companyId: 10,
    organizationId: 'org-1',
    holderName: 'Someone',
    holderTitle: null,
    seatType: 'investor_designated',
    effectiveDate: '2023-08-09',
    endDate: null,
    designatingFundId: null,
    designatingSecurityId: null,
    committeeMemberships: null,
    metadata: {},
    designatingFund: null,
    ...overrides,
  };
}

const portfolioFundIds: ReadonlySet<number> = new Set([ourFund.id]);

describe('summarizeBoard ourDirectorCount', () => {
  it('does not count a seat designated by a co-investor fund that lives in our fund table', () => {
    // Every investor extracted from a company's documents lands in inv_fund
    // for the org, so a resolved designatingFund alone is not evidence the
    // seat is ours.
    const result = summarizeBoard(
      [
        seat({
          id: 1273,
          holderName: 'Stefan Reyniak',
          designatingFundId: coInvestorFund.id,
          designatingFund: coInvestorFund,
        }),
        seat({
          id: 1274,
          holderName: 'Jason Dinges',
          designatingFundId: coInvestorFund.id,
          designatingFund: coInvestorFund,
        }),
        seat({ id: 1276, holderName: 'CEO', seatType: 'executive' }),
      ],
      portfolioFundIds,
    );
    expect(result.directorCount).toBe(3);
    expect(result.ourDirectorCount).toBe(0);
  });

  it('counts only seats designated by a fund we invested through', () => {
    const result = summarizeBoard(
      [
        seat({
          id: 1232,
          holderName: 'Matt Storeygard',
          designatingFundId: ourFund.id,
          designatingFund: ourFund,
        }),
        seat({
          id: 1233,
          holderName: 'Matt Murphy',
          designatingFundId: 403,
          designatingFund: { ...coInvestorFund, id: 403, name: 'Montage' },
        }),
        seat({ id: 1234, holderName: 'Jay Kimmel', seatType: 'executive' }),
        seat({
          id: 1238,
          holderName: 'Connecticut Innovations, Incorporated',
          seatType: 'observer',
        }),
      ],
      portfolioFundIds,
    );
    expect(result.directorCount).toBe(3);
    expect(result.observerCount).toBe(1);
    expect(result.ourDirectorCount).toBe(1);
  });

  it('never counts observers, even when designated by our fund', () => {
    const result = summarizeBoard(
      [
        seat({
          seatType: 'observer',
          designatingFundId: ourFund.id,
          designatingFund: ourFund,
        }),
      ],
      portfolioFundIds,
    );
    expect(result.observerCount).toBe(1);
    expect(result.ourDirectorCount).toBe(0);
  });

  it('counts nothing when the org has no portfolio funds', () => {
    const result = summarizeBoard(
      [seat({ designatingFundId: ourFund.id, designatingFund: ourFund })],
      new Set(),
    );
    expect(result.ourDirectorCount).toBe(0);
  });
});
