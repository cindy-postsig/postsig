import type {
  PortfolioCompany,
  LegalTerms,
  CapTableData,
  LiqPrefData,
  FinancingRoundSummary,
  CoInvestor,
} from '../../types';

/**
 * Filter company data to show only metrics relevant to a specific financing round.
 * Uses the cap table snapshot for that round to derive FMV, ownership, and post-money.
 * Supports synthetic rounds (negative IDs) derived from transaction stages.
 */
export function filterCompanyByRound(
  company: PortfolioCompany,
  roundId: number,
  rounds: FinancingRoundSummary[],
): PortfolioCompany {
  const round = rounds.find((r) => r.id === roundId);
  if (!round) return company;

  // Find the cap table snapshot for this round (only for real financing rounds)
  const snapshot =
    roundId > 0
      ? company.capTable?.snapshots.find((s) => s.financingRoundId === roundId)
      : company.capTable?.snapshots.find(
          (s) => s.stageName === round.stageName,
        );

  // Filter transactions to only those from this round's stage
  const terminalStages = new Set([
    'dissolved',
    'acquired',
    'merged',
    'winding down',
  ]);
  const isTerminalStage = terminalStages.has(
    round.stageName.trim().toLowerCase(),
  );
  // Collect known investment round stage names to exclude from terminal filter
  const knownRoundStages = isTerminalStage
    ? new Set(
        rounds
          .filter((r) => !terminalStages.has(r.stageName.trim().toLowerCase()))
          .map((r) => r.stageName),
      )
    : null;
  const filteredTransactions = company.transactions?.filter((tx) => {
    if (tx.stage === round.stageName) return true;
    // For terminal stages, include exit/distribution transactions
    // only if they don't already belong to a known investment round
    if (isTerminalStage && knownRoundStages) {
      const exitTypes = new Set([
        'exit',
        'distribution',
        'exit_consideration',
        'write_off',
      ]);
      return (
        tx.transactionType != null &&
        exitTypes.has(tx.transactionType.toLowerCase().replace(/\s+/g, '_')) &&
        (!tx.stage || !knownRoundStages.has(tx.stage))
      );
    }
    return false;
  });

  const myAggregateCost =
    filteredTransactions?.reduce((sum, tx) => sum + (tx.cost ?? 0), 0) ?? 0;
  const totalEquityFinancing =
    filteredTransactions?.reduce((sum, tx) => sum + (tx.amount ?? 0), 0) ?? 0;
  const postMoney = snapshot?.impliedValuation ?? 0;
  const ourShares = snapshot?.ourTotalShares ?? 0;
  const pricePerShare = snapshot?.sharePrice ?? 0;
  const myFmv = ourShares * pricePerShare;
  const multiple = myAggregateCost > 0 ? myFmv / myAggregateCost : 0;
  const myFdPercent = snapshot?.ourFdOwnershipPercent ?? 0;

  // Derive last transaction date and price per unit from filtered data only
  const sortedTx = [...(filteredTransactions ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const lastTransactionDate = sortedTx[0]?.date ?? '';
  const currentPricePerUnit = pricePerShare || 0;

  return {
    ...company,
    myTotalFMV: myFmv,
    impliedValue: myFmv,
    postMoneyValuation: postMoney,
    myAggregateCost,
    totalEquityFinancing,
    currentPricePerUnit,
    lastTransactionDate,
    multiple,
    moic: multiple || null,
    myFullyDilutedPercent: myFdPercent,
    myOwnership: snapshot?.ourOwnershipPercent ?? company.myOwnership,
    transactions: filteredTransactions,
    financingRounds: company.financingRounds?.filter(
      (r) => r.id === roundId || r.stageName === round.stageName,
    ),
  };
}

/**
 * Filter cap table data to only show the snapshot from the selected round.
 * Supports synthetic rounds by matching on stageName.
 */
export function filterCapTableByRound(
  capTable: CapTableData | undefined,
  roundId: number,
  rounds: FinancingRoundSummary[],
): CapTableData | undefined {
  if (!capTable) return undefined;

  const round = rounds.find((r) => r.id === roundId);
  if (!round) return capTable;

  // Try matching by financingRoundId first (real rounds), then by stageName
  let filteredSnapshots = capTable.snapshots.filter(
    (s) => s.financingRoundId === roundId,
  );

  if (filteredSnapshots.length === 0) {
    filteredSnapshots = capTable.snapshots.filter(
      (s) => s.stageName === round.stageName,
    );
  }

  if (filteredSnapshots.length === 0) return undefined;

  return {
    ...capTable,
    snapshots: filteredSnapshots,
    availableDates: filteredSnapshots.map((s) => s.asOfDate),
  };
}

/**
 * Filter co-investors to only those who participated in the selected round.
 */
export function filterCoInvestorsByRound(
  coInvestors: CoInvestor[] | undefined,
  roundId: number,
): CoInvestor[] | undefined {
  if (!coInvestors) return undefined;

  const filtered = coInvestors
    .map((ci) => ({
      ...ci,
      investments: ci.investments.filter(
        (inv) => inv.financingRoundId === roundId,
      ),
    }))
    .filter((ci) => ci.investments.length > 0);

  return filtered.length > 0 ? filtered : undefined;
}

/**
 * Filter liquidation preference data to only securities from the selected round.
 */
export function filterLiqPrefByRound(
  liqPrefData: LiqPrefData | undefined,
  financingRounds: FinancingRoundSummary[] | undefined,
  roundId: number,
): LiqPrefData | undefined {
  if (!liqPrefData || !financingRounds) return liqPrefData;

  const round = financingRounds.find((r) => r.id === roundId);
  if (!round) return liqPrefData;

  // Filter liq pref rows by equity class matching the round's stage name
  // Use word-boundary match to avoid over-matching (e.g., "Seed" matching "Series Seed")
  const stageLower = round.stageName.trim().toLowerCase();
  const stagePattern = new RegExp(
    `\\b${stageLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
  );
  const filteredRows = liqPrefData.rows.filter((row) =>
    stagePattern.test(row.equityClass.toLowerCase()),
  );

  if (filteredRows.length === 0) return undefined;

  return {
    rows: filteredRows,
    myTotalLiqPref: filteredRows.reduce((sum, r) => sum + r.myLiqPref, 0),
    totalLiqPref: filteredRows.reduce(
      (sum, r) => sum + (r.totalLiqPref ?? 0),
      0,
    ),
  };
}

/**
 * Filter legal terms to show only terms from the selected financing round.
 * Falls back to the aggregated legalTerms if no per-round data matches.
 */
export function filterLegalTermsByRound(
  legalTerms: LegalTerms | undefined,
  legalTermsByRound:
    | { financingRoundId: number; legalTerms: LegalTerms }[]
    | undefined,
  rounds: FinancingRoundSummary[],
  roundId: number,
): LegalTerms | undefined {
  if (!legalTermsByRound || legalTermsByRound.length === 0) return legalTerms;

  const round = rounds.find((r) => r.id === roundId);
  if (!round) return legalTerms;

  // For real financing rounds, match by ID directly
  if (roundId > 0) {
    const match = legalTermsByRound.find(
      (entry) => entry.financingRoundId === roundId,
    );
    return match?.legalTerms ?? undefined;
  }

  // For synthetic rounds, no per-round legal terms available
  return undefined;
}
