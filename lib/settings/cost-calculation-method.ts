/**
 * The org-wide default method for allocating contract cost when displaying
 * current, projected, and historical spend.
 *
 * Every surface with a cost-method dropdown seeds its selector from this;
 * `getDefaultCostMethod` (`lib/settings/default-cost-method.ts`) resolves it
 * server-side and `costMethodFromSetting` translates it into the engine's
 * `CostMethod`. The selection stays per-surface session state — changing it in
 * a report does not write back to the org setting.
 */
export type CostCalculationMethod =
  | 'amortized'
  | 'actual_cost'
  | 'contract_term';

/**
 * Contract Term, so an org that has never opened the setting keeps the
 * behaviour every surface had before the setting was wired up. This is the one
 * default: `getOrgPreference` cannot tell "no row" from "stored value equals
 * the default", so a different fallback in the resolver would leave the
 * settings page showing one method while the reports rendered another.
 */
export const DEFAULT_COST_CALCULATION_METHOD: CostCalculationMethod =
  'contract_term';

export interface CostCalculationMethodOption {
  value: CostCalculationMethod;
  label: string;
  description: string;
}

/** The selectable options, in the order they are shown. */
export const COST_CALCULATION_METHOD_OPTIONS: ReadonlyArray<CostCalculationMethodOption> =
  [
    {
      value: 'amortized',
      label: 'Amortized',
      description:
        'Allocates contract value proportionally across the contract term and applicable fiscal years.',
    },
    {
      value: 'actual_cost',
      label: 'Actual Cost',
      description:
        'Applies cost based on the expected payment date derived from the contract’s payment terms.',
    },
    {
      value: 'contract_term',
      label: 'Contract Term',
      description:
        'Applies the full contract value to the fiscal year containing the contract or renewal start date.',
    },
  ];

const VALID_METHODS: ReadonlySet<string> = new Set<CostCalculationMethod>([
  'amortized',
  'actual_cost',
  'contract_term',
]);

export function isCostCalculationMethod(
  value: unknown,
): value is CostCalculationMethod {
  return typeof value === 'string' && VALID_METHODS.has(value);
}

/**
 * Narrows an untrusted stored preference value, falling back to the default
 * for anything unrecognised.
 */
export function resolveCostCalculationMethod(
  value: unknown,
): CostCalculationMethod {
  return isCostCalculationMethod(value)
    ? value
    : DEFAULT_COST_CALCULATION_METHOD;
}
