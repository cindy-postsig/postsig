import type { SidAccount, SidHrMatch, SidSubscription } from './report';
import {
  isSidRenewingWithin,
  matchesSearch,
  sidSubscriptionInactiveReasons,
} from './transforms';

export interface SubscriptionFilters {
  search: string;
  custNum: string;
  entityName: string;
  product: string;
  /**
   * The roster-based reading of a seat, the one the Assignments page counts —
   * not Bloomberg's own 90-day flag, which is only one of its reasons.
   */
  status: 'All' | 'Active' | 'Inactive';
  /** The renewals report's window, carried in by its link. */
  renewingWithinDays: number | null;
}

export const DEFAULT_SUBSCRIPTION_FILTERS: SubscriptionFilters = {
  search: '',
  custNum: 'All',
  entityName: 'All',
  product: 'All',
  status: 'All',
  renewingWithinDays: null,
};

export interface SubscriptionFilterContext {
  accountsByCustNum: Map<number, SidAccount>;
  hrMatches: Record<string, SidHrMatch>;
  today: Date;
}

export function filterSubscriptions(
  subscriptions: readonly SidSubscription[],
  filters: SubscriptionFilters,
  { accountsByCustNum, hrMatches, today }: SubscriptionFilterContext,
): SidSubscription[] {
  return subscriptions.filter((sub) => {
    if (
      !matchesSearch(filters.search, [sub.sid, sub.serialNumber, sub.lastUser])
    ) {
      return false;
    }
    if (filters.custNum !== 'All' && String(sub.custNum) !== filters.custNum) {
      return false;
    }
    if (filters.entityName !== 'All') {
      const entityName = accountsByCustNum.get(sub.custNum)?.name ?? '';
      if (entityName !== filters.entityName) return false;
    }
    if (filters.product !== 'All' && sub.gpttDescription !== filters.product) {
      return false;
    }
    if (filters.status !== 'All') {
      const inactive =
        sidSubscriptionInactiveReasons(sub, hrMatches).length > 0;
      if (inactive !== (filters.status === 'Inactive')) return false;
    }
    if (
      filters.renewingWithinDays !== null &&
      !isSidRenewingWithin(sub.renewalDate, filters.renewingWithinDays, today)
    ) {
      return false;
    }
    return true;
  });
}
