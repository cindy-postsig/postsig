'use client';

import { useState } from 'react';
import { parseAsInteger, useQueryState } from 'nuqs';
import { Card } from '@/components/ui/card';
import { SpendChart } from '@/components/budget/SpendChart';
import { SpendMethodCards } from '@/components/budget/SpendMethodCards';
import { CostMethodSelect } from '@/components/budget/CostMethodSelect';
import {
  FiscalYearSelect,
  fiscalYearOptions,
} from '@/components/budget/FiscalYearSelect';
import type { CostMethod } from '@/components/budget/costMethod';

/**
 * Owns the cost-calculation method and the selected fiscal year for the whole
 * overview: one method state drives the cards and the chart, and `fy` (via
 * the URL param triggering a server re-render) keeps the table on the same
 * year.
 *
 * `fy` lives in the URL rather than state because the table is
 * server-rendered: `shallow: false` re-runs the RSC, which re-stamps rows for
 * the selected year. `method` deliberately does NOT reach the table — the
 * table's columns always answer Contract Term (product decision 2026-08-05,
 * reversing the 2026-08-04 QA direction); the selector only re-bases the
 * cards and chart.
 *
 * `defaultMethod` is the org-level setting (psk-1877), resolved server-side.
 * It is required rather than defaulted so a new caller cannot silently pin the
 * surface to one basis while the rest of the app follows the setting.
 */
export function SpendOverview({
  currentFiscalYear,
  oldestFiscalYear,
  defaultMethod,
  heading,
}: {
  currentFiscalYear: number;
  oldestFiscalYear: number | null;
  defaultMethod: CostMethod;
  // Page title rendered on one row with the selectors (the budget overview).
  // Absent on surfaces that own their heading (spend-compare), which get the
  // bare right-aligned controls row instead.
  heading?: string;
}) {
  const [method, setMethod] = useState<CostMethod>(defaultMethod);
  const [fyParam, setFyParam] = useQueryState(
    'fy',
    parseAsInteger
      .withDefault(currentFiscalYear)
      .withOptions({ shallow: false, history: 'replace' }),
  );

  const years = fiscalYearOptions(oldestFiscalYear, currentFiscalYear);
  // Clamp exactly like the server component does, so an out-of-range ?fy can
  // never leave the table showing one year and the cards/chart another.
  const fiscalYear = Math.min(
    Math.max(fyParam, years[years.length - 1]),
    currentFiscalYear,
  );
  const isHistorical = fiscalYear < currentFiscalYear;

  const controls = (
    <div className="flex items-center gap-3">
      <FiscalYearSelect
        fiscalYear={fiscalYear}
        years={years}
        onChange={(year) =>
          setFyParam(year === currentFiscalYear ? null : year)
        }
      />
      <CostMethodSelect method={method} onChange={setMethod} />
    </div>
  );

  return (
    <>
      {heading ? (
        <div className="mb-8 mt-6 flex items-end justify-between gap-4">
          <h1 className="font-serif">{heading}</h1>
          {controls}
        </div>
      ) : (
        <div className="mb-2 flex justify-end">{controls}</div>
      )}

      {isHistorical && (
        <p className="mb-2 text-right font-label text-xs text-muted-foreground">
          FY{fiscalYear} is modeled from contract terms — invoice-based actuals
          are not recorded yet.
        </p>
      )}

      <SpendMethodCards
        method={method}
        fiscalYear={fiscalYear}
        currentFiscalYear={currentFiscalYear}
      />

      <Card className="mb-10 bg-card/50 p-5 dark:bg-card">
        <SpendChart
          method={method}
          fiscalYear={fiscalYear}
          currentFiscalYear={currentFiscalYear}
        />
      </Card>
    </>
  );
}
