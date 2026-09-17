import logger from '@/utils/pino';
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from './log-sanitization';
import type { Database } from '@/database.types';

// TODO: Move to Redis at some point
const envelopePollTimes = new Map<string, number>();

export interface CachedEnvelopeStatus {
  status: string;
  statusDateTime: string;
  statusChangedDateTime: string;
  data: any;
  cachedAt: number;
}

const envelopeStatusCache = new Map<string, CachedEnvelopeStatus>();

/**
 * Store envelope status in the cache
 *
 * @param envelopeId The DocuSign envelope ID
 * @param statusData The envelope status data to cache
 */
export function cacheEnvelopeStatus(envelopeId: string, statusData: any): void {
  if (!statusData || !envelopeId) return;

  envelopeStatusCache.set(envelopeId, {
    status: statusData.status,
    statusDateTime:
      statusData.statusDateTime ||
      statusData.statusChangedDateTime ||
      new Date().toISOString(),
    statusChangedDateTime:
      statusData.statusChangedDateTime ||
      statusData.statusDateTime ||
      new Date().toISOString(),
    data: statusData,
    cachedAt: Date.now(),
  });
}

/**
 * Get cached envelope status data if available
 *
 * @param envelopeId The DocuSign envelope ID
 * @returns The cached status data or null if not cached
 */
export function getCachedEnvelopeStatus(
  envelopeId: string,
): CachedEnvelopeStatus | null {
  return envelopeStatusCache.get(envelopeId) || null;
}

/**
 * Get the age of cached envelope status in milliseconds
 *
 * @param envelopeId The DocuSign envelope ID
 * @returns Age in milliseconds or null if not cached
 */
export function getCachedEnvelopeStatusAge(envelopeId: string): number | null {
  const cached = envelopeStatusCache.get(envelopeId);
  if (!cached) return null;

  return Date.now() - cached.cachedAt;
}

/**
 * Check if an envelope can be polled based on rate limits
 * DocuSign limits polling to once every 15 minutes per envelope
 * We use 20 minutes (1,200,000 ms) to be safe
 *
 * @param envelopeId The DocuSign envelope ID
 * @returns {boolean} True if the envelope can be polled, false otherwise
 */
export function canPollEnvelope(envelopeId: string): boolean {
  const now = Date.now();
  const lastPollTime = envelopePollTimes.get(envelopeId) || 0;

  // 20 minutes = 1,200,000 milliseconds
  const minPollInterval = 20 * 60 * 1000;

  if (now - lastPollTime < minPollInterval) {
    return false;
  }

  // Update the last poll time
  envelopePollTimes.set(envelopeId, now);
  return true;
}

/**
 * Retrieves when an envelope was last polled
 *
 * @param envelopeId The DocuSign envelope ID
 * @returns {Date | null} Date of the last poll or null if never polled
 */
export function getLastPollTime(envelopeId: string): Date | null {
  const lastPollTime = envelopePollTimes.get(envelopeId);
  return lastPollTime ? new Date(lastPollTime) : null;
}

/**
 * Get time until next allowed poll
 *
 * @param envelopeId The DocuSign envelope ID
 * @returns {number} Milliseconds until next allowed poll, 0 if can poll now
 */
export function getTimeUntilNextPoll(envelopeId: string): number {
  const now = Date.now();
  const lastPollTime = envelopePollTimes.get(envelopeId) || 0;

  // 20 minutes = 1,200,000 milliseconds
  const minPollInterval = 20 * 60 * 1000;
  const timeElapsed = now - lastPollTime;

  if (timeElapsed >= minPollInterval) {
    return 0;
  }

  return minPollInterval - timeElapsed;
}

/**
 * Fetches essential DocuSign user data from Supabase
 * @param supabase Supabase client instance
 * @param userId The user ID
 * @returns Object containing tokens, account ID, base URI, and connection status
 * @throws Error if data fetching fails or required fields are missing
 */
