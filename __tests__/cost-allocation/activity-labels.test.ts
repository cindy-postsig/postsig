import {
  allocationChangeHeadline,
  describeAllocationScope,
  formatPercent,
  summarizeAllocationChange,
} from '@/lib/v2/cost-allocation/activity-labels';
import type { AllocationChangedActivityData } from '@/constants/types';

describe('activity labels', () => {
  const data: AllocationChangedActivityData = {
    before: [],
    after: [
      {
        productId: null,
        mode: 'manual',
        lines: [
          {
            orgUnitId: 3,
            orgEmployeeId: null,
            percent: 60,
            targetName: 'Research',
          },
          { orgUnitId: null, orgEmployeeId: 9, percent: 40 },
        ],
      },
    ],
  };

  it('formats percents without trailing noise', () => {
    expect(formatPercent(33.3333)).toBe('33.33%');
    expect(formatPercent(50)).toBe('50%');
    expect(formatPercent(12.5)).toBe('12.5%');
  });

  it('describes a manual scope with resolved names and id fallbacks', () => {
    expect(describeAllocationScope(data.after[0])).toBe(
      'Entire contract — Research 60%, Employee #9 40%',
    );
  });

  it('describes product scopes and the active_users mode', () => {
    expect(
      describeAllocationScope({
        productId: 7,
        productName: 'Terminal',
        mode: 'active_users',
        lines: [],
      }),
    ).toBe('Terminal — Split equally among active users');
    expect(
      describeAllocationScope({
        productId: 7,
        mode: 'active_users',
        lines: [],
      }),
    ).toBe('Product #7 — Split equally among active users');
  });

  it('summarizes before/after and picks a headline by direction', () => {
    expect(summarizeAllocationChange(data)).toEqual({
      before: [],
      after: ['Entire contract — Research 60%, Employee #9 40%'],
    });
    expect(allocationChangeHeadline(data)).toBe('Set cost allocation');
    expect(allocationChangeHeadline({ before: data.after, after: [] })).toBe(
      'Removed cost allocation',
    );
    expect(
      allocationChangeHeadline({ before: data.after, after: data.after }),
    ).toBe('Changed cost allocation');
  });
});
