import {
  COST_CALCULATION_METHOD_OPTIONS,
  CostCalculationMethod,
  DEFAULT_COST_CALCULATION_METHOD,
  isCostCalculationMethod,
  resolveCostCalculationMethod,
} from '@/lib/settings/cost-calculation-method';
import {
  COST_METHODS,
  costMethodFromSetting,
  costMethodLabels,
} from '@/components/budget/costMethod';

const ALL_METHODS: CostCalculationMethod[] = [
  'amortized',
  'actual_cost',
  'contract_term',
];

describe('isCostCalculationMethod', () => {
  it('accepts every method', () => {
    for (const method of ALL_METHODS) {
      expect(isCostCalculationMethod(method)).toBe(true);
    }
  });

  it('rejects chart view-mode identifiers and junk', () => {
    expect(isCostCalculationMethod('renewals')).toBe(false);
    expect(isCostCalculationMethod('actualCost')).toBe(false);
    expect(isCostCalculationMethod('Amortized')).toBe(false);
    expect(isCostCalculationMethod('')).toBe(false);
  });
});

describe('resolveCostCalculationMethod', () => {
  it('returns each valid method unchanged', () => {
    for (const method of ALL_METHODS) {
      expect(resolveCostCalculationMethod(method)).toBe(method);
    }
  });

  it('falls back to the default for unset or malformed stored values', () => {
    expect(resolveCostCalculationMethod(null)).toBe(
      DEFAULT_COST_CALCULATION_METHOD,
    );
    expect(resolveCostCalculationMethod(undefined)).toBe(
      DEFAULT_COST_CALCULATION_METHOD,
    );
    expect(resolveCostCalculationMethod('')).toBe(
      DEFAULT_COST_CALCULATION_METHOD,
    );
    expect(resolveCostCalculationMethod('renewals')).toBe(
      DEFAULT_COST_CALCULATION_METHOD,
    );
    expect(resolveCostCalculationMethod(1)).toBe(
      DEFAULT_COST_CALCULATION_METHOD,
    );
    expect(resolveCostCalculationMethod({ method: 'amortized' })).toBe(
      DEFAULT_COST_CALCULATION_METHOD,
    );
  });

  // An org that never opens the setting must keep the behaviour it had before
  // the setting was wired up, rather than silently re-basing its spend numbers.
  it('defaults to contract_term', () => {
    expect(DEFAULT_COST_CALCULATION_METHOD).toBe('contract_term');
  });

  it('defaults onto the basis every surface used before the setting', () => {
    expect(costMethodFromSetting(DEFAULT_COST_CALCULATION_METHOD)).toBe(
      'committed',
    );
  });
});

describe('COST_CALCULATION_METHOD_OPTIONS', () => {
  it('offers only valid methods with a label and description', () => {
    expect(COST_CALCULATION_METHOD_OPTIONS.length).toBeGreaterThan(0);
    for (const option of COST_CALCULATION_METHOD_OPTIONS) {
      expect(isCostCalculationMethod(option.value)).toBe(true);
      expect(option.label).not.toHaveLength(0);
      expect(option.description).not.toHaveLength(0);
    }
  });

  it('offers every method exactly once', () => {
    const values = COST_CALCULATION_METHOD_OPTIONS.map(
      (option) => option.value,
    );
    expect(values).toEqual(['amortized', 'actual_cost', 'contract_term']);
  });

  it('includes the default so the trigger always has a label', () => {
    expect(
      COST_CALCULATION_METHOD_OPTIONS.map((option) => option.value),
    ).toContain(DEFAULT_COST_CALCULATION_METHOD);
  });
});

describe('costMethodFromSetting', () => {
  it('maps each setting onto its engine basis', () => {
    expect(costMethodFromSetting('amortized')).toBe('amortized');
    expect(costMethodFromSetting('actual_cost')).toBe('actual');
    expect(costMethodFromSetting('contract_term')).toBe('committed');
  });

  it('maps every method onto a real engine basis', () => {
    for (const method of ALL_METHODS) {
      expect(COST_METHODS).toContain(costMethodFromSetting(method));
    }
  });

  it('never collapses two settings onto one basis', () => {
    const mapped = ALL_METHODS.map(costMethodFromSetting);
    expect(new Set(mapped).size).toBe(ALL_METHODS.length);
  });

  // The dropdown and the settings page name the same three things; if the copy
  // drifts apart, users pick "Amortized" in settings and see "Contract Term"
  // selected on the report.
  it('agrees with the settings options on every label', () => {
    for (const option of COST_CALCULATION_METHOD_OPTIONS) {
      expect(costMethodLabels[costMethodFromSetting(option.value)]).toBe(
        option.label,
      );
    }
  });
});
