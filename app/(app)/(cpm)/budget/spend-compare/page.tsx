import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { PriceHistoryChart } from '@/components/budget/PriceHistoryChart';
import { SpendOverview } from '@/components/budget/SpendOverview';
import { getUserMetadata } from '@/data/users';
import { getBudgetContracts, buildBudgetSummary } from '@/lib/v2';
import { resolveWindow } from '@/lib/v2/spend';
import { getDefaultCostMethod } from '@/lib/settings/default-cost-method';

// TEMPORARY (psk-1850): side-by-side comparison of the legacy chart pipeline
// and the spend-engine chart, for the phase-5.2.1 product decisions
// (renewals-event framing, TCV story, default basis). Not linked from
// navigation; delete when the budget overview flips to SpendChart.
export default async function SpendComparePage() {
  const [userMetaData, { contracts }] = await Promise.all([
    getUserMetadata(),
    getBudgetContracts(),
  ]);

  if (!userMetaData) {
    notFound();
  }

  const priceHistories = buildBudgetSummary(contracts).priceHistories;
  const defaultCostMethod = await getDefaultCostMethod(
    userMetaData.organizationId,
  );

  return (
    <div>
      <div className="mb-8 mt-6">
        <h1 className="font-serif">Spend Chart Comparison</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Legacy chart (top) vs the psk-1844 method model (bottom): one dropdown
          — Amortized, Actual Cost, Contract Term — drives the cards and the
          chart. Contract Term stacks new contracts vs renewals, dated at the
          cancel-by deadline where one exists (else the renewal&apos;s start).
          Legacy&apos;s Renewals and TCV views are not carried over (decide at
          the chart port). Also different: amortized/actual leading-gap fill and
          increase compounding, per-view auto-scaling axes, zero-value fee
          shells dropped.
        </p>
      </div>

      <Card className="mb-6 bg-card/50 p-5 dark:bg-card">
        <p className="mb-4 font-label text-xs uppercase text-muted-foreground">
          Legacy — production pipeline
        </p>
        <PriceHistoryChart
          priceHistories={priceHistories}
          fiscalYearStartMonth={userMetaData.organizationFY}
        />
      </Card>

      <p className="mb-2 font-label text-xs uppercase text-muted-foreground">
        Spend engine — /api/v2/spend
      </p>
      <SpendOverview
        currentFiscalYear={
          resolveWindow('currentFY', new Date(), {
            startMonth: userMetaData.organizationFY || 1,
          }).fyNum
        }
        oldestFiscalYear={null}
        defaultMethod={defaultCostMethod}
      />
    </div>
  );
}
