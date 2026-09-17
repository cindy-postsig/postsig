/**
 * Server-side read layer for the investor company activity feed.
 *
 * Merges two sources into a unified, sorted feed:
 * 1. Override history from the droid API (edits + reverts)
 * 2. Internal investor activities from the Supabase `activities` table
 */

import { cache } from 'react';

import { InvestorActivityType } from '@/constants/types';
import {
  getOverrideHistoryViaDroid,
  type OverrideHistoryRow,
} from '@/app/lib/investor/droid-client';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { getMcpContext } from '@/app/lib/mcp/context';
import logger from '@/utils/pino';

import { normalizeToUtc } from './activity-time';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvestorActivity {
  id: string;
  activity_type: string;
  activity_data: Record<string, unknown>;
  created_at: string;
  user_id: string;
  user_name?: string;
}

export type ActivityFeedItem =
  | { kind: 'override'; data: OverrideHistoryRow }
  | { kind: 'activity'; data: InvestorActivity };

// ---------------------------------------------------------------------------
// Supabase investor activities
// ---------------------------------------------------------------------------

/** Activity types relevant to the company activity feed. */
const COMPANY_ACTIVITY_TYPES: string[] = [
  InvestorActivityType.DOCUMENT_UPLOADED,
  InvestorActivityType.DOCUMENT_PROCESSED,
  InvestorActivityType.DOCUMENT_CREATED,
  InvestorActivityType.EXTRACTION_COMPLETED,
  InvestorActivityType.EXTRACTION_FAILED,
  InvestorActivityType.COMPANY_CREATED,
  InvestorActivityType.ENTITY_LINKED,
];

/**
 * Activities logged with `entity_id = null` because their subject ids (board
 * seats, financing-round sub-records) are not `module_entities` ids, which the
 * FK requires. They carry the owning company id in `activity_data.companyId`
 * instead, and are scoped by it.
 */
const COMPANY_ID_SCOPED_ACTIVITY_TYPES: string[] = [
  InvestorActivityType.BOARD_SEAT_ADDED,
  InvestorActivityType.BOARD_SEAT_REMOVED,
  InvestorActivityType.INVESTOR_STATUS_RECORD_CREATED,
];

const ACTIVITY_SELECT = `
      id,
      activity_type,
      activity_data,
      created_at,
      user_id,
      users:user_id (
        name,
        email
      )
    `;

interface RawActivityRow {
  id: number | string;
  activity_type: string | null;
  activity_data: unknown;
  created_at: string | null;
  user_id: string | null;
  users:
    | { name?: string; email?: string }
    | { name?: string; email?: string }[]
    | null;
}

function mapActivityRow(item: RawActivityRow): InvestorActivity {
  const rawUsers = item.users;
  const users = (Array.isArray(rawUsers) ? rawUsers[0] : rawUsers) as {
    name?: string;
    email?: string;
  } | null;
  return {
    id: String(item.id),
    activity_type: item.activity_type ?? '',
    activity_data: (item.activity_data as Record<string, unknown>) || {},
    created_at: normalizeToUtc(item.created_at || ''),
    user_id: item.user_id || '',
    user_name: users?.name || users?.email || undefined,
  };
}

async function loadInvestorActivities(
  entityId: number,
): Promise<InvestorActivity[]> {
  const supabase = getMcpContext()
    ? createServiceClient()
    : await createServerClient();

  const [entityScoped, companyScoped] = await Promise.all([
    supabase
      .from('activities')
      .select(ACTIVITY_SELECT)
      .eq('module_type', 'investor')
      .eq('entity_id', entityId)
      .in('activity_type', COMPANY_ACTIVITY_TYPES)
      .order('created_at', { ascending: false }),
    supabase
      .from('activities')
      .select(ACTIVITY_SELECT)
      .eq('module_type', 'investor')
      .in('activity_type', COMPANY_ID_SCOPED_ACTIVITY_TYPES)
      .eq('activity_data->>companyId', String(entityId))
      .order('created_at', { ascending: false }),
  ]);

  if (entityScoped.error) {
    logger.error(
      { error: entityScoped.error, entityId },
      'Error loading investor activities',
    );
  }
  if (companyScoped.error) {
    logger.error(
      { error: companyScoped.error, entityId },
      'Error loading company-scoped activities',
    );
  }

  return [...(entityScoped.data ?? []), ...(companyScoped.data ?? [])].map(
    (item) => mapActivityRow(item as RawActivityRow),
  );
}

// ---------------------------------------------------------------------------
// Unified merge
// ---------------------------------------------------------------------------

function getItemDate(item: ActivityFeedItem): number {
  const parsed = Date.parse(item.data.created_at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Fetch and merge the full company activity feed (override history + internal
 * activities), sorted by date descending.
 *
 * @param entityIds - Set of entity IDs (transaction IDs + snapshot IDs) belonging
 *   to this company. Override rows are filtered to only those matching these IDs.
 * @param companyEntityId - The company's entity ID for querying internal activities.
 *
 * Cached per request for deduplication.
 */
export const getCompanyActivityFeed = cache(
  async (
    entityIds: number[],
    companyEntityId: number,
  ): Promise<ActivityFeedItem[]> => {
    const entityIdSet = new Set(entityIds);

    const [allOverrides, activities] = await Promise.all([
      getOverrideHistoryViaDroid({ limit: 100 }).catch((err) => {
        logger.error(
          { error: err },
          'Failed to fetch override history; showing activities only',
        );
        return [] as OverrideHistoryRow[];
      }),
      loadInvestorActivities(companyEntityId),
    ]);

    // Filter overrides to only those belonging to this company's entities
    const overrides = (allOverrides ?? []).filter((o) =>
      entityIdSet.has(o.entity_id),
    );

    // Build unified feed
    const feed: ActivityFeedItem[] = [
      ...overrides.map(
        (o): ActivityFeedItem => ({ kind: 'override', data: o }),
      ),
      ...activities.map(
        (a): ActivityFeedItem => ({ kind: 'activity', data: a }),
      ),
    ];

    // Sort by date descending
    feed.sort((a, b) => getItemDate(b) - getItemDate(a));

    return feed;
  },
);