export const fetchSupabaseDocuSignData = async (
  supabase: SupabaseClient<Database>,
  userId: string,
) => {
  const { data, error } = await supabase
    .from('users')
    .select(
      'docusign_connected, docusign_access_token, docusign_account_id, docusign_base_uri',
    )
    .eq('id', userId)
    .single();

  if (error) {
    logError(logger, error, { userId });
    throw new Error('Failed to fetch user data for DocuSign operation.');
  }
  if (!data) {
    logError(logger, new Error('User data not found.'), { userId });
    throw new Error('User data not found.');
  }
  // Check for required fields after confirming data is not null
  if (
    !data.docusign_connected ||
    !data.docusign_access_token ||
    !data.docusign_account_id ||
    !data.docusign_base_uri
  ) {
    logger.warn({ userId }, 'User DocuSign data incomplete');
    throw new Error('User DocuSign data incomplete.');
  }

  return {
    accessToken: data.docusign_access_token,
    accountId: data.docusign_account_id,
    baseUri: data.docusign_base_uri,
    isConnected: data.docusign_connected,
  };
};

/**
 * Refreshes a DocuSign access token using the stored refresh token and updates DB
 * @param supabase Supabase client instance
 * @param userId The user ID whose token should be refreshed
 * @returns A promise that resolves void (or throws error)
 */
export async function refreshDocuSignTokenAndUpdateDb(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  try {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('docusign_refresh_token')
      .eq('id', userId)
      .single();

    if (userError || !userData?.docusign_refresh_token) {
      logger.error(
        { userId, userError, hasToken: !!userData?.docusign_refresh_token },
        'Error fetching user DocuSign refresh token or token missing',
      );
      throw new Error('No refresh token available or DB error');
    }

    const clientId = process.env.DOCUSIGN_CLIENT_ID;
    const clientSecret = process.env.DOCUSIGN_CLIENT_SECRET;
    const tokenUrl = `${process.env.DOCUSIGN_OAUTH_BASE_URL}/oauth/token`;
    const userInfoUrl = `${process.env.DOCUSIGN_USER_INFO_URL}/oauth/userinfo`;

    if (!clientId || !clientSecret || !tokenUrl || !userInfoUrl) {
      logger.error('DocuSign integration environment variables missing');
      throw new Error('DocuSign integration is not configured');
    }

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: userData.docusign_refresh_token,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({})); // Avoid crash if body isn't JSON
      logger.error(
        {
          userId,
          status: tokenResponse.status,
          errorData,
        },
        'Error refreshing DocuSign token',
      );
      if (tokenResponse.status === 400 || tokenResponse.status === 401) {
        // Optionally disconnect user or clear tokens here?
        throw new Error(
          'Failed to refresh token: Invalid grant or credentials',
        );
      }
      throw new Error('Failed to refresh token');
    }

    const tokenData = await tokenResponse.json();

    let accountId: string | null = null;
    let baseUri: string | null = null;
    try {
      const userInfoResponse = await fetch(userInfoUrl, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        const defaultAccount =
          userInfo.accounts.find((acc: any) => acc.is_default === true) ||
          userInfo.accounts[0];
        if (defaultAccount) {
          accountId = defaultAccount.account_id;
          baseUri = defaultAccount.base_uri.replace(/\/restapi$/, '');
        } else {
          logger.warn(
            {
              userId,
            },
            'No default DocuSign account found during token refresh',
          );
        }
      } else {
        logger.error(
          {
            userId,
            status: userInfoResponse.status,
          },
          'Failed to get DocuSign user info after token refresh',
        );
      }
    } catch (userInfoError) {
      logger.error(
        {
          userId,
          error: userInfoError,
        },
        'Error fetching DocuSign user info after token refresh',
      );
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        docusign_access_token: tokenData.access_token,
        docusign_refresh_token: tokenData.refresh_token,
        docusign_account_id: accountId,
        docusign_base_uri: baseUri,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      logger.error(
        {
          userId,
          updateError,
        },
        'Error updating user with new tokens/info',
      );
      throw new Error('Failed to update tokens/info in database');
    }

    logger.info(
      {
        userId,
      },
      'Successfully refreshed DocuSign token and updated user info',
    );
  } catch (error) {
    logger.error(
      {
        userId,
        error,
      },
      'Error in refreshDocuSignTokenAndUpdateDb',
    );
    // Re-throw the error to be caught by the caller (e.g., callDocuSignApi)
    throw error;
  }
}

/**
 * Wraps a DocuSign API call with token refresh logic.
 * @param supabase Supabase client instance
 * @param userId The user ID
 * @param action The function performing the actual DocuSign API call.
 *               It receives { accessToken, accountId, baseUri }.
 * @returns The result of the action function.
 * @throws Error if initial data fetch, refresh, or the action itself fails definitively.
 */
