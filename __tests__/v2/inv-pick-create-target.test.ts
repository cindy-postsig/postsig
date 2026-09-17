import { pickCreateTarget } from '@/lib/v2/inv';

describe('pickCreateTarget', () => {
  const COMPANY_ID = 42;

  it('returns null when there are no rounds', () => {
    expect(pickCreateTarget([], COMPANY_ID)).toBeNull();
  });

  it('picks the latest round by effective date', () => {
    const target = pickCreateTarget(
      [
        {
          id: 1,
          name: 'Seed',
          announced_date: '2020-01-01',
          initial_close_date: '2020-02-01',
          final_close_date: '2020-03-01',
        },
        {
          id: 2,
          name: 'Series A',
          announced_date: '2022-01-01',
          initial_close_date: '2022-02-01',
          final_close_date: '2022-03-01',
        },
      ],
      COMPANY_ID,
    );

    expect(target).toEqual({
      financingRoundId: 2,
      companyId: COMPANY_ID,
      roundName: 'Series A',
      effectiveDate: '2022-03-01',
    });
  });

  it('prefers final_close_date, then initial_close_date, then announced_date', () => {
    expect(
      pickCreateTarget(
        [
          {
            id: 1,
            name: 'Only',
            announced_date: '2021-01-01',
            initial_close_date: '2021-02-01',
            final_close_date: '2021-03-01',
          },
        ],
        COMPANY_ID,
      )?.effectiveDate,
    ).toBe('2021-03-01');

    expect(
      pickCreateTarget(
        [
          {
            id: 1,
            name: 'Only',
            announced_date: '2021-01-01',
            initial_close_date: '2021-02-01',
            final_close_date: null,
          },
        ],
        COMPANY_ID,
      )?.effectiveDate,
    ).toBe('2021-02-01');

    expect(
      pickCreateTarget(
        [
          {
            id: 1,
            name: 'Only',
            announced_date: '2021-01-01',
            initial_close_date: null,
            final_close_date: null,
          },
        ],
        COMPANY_ID,
      )?.effectiveDate,
    ).toBe('2021-01-01');
  });

  it('falls back to today when the chosen round has no dates', () => {
    const today = new Date().toISOString().slice(0, 10);
    const target = pickCreateTarget(
      [
        {
          id: 7,
          name: 'Undated',
          announced_date: null,
          initial_close_date: null,
          final_close_date: null,
        },
      ],
      COMPANY_ID,
    );

    expect(target).toEqual({
      financingRoundId: 7,
      companyId: COMPANY_ID,
      roundName: 'Undated',
      effectiveDate: today,
    });
  });

  it('treats a dated round as later than an undated round', () => {
    const target = pickCreateTarget(
      [
        {
          id: 1,
          name: 'Undated',
          announced_date: null,
          initial_close_date: null,
          final_close_date: null,
        },
        {
          id: 2,
          name: 'Dated',
          announced_date: '2019-01-01',
          initial_close_date: null,
          final_close_date: null,
        },
      ],
      COMPANY_ID,
    );

    expect(target?.financingRoundId).toBe(2);
    expect(target?.effectiveDate).toBe('2019-01-01');
  });
});
