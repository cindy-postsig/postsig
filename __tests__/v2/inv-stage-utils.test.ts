// __tests__/v2/inv-stage-utils.test.ts
import {
  ADJUSTMENT_TRANSACTION_TYPES,
  IRR_INFLOW_TYPES,
  IRR_OUTFLOW_TYPES,
  POSITION_COST_TRANSACTION_TYPES,
  POSITION_PROCEEDS_TRANSACTION_TYPES,
  mapStageToInvestmentStage,
  resolveTransactionStage,
  GRANULAR_STAGES,
  STAGE_DISPLAY_ORDER,
} from '@/lib/v2/inv/stage-utils';
import { getStageColor } from '@/app/(app)/(investor)/investor/colors';
import type {
  InvestmentStage,
  InvFinancingRound,
} from '@/lib/v2/inv/types';

function makeRound(
  overrides: Partial<InvFinancingRound> & {
    initialCloseDate: string | null;
    stageCode?: string | null;
    stageName?: string | null;
  },
): InvFinancingRound {
  return {
    id: 1,
    publicId: 'fr-1',
    companyId: 1,
    organizationId: 'org-1',
    name: 'Round',
    stageId: null,
    currency: 'USD',
    preMoneyValuation: null,
    announcedDate: null,
    finalCloseDate: null,
    notes: null,
    externalId: null,
    metadata: {},
    impliedValuation: null,
    ...overrides,
  };
}

describe('mapStageToInvestmentStage', () => {
  it('maps database codes', () => {
    expect(mapStageToInvestmentStage('pre_seed')).toBe('Pre-Seed');
    expect(mapStageToInvestmentStage('series_a')).toBe('Series A');
    expect(mapStageToInvestmentStage('winding_down')).toBe('Winding Down');
  });

  it('maps display names case-insensitively', () => {
    expect(mapStageToInvestmentStage('Series A')).toBe('Series A');
    expect(mapStageToInvestmentStage('PRE-SEED')).toBe('Pre-Seed');
  });

  it('maps synthetic stage codes', () => {
    expect(mapStageToInvestmentStage('reclassification')).toBe(
      'Reclassification',
    );
    expect(mapStageToInvestmentStage('reverse_split')).toBe('Reverse Split');
    expect(mapStageToInvestmentStage('forward_split')).toBe('Forward Split');
  });

  it('returns undefined for unknown or empty codes', () => {
    expect(mapStageToInvestmentStage(null)).toBeUndefined();
    expect(mapStageToInvestmentStage(undefined)).toBeUndefined();
    expect(mapStageToInvestmentStage('unknown_stage')).toBeUndefined();
  });
});