export async function callDocuSignApi<T>(
  supabase: SupabaseClient<Database>,
  userId: string,
  action: (params: {
    accessToken: string;
    accountId: string;
    baseUri: string;
  }) => Promise<T>,
): Promise<T> {
  let userData = await fetchSupabaseDocuSignData(supabase, userId);

  try {
    // First attempt
    return await action({
      accessToken: userData.accessToken,
      accountId: userData.accountId,
      baseUri: userData.baseUri,
    });
  } catch (error: any) {
    if (error.message === 'token_expired') {
      logger.info({ userId }, 'DocuSign token expired, attempting refresh...');
      await refreshDocuSignTokenAndUpdateDb(supabase, userId);

      // Re-fetch user data after successful refresh
      userData = await fetchSupabaseDocuSignData(supabase, userId);

      // Second attempt
      logger.info({ userId }, 'Retrying DocuSign API call after refresh');
      return await action({
        accessToken: userData.accessToken,
        accountId: userData.accountId,
        baseUri: userData.baseUri,
      });
    } else {
      // Non-token related error, re-throw
      throw error;
    }
  }
}

// --- Specific DocuSign API Action Helpers ---

// Corresponds to list-documents route
export const fetchCompletedEnvelopes = async (params: {
  accessToken: string;
  accountId: string;
  baseUri: string;
  includeEnvelopeStatus: boolean; // Kept for potential logging/logic, though status isn't fetched here
}) => {
  const from_date = new Date();
  from_date.setMonth(from_date.getMonth() - 6);
  const queryParams = new URLSearchParams({
    from_date: from_date.toISOString(),
    status: 'completed',
  }).toString();
  const envelopesUrl = `${params.baseUri}/restapi/v2.1/accounts/${params.accountId}/envelopes?${queryParams}`;

  const response = await fetch(envelopesUrl, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('token_expired');
    throw new Error(
      `Failed to fetch completed envelopes: ${response.statusText} (Status: ${response.status})`,
    );
  }
  const data = await response.json();
  return data.envelopes || [];
};

// Corresponds to list-documents route (fetching documents for ONE envelope)
export const fetchEnvelopeDocuments = async (params: {
  accessToken: string;
  accountId: string;
  baseUri: string;
  envelopeId: string;
}) => {
  const documentsUrl = `${params.baseUri}/restapi/v2.1/accounts/${params.accountId}/envelopes/${params.envelopeId}/documents`;
  const response = await fetch(documentsUrl, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('token_expired');
    throw new Error(
      `Failed to fetch envelope documents: ${response.statusText} (Status: ${response.status})`,
    );
  }
  const data = await response.json();
  return data.envelopeDocuments || [];
};

// Corresponds to list-documents route (fetching status for ONE envelope)
// Note: This one includes the canPollEnvelope logic, so maybe keep it separate or integrate polling into the wrapper?
// Keeping separate for now, might need its own wrapper or different handling.
export const fetchEnvelopeStatus = async (params: {
  accessToken: string;
  accountId: string;
  baseUri: string;
  envelopeId: string;
}) => {
  const envelopeStatusUrl = `${params.baseUri}/restapi/v2.1/accounts/${params.accountId}/envelopes/${params.envelopeId}`;
  const response = await fetch(envelopeStatusUrl, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('token_expired');
    // Log failure but maybe don't throw for status check?
    // Throwing for now to align with wrapper logic.
    logger.warn(
      {
        envelopeId: params.envelopeId,
        statusText: response.statusText,
      },
      'Failed to fetch envelope status',
    );
    throw new Error(
      `Failed to fetch envelope status: ${response.statusText} (Status: ${response.status})`,
    );
  }
  return response.json();
};

// Corresponds to download-document route
export const downloadDocument = async (params: {
  accessToken: string;
  accountId: string;
  baseUri: string;
  envelopeId: string;
  documentId: string;
}) => {
  const documentUrl = `${params.baseUri}/restapi/v2.1/accounts/${params.accountId}/envelopes/${params.envelopeId}/documents/${params.documentId}`;
  const response = await fetch(documentUrl, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('token_expired');
    throw new Error(
      `Failed to download document: ${response.statusText} (Status: ${response.status})`,
    );
  }
  return response.blob();
};

