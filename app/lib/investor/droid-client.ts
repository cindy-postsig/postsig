import 'server-only';

import axios from 'axios';

import { getSession } from '@/data/users';
import type { Json } from '@/database.types';

/**
 * Server-side client for the droid value-overrides API. Writes (create / revert)
 * are mediated by droid so authz, the atomic last-write-wins RPC, and activity
 * logging all live in one backend. The caller's Supabase access token is
 * forwarded as a Bearer token; droid re-derives org + role from it.
 */

export interface CreateOverridePayload {
  entityType: string;
  entityId: number;
  fieldKey: string;
  originalValue: Json;
  overrideValue: Json;
  reason: string;
}

function droidBaseUrl(): string {
  const baseUrl = process.env.DROID_APP_API_URL;
  if (!baseUrl) {
    throw new Error('DROID_APP_API_URL is not configured');
  }
  return baseUrl;
}

async function authHeader(): Promise<{ Authorization: string }> {
  const { session } = await getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error('No active session');
  }
  return { Authorization: `Bearer ${accessToken}` };
}

function apiErrorMessage(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  // droid returns { error: string } on 4xx; surface it when present.
  const data = error.response?.data;
  return typeof data?.error === 'string' ? data.error : null;
}

function failure(error: unknown, action: string): never {
  const status = axios.isAxiosError(error)
    ? (error.response?.status ?? 500)
    : 500;
  const apiMessage = apiErrorMessage(error);
  const detail = apiMessage ? `: ${apiMessage}` : '';
  throw new Error(`Failed to ${action} override${detail} (status=${status})`);
}

export async function createOverrideViaDroid(
  payload: CreateOverridePayload,
): Promise<void> {
  // Resolve config + auth before the try so their precondition errors surface
  // verbatim instead of being rewrapped as a generic request failure.
  const baseUrl = droidBaseUrl();
  const headers = await authHeader();
  try {
    await axios.post(`${baseUrl}/v1/value-overrides`, payload, {
      headers,
      timeout: 30_000,
    });
  } catch (error) {
    failure(error, 'save');
  }
}

export async function revertOverrideViaDroid(
  overrideId: string,
): Promise<void> {
  const baseUrl = droidBaseUrl();
  const headers = await authHeader();
  try {
    await axios.post(
      `${baseUrl}/v1/value-overrides/${encodeURIComponent(overrideId)}/revert`,
      {},
      { headers, timeout: 30_000 },
    );
  } catch (error) {
    failure(error, 'revert');
  }
}

/**
 * Nested Investor Status sub-records for the financing-rounds PATCH. Only the
 * flags the editable Investor Status UI manages are included; droid upserts the
 * row (matched on financing_round_id) and leaves other columns untouched.
 */
export interface FinancingRoundTermsInput {
  effectiveDate: string;
  proRataRightsMajor?: boolean;
  proRataRightsAll?: boolean;
}

export interface FinancingRoundInformationRightsInput {
  effectiveDate: string;
  isMajorInvestor: boolean;
  infoRightsForMajor?: boolean;
  infoRightsForAll?: boolean;
}

export interface UpdateFinancingRoundPayload {
  terms?: FinancingRoundTermsInput;
  informationRights?: FinancingRoundInformationRightsInput;
}

/**
 * Update a financing round, upserting its nested Investor Status sub-records.
 * Used to create inv_round_terms / inv_information_rights rows when a company
 * has none yet (the create-on-edit path). `id` is the numeric
 * inv_financing_round.id — the endpoint rejects public_id. The body carries
 * only { terms?, informationRights? }; the round is identified by the URL id
 * and left untouched.
 */
export async function updateFinancingRoundViaDroid(
  id: number,
  payload: UpdateFinancingRoundPayload,
): Promise<void> {
  const baseUrl = droidBaseUrl();
  const headers = await authHeader();
  try {
    await axios.patch(`${baseUrl}/v1/financing-rounds/${id}`, payload, {
      headers,
      timeout: 30_000,
    });
  } catch (error) {
    failure(error, 'update financing round');
  }
}

export interface OverrideHistoryRow {
  id: string;
  organization_id: string;
  organization_name: string;
  entity_type: string;
  entity_id: number;
  field_key: string;
  original_value: unknown;
  override_value: unknown;
  reason: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  reverted_at: string | null;
  reverted_by: string | null;
}

/**
 * Fetch override history from the droid API. The bearer token auto-scopes
 * results to the caller's organization. Use `limit` + `offset` for pagination.
 */
export async function getOverrideHistoryViaDroid(opts?: {
  entityType?: string;
  entityId?: number;
  limit?: number;
  offset?: number;
}): Promise<OverrideHistoryRow[]> {
  const baseUrl = droidBaseUrl();
  const headers = await authHeader();
  try {
    const response = await axios.get<{
      rows: OverrideHistoryRow[];
      total: number;
    }>(`${baseUrl}/v1/value-overrides`, {
      headers,
      timeout: 30_000,
      params: {
        ...(opts?.entityType != null && { entityType: opts.entityType }),
        ...(opts?.entityId != null && { entityId: opts.entityId }),
        limit: opts?.limit ?? 100,
        ...(opts?.offset != null && { offset: opts.offset }),
      },
    });
    return response.data.rows ?? [];
  } catch (error) {
    failure(error, 'fetch');
  }
}
