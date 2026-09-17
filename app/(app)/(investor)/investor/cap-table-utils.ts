import _ from 'lodash';

import type { CapTableSnapshot } from '@/app/(app)/(investor)/investor/types';
import { isSyntheticStageCode } from '@/lib/v2/inv/stage-utils';

export interface CapTableRow {
  id: string;
  isCategory: boolean;
  name: string;
  units: number;
  fdPercent: number;
  myUnits?: number;
  myFdPercent?: number;
  subRows?: CapTableRow[];
}

export function percentOfTotal(
  units: number,
  fullyDilutedTotal: number,
): number {
  if (fullyDilutedTotal <= 0) return 0;
  return (units / fullyDilutedTotal) * 100;
}

// ourPreferredPct is stored inconsistently in the DB: sometimes a fraction
// (0.5), sometimes a percentage (50). Normalize to a fraction for unit math.
export function normalizeOurPreferredPct(
  pct: number | null | undefined,
): number | undefined {
  if (pct == null) return undefined;
  return pct > 1 ? pct / 100 : pct;
}

/**
 * Snapshots at or before `asOfDate`, ascending, truncated at the restatement
 * boundary (psk-1854).
 *
 * A synthetic-stage snapshot (reclassification, reverse/forward split)
 * restates the capital structure: it is authoritative for which classes exist
 * and what they total, so classes it does not list have been restated away and
 * must stop rendering. Accumulating from the latest such snapshot at or before
 * the selected date drops the pre-event snapshots that would otherwise
 * resurrect renamed classes or carry pre-split unit scale.
 *
 * The boundary is relative to the selected date, so selecting a pre-event date
 * still shows the pre-event structure as history. With no synthetic snapshot
 * in range this is the plain "up to date" window — behavior is unchanged.
 */
export function snapshotsFromRestatementBoundary(
  snapshots: CapTableSnapshot[],
  asOfDate: string,
): CapTableSnapshot[] {
  const upToDate = snapshots
    .filter((s) => s.asOfDate <= asOfDate)
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate));

  let boundaryIndex = -1;
  for (let i = upToDate.length - 1; i >= 0; i--) {
    if (isSyntheticStageCode(upToDate[i].stageCode)) {
      boundaryIndex = i;
      break;
    }
  }

  return boundaryIndex === -1 ? upToDate : upToDate.slice(boundaryIndex);
}

/** Keep only the latest snapshot per stage label, preserving insertion order. */
function deduplicateByStage(snapshots: CapTableSnapshot[]): CapTableSnapshot[] {
  const result: CapTableSnapshot[] = [];
  const indexByLabel = new Map<string, number>();
  for (const snap of snapshots) {
    const label = snap.stageName || snap.stageCode;
    if (!label) continue;
    const existing = indexByLabel.get(label);
    if (existing == null) {
      indexByLabel.set(label, result.length);
      result.push(snap);
    } else {
      result[existing] = snap;
    }
  }
  return result;
}

/**
 * Derive per-stage preferred sub-rows from snapshot deltas when cap_table_detail
 * lacks preferred securities. Each snapshot represents a stage; its preferred
 * units are the delta in preferredOutstanding from the prior snapshot.
 */
export function buildPreferredStageRows(
  snapshotsUpToDate: CapTableSnapshot[],
  fullyDilutedTotal: number,
): CapTableRow[] {
  const stageSnapshots = deduplicateByStage(snapshotsUpToDate);
  const rows: CapTableRow[] = [];
  let prevPreferredOutstanding = 0;
  let prevPreferredAuthorized = 0;

  for (const snap of stageSnapshots) {
    const label = snap.stageName || snap.stageCode;
    if (!label) continue;
    const totalOutstandingAtSnap = snap.preferredOutstanding ?? 0;
    const totalAuthorizedAtSnap = snap.preferredAuthorized;
    const stageUnits =
      totalAuthorizedAtSnap != null
        ? Math.max(totalAuthorizedAtSnap - prevPreferredAuthorized, 0)
        : Math.max(totalOutstandingAtSnap - prevPreferredOutstanding, 0);
    prevPreferredOutstanding = totalOutstandingAtSnap;
    if (totalAuthorizedAtSnap != null) {
      prevPreferredAuthorized = totalAuthorizedAtSnap;
    }

    if (stageUnits === 0) continue;

    const stageFdPercent = percentOfTotal(stageUnits, fullyDilutedTotal);

    const preferredPct = normalizeOurPreferredPct(snap.ourPreferredPct);
    const myUnits =
      preferredPct != null ? Math.round(stageUnits * preferredPct) : undefined;
    const myFdPercent = !_.isNil(myUnits)
      ? percentOfTotal(myUnits, fullyDilutedTotal)
      : undefined;

    rows.push({
      id: `preferred-${snap.stageCode || label}`,
      isCategory: false,
      name: label,
      units: stageUnits,
      fdPercent: stageFdPercent,
      myUnits,
      myFdPercent,
    });
  }

  return rows.reverse();
}
