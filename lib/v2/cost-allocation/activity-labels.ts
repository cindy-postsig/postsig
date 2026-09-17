import type {
  AllocationActivityLine,
  AllocationActivityScope,
  AllocationChangedActivityData,
} from '@/constants/types';
import { ACTIVE_USERS_MODE_LABEL } from './editor';

export function formatPercent(percent: number): string {
  return `${Number(percent.toFixed(2))}%`;
}

function lineLabel(line: AllocationActivityLine): string {
  const fallback =
    line.orgUnitId !== null
      ? `Org unit #${line.orgUnitId}`
      : `Employee #${line.orgEmployeeId}`;
  return `${line.targetName ?? fallback} ${formatPercent(line.percent)}`;
}

function scopeLabel(scope: AllocationActivityScope): string {
  if (scope.productId === null) return 'Entire contract';
  return scope.productName ?? `Product #${scope.productId}`;
}

/** "Entire contract — Research 50%, Aleks Smith 50%" */
export function describeAllocationScope(
  scope: AllocationActivityScope,
): string {
  const split =
    scope.mode === 'active_users'
      ? ACTIVE_USERS_MODE_LABEL
      : scope.lines.map(lineLabel).join(', ');
  return `${scopeLabel(scope)} — ${split}`;
}

export function summarizeAllocationChange(
  data: AllocationChangedActivityData,
): { before: string[]; after: string[] } {
  return {
    before: (data.before ?? []).map(describeAllocationScope),
    after: (data.after ?? []).map(describeAllocationScope),
  };
}

export function allocationChangeHeadline(
  data: AllocationChangedActivityData,
): string {
  const hadBefore = (data.before ?? []).length > 0;
  const hasAfter = (data.after ?? []).length > 0;
  if (!hadBefore && hasAfter) return 'Set cost allocation';
  if (hadBefore && !hasAfter) return 'Removed cost allocation';
  return 'Changed cost allocation';
}