describe('resolveTransactionStage', () => {
  describe('no financing rounds', () => {
    it('returns Pre-Seed when rounds array is empty', () => {
      expect(resolveTransactionStage(null, '2023-01-01', [])).toBe('Pre-Seed');
    });

    it('returns Pre-Seed when rounds is undefined', () => {
      expect(resolveTransactionStage(null, '2023-01-01', undefined)).toBe(
        'Pre-Seed',
      );
    });

    it('short-circuits with provided stageName before checking rounds', () => {
      expect(resolveTransactionStage('series_a', '2023-01-01', [])).toBe(
        'Series A',
      );
    });
  });

  describe('no filtered financing rounds', () => {
    it('returns Pre-Seed when all rounds are after the transaction date', () => {
      const rounds = [
        makeRound({ initialCloseDate: '2024-01-01', stageCode: 'series_a' }),
        makeRound({ initialCloseDate: '2025-06-01', stageCode: 'series_b' }),
      ];
      expect(resolveTransactionStage(null, '2023-01-01', rounds)).toBe(
        'Pre-Seed',
      );
    });

    it('returns Pre-Seed when all rounds have no initialCloseDate', () => {
      const rounds = [
        makeRound({ initialCloseDate: null, stageCode: 'series_a' }),
      ];
      expect(resolveTransactionStage(null, '2023-01-01', rounds)).toBe(
        'Pre-Seed',
      );
    });
  });

  describe('filtered round before transaction date', () => {
    it('returns the stage of the matching round', () => {
      const rounds = [
        makeRound({ initialCloseDate: '2022-06-01', stageCode: 'seed' }),
        makeRound({ initialCloseDate: '2024-01-01', stageCode: 'series_b' }),
      ];
      expect(resolveTransactionStage(null, '2023-01-01', rounds)).toBe('Seed');
    });

    it('falls back to stageName when stageCode is absent', () => {
      const rounds = [
        makeRound({
          initialCloseDate: '2022-06-01',
          stageCode: null,
          stageName: 'Series A',
        }),
      ];
      expect(resolveTransactionStage(null, '2023-01-01', rounds)).toBe(
        'Series A',
      );
    });
  });

  describe('transaction date between two rounds', () => {
    it('returns the most recent round before the transaction date', () => {
      const rounds = [
        makeRound({
          id: 1,
          initialCloseDate: '2021-01-01',
          stageCode: 'pre_seed',
        }),
        makeRound({ id: 2, initialCloseDate: '2022-01-01', stageCode: 'seed' }),
        makeRound({
          id: 3,
          initialCloseDate: '2023-01-01',
          stageCode: 'series_a',
        }),
        makeRound({
          id: 4,
          initialCloseDate: '2025-01-01',
          stageCode: 'series_b',
        }),
      ];
      expect(resolveTransactionStage(null, '2023-06-01', rounds)).toBe(
        'Series A',
      );
    });

    it('handles exact match on transaction date boundary', () => {
      const rounds = [
        makeRound({ id: 1, initialCloseDate: '2023-01-01', stageCode: 'seed' }),
        makeRound({
          id: 2,
          initialCloseDate: '2023-06-01',
          stageCode: 'series_a',
        }),
      ];
      expect(resolveTransactionStage(null, '2023-06-01', rounds)).toBe(
        'Series A',
      );
    });

    it('returns undefined when transactionDate is missing but rounds exist', () => {
      const rounds = [
        makeRound({ initialCloseDate: '2022-01-01', stageCode: 'seed' }),
      ];
      expect(resolveTransactionStage(null, null, rounds)).toBeUndefined();
    });
  });
});

describe('position cost / proceeds transaction types', () => {
  const cost: readonly string[] = POSITION_COST_TRANSACTION_TYPES;
  const proceeds: readonly string[] = POSITION_PROCEEDS_TRANSACTION_TYPES;

  it('lists exactly the v_inv_position filter members', () => {
    expect(cost).toEqual([
      'purchase',
      'exercise',
      'secondary_purchase',
      'issuance',
    ]);
    expect(proceeds).toEqual([
      'sale',
      'secondary_sale',
      'redemption',
      'exit',
      'exit_consideration',
      'distribution',
      'dividend',
    ]);
  });

  it('are disjoint', () => {
    expect(cost.filter((type) => proceeds.includes(type))).toEqual([]);
  });

  it('exclude the types that contribute neither cost nor proceeds', () => {
    const neither = [
      'write_off',
      'transfer_out',
      'transfer_in',
      'affiliate_transfer_to',
      'affiliate_transfer_from',
      ...ADJUSTMENT_TRANSACTION_TYPES,
    ];
    for (const type of neither) {
      expect(cost).not.toContain(type);
      expect(proceeds).not.toContain(type);
    }
  });
});

