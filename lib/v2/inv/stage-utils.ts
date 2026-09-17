// lib/v2/inv/stage-utils.ts
import type { InvestmentStage, InvFinancingRound } from './types';

/**
 * Stages whose rounds are synthetic: they record a reclassification or a
 * split rather than new money. A snapshot linked to one of these rounds
 * RESTATES the capital structure, so it is the authoritative statement of
 * which classes exist and what they total (psk-1854).
 *
 * Keep identical to the matching constant in postsig-droid.
 */
export const SYNTHETIC_STAGE_CODES = [
  'reclassification',
  'reverse_split',
  'forward_split',
] as const;

export function isSyntheticStageCode(
  stageCode: string | null | undefined,
): boolean {
  if (!stageCode) return false;
  const normalized = stageCode.toLowerCase().trim();
  return (SYNTHETIC_STAGE_CODES as readonly string[]).includes(normalized);
}

/**
 * Transaction types that restate an existing position rather than deploy or
 * return capital (psk-1854). Their legs are booked with amount 0 and cost
 * stays parked on the originally-purchased security, so they must contribute
 * neither cost nor proceeds — but the code stays robust to nonzero amounts.
 */
export const ADJUSTMENT_TRANSACTION_TYPES = [
  'reclassification',
  'conversion',
  'reverse_split',
  'forward_split',
] as const;

export function isAdjustmentTransactionType(
  transactionType: string | null | undefined,
): boolean {
  if (!transactionType) return false;
  return (ADJUSTMENT_TRANSACTION_TYPES as readonly string[]).includes(
    transactionType,
  );
}

/**
 * Transaction types that contribute cost. Mirrors the total_cost filter in
 * v_inv_position so hand-rolled TS sums agree with the view's aggregate_cost.
 */
export const POSITION_COST_TRANSACTION_TYPES = [
  'purchase',
  'exercise',
  'secondary_purchase',
  'issuance',
] as const;

/**
 * Transaction types that contribute realized proceeds. Mirrors the
 * realized_proceeds filter in v_inv_position so hand-rolled TS sums agree
 * with the view.
 */
export const POSITION_PROCEEDS_TRANSACTION_TYPES = [
  'sale',
  'secondary_sale',
  'redemption',
  'exit',
  'exit_consideration',
  'distribution',
  'dividend',
] as const;

/**
 * Only true cash movements feed IRR. Non-cash rows (conversion,
 * reclassification, splits, issuance, intra-org transfers) carry amounts in the
 * DB but never hit the investor's cash position, so including them corrupts the
 * rate. Sign is enforced by category at the call site rather than by trusting
 * stored signs.
 *
 * IRR membership intentionally differs from the cost/proceeds contract and is
 * not derived from it: `issuance` books cost but is not an outflow. Whether
 * that is right is an open spec-owner decision, so the test that pins these
 * two lists records today's behaviour — it is not an endorsement of it.
 */
export const IRR_OUTFLOW_TYPES = [
  'purchase',
  'secondary_purchase',
  'exercise',
] as const;

export const IRR_INFLOW_TYPES = [
  'sale',
  'secondary_sale',
  'distribution',
  'exit',
  'exit_consideration',
] as const;

/**
 * Stages that a sub-stage or extension code is named after, with the display
 * name shown in the UI. Mirrors `inv_stages` and `docs/stage-taxonomy.md`;
 * `pre_seed` takes an extension but no numbered sub-stages.
 */
export const GRANULAR_STAGE_BASES = [
  { code: 'pre_seed', display: 'Pre-Seed', numbered: false },
  { code: 'seed', display: 'Seed', numbered: true },
  { code: 'series_seed', display: 'Series Seed', numbered: true },
  { code: 'series_a', display: 'Series A', numbered: true },
  { code: 'series_b', display: 'Series B', numbered: true },
  { code: 'series_c', display: 'Series C', numbered: true },
  { code: 'series_d', display: 'Series D', numbered: true },
  { code: 'series_e', display: 'Series E', numbered: true },
  { code: 'series_f', display: 'Series F', numbered: true },
  { code: 'series_g', display: 'Series G', numbered: true },
] as const;

export const SUB_STAGE_NUMBERS = [1, 2, 3, 4, 5] as const;

/**
 * Every granular code paired with its display name: 45 numbered sub-stages
 * plus 10 extensions. Each is an ordinary stage, equal to any other.
 */