// Corresponds to download-document route (metadata part)
// This one has special non-blocking error handling, maybe keep it separate from the main wrapper flow?
// Keeping it separate for now.
export const fetchEnvelopeMetadata = async (params: {
  accessToken: string;
  accountId: string;
  baseUri: string;
  envelopeId: string;
  userId?: string; // Optional for logging context
}) => {
  const metadataUrl = `${params.baseUri}/restapi/v2.1/accounts/${params.accountId}/envelopes/${params.envelopeId}`;
  try {
    const response = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('token_expired'); // Still need to signal this for potential retry
      logger.warn(
        {
          userId: params.userId,
          envelopeId: params.envelopeId,
          status: response.status,
          statusText: response.statusText,
        },
        'Failed to fetch envelope metadata',
      );
      return null; // Return null on non-token error
    }
    return response.json();
  } catch (error) {
    logger.error(
      {
        userId: params.userId,
        envelopeId: params.envelopeId,
        error,
      },
      'Error fetching envelope metadata',
    );
    if (error instanceof Error && error.message !== 'token_expired') {
      return null; // Return null on fetch errors (like network)
    }
    throw error; // Re-throw token_expired or other unexpected errors
  }
};

// Corresponds to send route
export const sendEnvelope = async (params: {
  accessToken: string;
  accountId: string;
  baseUri: string;
  envelopeDefinition: any; // Consider defining an interface for this
}) => {
  const envelopeUrl = `${params.baseUri}/restapi/v2.1/accounts/${params.accountId}/envelopes`;
  const response = await fetch(envelopeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify(params.envelopeDefinition),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('token_expired');
    let errorBody = '';
    try {
      errorBody = await response.json();
    } catch {
      /* ignore parsing error */
    }
    throw new Error(
      `Failed to send envelope: ${response.statusText} (Status: ${response.status}) - ${JSON.stringify(errorBody)}`,
    );
  }
  return response.json();
};

/**
 * Get the status of a DocuSign envelope with rate limiting
 * Returns cached data if available when rate limited
 *
 * @param supabase Supabase client instance
 * @param userId The user ID
 * @param envelopeId The DocuSign envelope ID
 * @param force Whether to force the poll even if rate limited (use with caution)
 * @returns {Promise<Object>} The envelope status or error
 */
export async function getEnvelopeStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  envelopeId: string,
  force: boolean = false,
): Promise<{
  data: any | null;
  error: Error | null;
  nextPollIn: number | null;
  cached?: boolean;
  cachedAt?: number;
}> {
  try {
    if (!force && !canPollEnvelope(envelopeId)) {
      const timeUntilNextPoll = getTimeUntilNextPoll(envelopeId);
      const cachedStatus = getCachedEnvelopeStatus(envelopeId);
      if (cachedStatus) {
        logger.info(
          { envelopeId, age: Date.now() - cachedStatus.cachedAt },
          'Returning cached status for envelope',
        );
        return {
          data: cachedStatus.data,
          error: null,
          nextPollIn: timeUntilNextPoll,
          cached: true,
          cachedAt: cachedStatus.cachedAt,
        };
      }
      return {
        data: null,
        error: new Error('Rate limited: Too soon to poll envelope status'),
        nextPollIn: timeUntilNextPoll,
      };
    }

    // Use the wrapper to handle fetch and retry for the status call
    const envelopeData = await callDocuSignApi(supabase, userId, (params) =>
      fetchEnvelopeStatus({ ...params, envelopeId }),
    );

    cacheEnvelopeStatus(envelopeId, envelopeData);
    return { data: envelopeData, error: null, nextPollIn: 20 * 60 * 1000 };
  } catch (error: any) {
    // Handle errors from wrapper (fetch/refresh/action) or polling logic
    logger.error(
      {
        userId,
        envelopeId,
        error: error.message,
      },
      'Error in getEnvelopeStatus',
    );

    const cachedStatus = getCachedEnvelopeStatus(envelopeId);
    if (cachedStatus) {
      logger.info(
        { envelopeId },
        'Error occurred fetching fresh status, returning cached status for envelope',
      );
      return {
        data: cachedStatus.data,
        // Include the error that prevented fetching fresh data
        error: new Error(`Error fetching fresh status: ${error.message}`),
        nextPollIn: getTimeUntilNextPoll(envelopeId),
        cached: true,
        cachedAt: cachedStatus.cachedAt,
      };
    }

    // No cached data and an error occurred
    return {
      data: null,
      error: new Error(`Failed to get envelope status: ${error.message}`),
      nextPollIn: null,
    };
  }
}