describe('investments-chart and IRR transaction types', () => {
  const outflow: readonly string[] = IRR_OUTFLOW_TYPES;
  const inflow: readonly string[] = IRR_INFLOW_TYPES;

  it('excludes write_off from both IRR sets', () => {
    expect(outflow).not.toContain('write_off');
    expect(inflow).not.toContain('write_off');
  });

  it('drives the Investments chart from types the CHECK constraint permits', () => {
    // Mirrors inv_transaction_type_ck
    // (supabase/migrations/20260311153017_inv_transaction.sql). The chart
    // allowlists POSITION_COST_TRANSACTION_TYPES, so a type added to the CHECK
    // later is excluded by default rather than counted as deployed capital.
    const checkedTypes = [
      'purchase',
      'sale',
      'conversion',
      'exercise',
      'distribution',
      'transfer_in',
      'transfer_out',
      'write_off',
      'exit_consideration',
      'reclassification',
      'secondary_sale',
      'secondary_purchase',
      'issuance',
      'affiliate_transfer_to',
      'affiliate_transfer_from',
    ];
    const cost: readonly string[] = POSITION_COST_TRANSACTION_TYPES;
    for (const type of cost) {
      expect(checkedTypes).toContain(type);
    }
    for (const type of ADJUSTMENT_TRANSACTION_TYPES) {
      expect(cost).not.toContain(type);
    }
  });

  it('leaves both IRR sets unchanged', () => {
    expect(outflow).toEqual(['purchase', 'secondary_purchase', 'exercise']);
    expect(inflow).toEqual([
      'sale',
      'secondary_sale',
      'distribution',
      'exit',
      'exit_consideration',
    ]);
  });
});

describe('granular stage taxonomy', () => {
  it('has 55 granular stages: 45 sub-stages and 10 extensions', () => {
    expect(GRANULAR_STAGES).toHaveLength(55);
    expect(GRANULAR_STAGES.filter((s) => s.code.endsWith('_ext'))).toHaveLength(
      10,
    );
  });

  it('maps every granular code to its display name', () => {
    for (const { code, display } of GRANULAR_STAGES) {
      expect(mapStageToInvestmentStage(code)).toBe(display);
    }
  });

  it('still maps the base codes', () => {
    expect(mapStageToInvestmentStage('series_a')).toBe('Series A');
    expect(mapStageToInvestmentStage('pre_seed')).toBe('Pre-Seed');
    expect(mapStageToInvestmentStage('series_seed')).toBe('Series Seed');
  });

  it('returns undefined for an unknown code', () => {
    expect(mapStageToInvestmentStage('series_a_9')).toBeUndefined();
    expect(mapStageToInvestmentStage('not_a_stage')).toBeUndefined();
  });

  it('gives every granular stage its own colour', () => {
    const grey = '#8C877F';
    for (const { display } of GRANULAR_STAGES) {
      expect(getStageColor(display as InvestmentStage)).not.toBe(grey);
    }
  });

  it('does not reuse a colour across stages', () => {
    const colours = GRANULAR_STAGES.map(({ display }) =>
      getStageColor(display as InvestmentStage),
    );
    expect(new Set(colours).size).toBe(colours.length);
  });

  it('colours a granular stage differently from the stage it is named after', () => {
    expect(getStageColor('Series A-3')).not.toBe(getStageColor('Series A'));
    expect(getStageColor('Series A Extension')).not.toBe(
      getStageColor('Series A'),
    );
    expect(getStageColor('Seed-1')).not.toBe(getStageColor('Series Seed-1'));
  });

  it('still falls back to grey for a stage with no colour', () => {
    expect(getStageColor('Reclassification')).toBe('#8C877F');
  });

  it('lists each stage before the codes named after it', () => {
    const order = STAGE_DISPLAY_ORDER;
    expect(order.indexOf('Series A')).toBeLessThan(order.indexOf('Series A-1'));
    expect(order.indexOf('Series A-1')).toBeLessThan(
      order.indexOf('Series A-5'),
    );
    expect(order.indexOf('Series A-5')).toBeLessThan(
      order.indexOf('Series A Extension'),
    );
    expect(order.indexOf('Series A Extension')).toBeLessThan(
      order.indexOf('Series B'),
    );
  });

  it('keeps Growth and IPO after the granular stages', () => {
    const order = STAGE_DISPLAY_ORDER;
    expect(order.indexOf('Series G Extension')).toBeLessThan(
      order.indexOf('Growth'),
    );
    expect(order.indexOf('Growth')).toBeLessThan(order.indexOf('IPO'));
  });
});
