import { buildFxDisclosure } from '@/lib/v2/reports/monthly-report/service';
import type { CurrencyPolicy, SpendRateProvider } from '@/lib/v2/spend/types';

const CURRENT = '2026-08';
const NEXT = '2026-09';

/** Records every lookup so the test can assert the exact month keys queried. */
function stubProvider(
  rates: Record<string, Record<string, number>>,
): SpendRateProvider & { calls: Array<[string, string]> } {
  const calls: Array<[string, string]> = [];
  return {
    calls,
    monthRate(from: string, monthKey: string) {
      calls.push([from, monthKey]);
      return rates[from]?.[monthKey] ?? 1;
    },
    dateRate: () => 1,
  };
}

function basePolicy(
  target: string,
  provider: SpendRateProvider,
): CurrencyPolicy {
  return { mode: 'base', target, rates: provider };
}

describe('buildFxDisclosure', () => {
  it('reports one row per non-target source currency, at the two month rates', () => {
    const provider = stubProvider({
      USD: { [CURRENT]: 0.9203, [NEXT]: 0.921 },
      GBP: { [CURRENT]: 1.1704, [NEXT]: 1.1688 },
    });

    const disclosure = buildFxDisclosure(
      [
        { currency: 'USD' },
        { currency: 'EUR' },
        { currency: 'GBP' },
        { currency: 'USD' },
      ],
      basePolicy('EUR', provider),
      CURRENT,
      NEXT,
    );

    // The month keys ride along with the rates so the client labels the months
    // the report was computed for, not the ones its own clock is in.
    expect(disclosure).toEqual([
      {
        from: 'GBP',
        currentMonthKey: CURRENT,
        currentMonthRate: 1.1704,
        nextMonthKey: NEXT,
        nextMonthRate: 1.1688,
      },
      {
        from: 'USD',
        currentMonthKey: CURRENT,
        currentMonthRate: 0.9203,
        nextMonthKey: NEXT,
        nextMonthRate: 0.921,
      },
    ]);
    expect(provider.calls).toEqual([
      ['GBP', CURRENT],
      ['GBP', NEXT],
      ['USD', CURRENT],
      ['USD', NEXT],
    ]);
  });

  it('is empty when every contract is already in the target currency', () => {
    const provider = stubProvider({});

    expect(
      buildFxDisclosure(
        [{ currency: 'EUR' }, { currency: 'eur' }],
        basePolicy('EUR', provider),
        CURRENT,
        NEXT,
      ),
    ).toEqual([]);
    expect(provider.calls).toHaveLength(0);
  });

  it('normalizes case and treats a missing currency as USD', () => {
    const provider = stubProvider({ USD: { [CURRENT]: 0.92, [NEXT]: 0.93 } });

    const disclosure = buildFxDisclosure(
      [{ currency: 'usd' }, { currency: null }, { currency: undefined }, {}],
      basePolicy('EUR', provider),
      CURRENT,
      NEXT,
    );

    expect(disclosure).toEqual([
      {
        from: 'USD',
        currentMonthKey: CURRENT,
        currentMonthRate: 0.92,
        nextMonthKey: NEXT,
        nextMonthRate: 0.93,
      },
    ]);
  });

  it('discloses nothing under a non-base policy', () => {
    expect(
      buildFxDisclosure(
        [{ currency: 'USD' }],
        { mode: 'native' },
        CURRENT,
        NEXT,
      ),
    ).toEqual([]);
  });
});