export const GRANULAR_STAGES: readonly {
  code: string;
  display: string;
}[] = GRANULAR_STAGE_BASES.flatMap((base) => [
  ...(base.numbered
    ? SUB_STAGE_NUMBERS.map((n) => ({
        code: `${base.code}_${n}`,
        display: `${base.display}-${n}`,
      }))
    : []),
  {
    code: `${base.code}_ext`,
    display: `${base.display} Extension`,
  },
]);

/**
 * Stage display names in taxonomy order, so codes that read as a family list
 * together, followed by the later lifecycle labels.
 */
export const STAGE_DISPLAY_ORDER: readonly string[] = [
  ...GRANULAR_STAGE_BASES.flatMap((base) => [
    base.display as string,
    ...(base.numbered
      ? SUB_STAGE_NUMBERS.map((n) => `${base.display}-${n}`)
      : []),
    `${base.display} Extension`,
  ]),
  'Growth',
  'IPO',
];

export function mapStageToInvestmentStage(
  stageCode: string | null | undefined,
): InvestmentStage | undefined {
  if (!stageCode) return undefined;

  const normalizedCode = stageCode.toLowerCase().trim();

  const stageMap: Record<string, InvestmentStage> = {
    pre_seed: 'Pre-Seed',
    seed: 'Seed',
    series_seed: 'Series Seed',
    series_a: 'Series A',
    series_b: 'Series B',
    series_c: 'Series C',
    series_d: 'Series D',
    series_e: 'Series E',
    series_f: 'Series F',
    series_g: 'Series G',
    pre_ipo: 'IPO',
    'pre-seed': 'Pre-Seed',
    preseed: 'Pre-Seed',
    'series a': 'Series A',
    'series b': 'Series B',
    'series c': 'Series C',
    'series d': 'Series D',
    'series e': 'Series E',
    'series f': 'Series F',
    'series g': 'Series G',
    dissolved: 'Dissolved',
    acquired: 'Acquired',
    merged: 'Merged',
    winding_down: 'Winding Down',
    'winding down': 'Winding Down',
    ipo: 'IPO',
    reclassification: 'Reclassification',
    reverse_split: 'Reverse Split',
    forward_split: 'Forward Split',
    ...Object.fromEntries(
      GRANULAR_STAGES.map(({ code, display }) => [
        code,
        display as InvestmentStage,
      ]),
    ),
  };

  return stageMap[normalizedCode] ?? undefined;
}

export function resolveTransactionStage(
  stageCode: string | null | undefined,
  transactionDate: string | null | undefined,
  financingRounds: InvFinancingRound[] | undefined,
): InvestmentStage | undefined {
  if (stageCode) return mapStageToInvestmentStage(stageCode);
  if (!financingRounds || financingRounds.length === 0)
    return mapStageToInvestmentStage('pre_seed');
  if (!transactionDate) return undefined;

  const txDate = new Date(transactionDate);
  const roundsBefore = financingRounds
    .filter((r) => r.initialCloseDate && new Date(r.initialCloseDate) <= txDate)
    .sort(
      (a, b) =>
        new Date(b.initialCloseDate!).getTime() -
        new Date(a.initialCloseDate!).getTime(),
    );

  if (roundsBefore.length === 0) return mapStageToInvestmentStage('pre_seed');
  return mapStageToInvestmentStage(
    roundsBefore[0].stageCode ?? roundsBefore[0].stageName,
  );
}

export function transformTransactionType(transactionType: string): string {
  if (transactionType === 'secondary_sale') return 'Secondary Sale';
  if (transactionType === 'secondary_purchase') return 'Secondary Purchase';
  if (transactionType === 'reverse_split') return 'Reverse Split';
  if (transactionType === 'forward_split') return 'Forward Split';
  if (transactionType === 'exit_consideration') return 'Exit Consideration';
  if (transactionType === 'reclassification') return 'Reclassification';
  if (transactionType === 'issuance') return 'Issuance';
  if (transactionType === 'transfer_in') return 'Transfer In';
  if (transactionType === 'transfer_out') return 'Transfer Out';
  if (transactionType === 'write_off') return 'Write Off';
  if (transactionType === 'affiliate_transfer_to')
    return 'Affiliate Transfer To';
  if (transactionType === 'affiliate_transfer_from')
    return 'Affiliate Transfer From';
  return transactionType;
}

export function resolveEntityType(
  entityType: string | null | undefined,
): string {
  if (!entityType) return 'Corporation';
  if (entityType === 'Needs Backfill') return 'Private Limited Company';
  return entityType;
}
