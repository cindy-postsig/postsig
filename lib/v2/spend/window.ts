import { getFiscalYearInfo } from '@/app/lib/budget/dateUtils';
import type { SpendQuery } from './types';
import { fiscalYearOf, type FiscalConfig } from './buckets';
import { parseUTCDate } from './dates';

export interface ResolvedWindow {
  // Half-open [start, end) in UTC.
  start: Date;
  end: Date;
  // Fiscal year the window sits in (its start year for a whole-FY window; the
  // start date's FY for an arbitrary range).
  fyNum: number;
}

function fiscalYearWindow(
  fyNum: number,
  fiscalConfig: FiscalConfig,
): ResolvedWindow {
  return {
    start: new Date(Date.UTC(fyNum, fiscalConfig.startMonth - 1, 1)),
    end: new Date(Date.UTC(fyNum + 1, fiscalConfig.startMonth - 1, 1)),
    fyNum,
  };
}

// Resolves a SpendQuery window to half-open UTC bounds. 'currentFY'/'nextFY'
// are resolved THROUGH asOf via getFiscalYearInfo (whose FY-numbering we reuse);
// the clock is never read here. {fiscalYear:N} and {from,to} are literal.
export function resolveWindow(
  window: SpendQuery['window'],
  asOf: Date,
  fiscalConfig: FiscalConfig,
): ResolvedWindow {
  if (window === 'currentFY' || window === 'nextFY') {
    const { currentFiscalYear } = getFiscalYearInfo(
      fiscalConfig.startMonth,
      asOf,
    );
    const fyNum =
      window === 'nextFY' ? currentFiscalYear + 1 : currentFiscalYear;
    return fiscalYearWindow(fyNum, fiscalConfig);
  }

  if ('fiscalYear' in window) {
    return fiscalYearWindow(window.fiscalYear, fiscalConfig);
  }

  const start = parseUTCDate(window.from);
  return {
    start,
    end: parseUTCDate(window.to),
    fyNum: fiscalYearOf(start, fiscalConfig),
  };
}
