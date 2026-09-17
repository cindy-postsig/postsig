import { toDiscrepancyStat } from '@/lib/v2/invoices/service';

describe('toDiscrepancyStat', () => {
  it('sums an overbill as a positive magnitude', () => {
    const stat = toDiscrepancyStat([150]);

    expect(stat.amount).toBe(150);
    expect(stat.count).toBe(1);
  });

  it('sums an underbill (negative) as a positive magnitude too', () => {
    const stat = toDiscrepancyStat([-150]);

    expect(stat.amount).toBe(150);
    expect(stat.count).toBe(1);
  });

  it('does not let an underbill offset an overbill in the total', () => {
    const stat = toDiscrepancyStat([150, -150]);

    expect(stat.amount).toBe(300);
    expect(stat.count).toBe(2);
  });

  it('ignores an entry with no real gap', () => {
    const stat = toDiscrepancyStat([0]);

    expect(stat.amount).toBe(0);
    expect(stat.count).toBe(1);
  });
});
