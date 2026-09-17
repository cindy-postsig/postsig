export interface XirrCashFlow {
  amount: number;
  date: Date;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function xnpv(rate: number, flows: XirrCashFlow[], t0: number): number {
  return flows.reduce((sum, cf) => {
    const years = (cf.date.getTime() - t0) / MS_PER_YEAR;
    return sum + cf.amount / Math.pow(1 + rate, years);
  }, 0);
}

/**
 * Annualized internal rate of return for irregularly-dated cash flows, returned
 * as a decimal (0.268 = 26.8%). Outflows must be negative, inflows positive.
 *
 * Newton-Raphson first; on non-convergence we fall back to bisection over a wide
 * bracket, which is slower but cannot diverge — the dated, multi-sign cash flows
 * of a real portfolio can give Newton a junk local root or send it to infinity.
 * Returns null when IRR is undefined (no sign change, <2 flows, or no root).
 */
export function xirr(flows: XirrCashFlow[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) {
    return null;
  }

  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0].date.getTime();

  // Zero time span: NPV is constant for all rates, so the IRR is undefined.
  if (sorted[sorted.length - 1].date.getTime() === t0) return null;

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const npv = xnpv(rate, sorted, t0);
    const derivative = (xnpv(rate + 1e-6, sorted, t0) - npv) / 1e-6;
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) break;
    const next = rate - npv / derivative;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-7) return next > -1 ? next : null;
    rate = Math.max(-0.999999, next);
  }

  let lo = -0.9999;
  let hi = 1e6;
  let fLo = xnpv(lo, sorted, t0);
  let fHi = xnpv(hi, sorted, t0);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) {
    return null;
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = xnpv(mid, sorted, t0);
    if (Math.abs(fMid) < 1e-7 || (hi - lo) / 2 < 1e-9) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}
