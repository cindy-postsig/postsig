'use server';

import { cache } from 'react';
import { createClient } from '@/utils/supabase/server';
import logger from '@/utils/pino';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { unstable_noStore as noStore } from 'next/cache';
import { PostgrestError } from '@supabase/supabase-js';
import { getHash } from '@/app/lib/utils';
import { Resend } from 'resend';
import { ShareEmailTemplate } from '@/emails/ShareEmail';
import { contractStatuses } from '@/app/lib/constants';
import {
  fetchContractsByUserRoles,
  fetchContractsPagesByUserRoles,
  fetchContractsByIdByUserRoles,
  fetchContractDocumentsByIdByUserRoles,
  fetchContractsByDateRangeByUserRoles,
  fetchContractMetadata,
  fetchRenewingContractsByUserRoles,
  fetchCompleteAmendmentChainByUserRoles,
  fetchContractsByUserRolesForLineageAI,
} from '@/data/superuser/contracts';
import { getUserMetadata } from '@/data/users';
import {
  FetchContractsParams,
  FetchContractsByIdParams,
  FetchContractDocumentsByIdParams,
  FetchContractsPagesParams,
  FetchContractsByDateRangeParams,
  FetchRenewingContractsParams,
  FetchContractsBaseOptions,
} from '@/constants/types';
import { CommentEmailTemplate } from '@/emails/CommentEmail';
import {
  DatabaseError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  SystemError,
} from '@/lib/errors';
import { defineAbilitiesFor } from '@postsig/toolkit';
import { isValidClientRole } from '@/lib/auth/roles';
import { convertAllProductsToUSD } from '@/lib/v2';
import { buildBaseCurrencyRates } from '@/lib/v2/core/baseRates';
import { getContractStartDate } from '@/lib/v2/products/transforms';
import { loadContractActivities } from '@/lib/v2/contracts/activities';
import { getCacheService } from '@/app/lib/redis/cache-service';
import { filterContracts, ContractFilterOptions } from './filtering';
import { processContractHierarchies } from '@/lib/contracts/supersededProducts';
import {
  resolveVisibleContractIds,
  type VisibleContractIds,
} from '@/data/utils';

/**
 * The base contract set is cached once per org, so each request narrows it to
 * what the caller may see. `'all'` is the reviewer/extractor view.
 */
function filterToVisibleContracts<T extends { id?: number }>(
  contracts: T[],
  visibleIds: VisibleContractIds,
): T[] {
  if (visibleIds === 'all') return contracts;
  return contracts.filter(
    (contract) => contract?.id !== undefined && visibleIds.has(contract.id),
  );
}

export async function updateContract(contractId: number, data: any) {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }

  if (!isValidClientRole(userMetadata.userRole)) {
    logger.warn(
      {
        userId: userMetadata.userId,
        userRole: userMetadata.userRole,
        contractId,
      },
      'Invalid user role for contract update',
    );
    throw new AuthorizationError('Invalid user role');
  }

  const ability = defineAbilitiesFor({
    id: userMetadata.userId,
    roleId: userMetadata.userRole,
    organizationId: userMetadata.organizationId,
  });

  if (!ability.can('update', 'Contract')) {
    logger.warn(
      {
        userId: userMetadata.userId,
        userRole: userMetadata.userRole,
        contractId,
      },
      'User lacks update permission for contracts',
    );
    throw new AuthorizationError('Unauthorized: Cannot update contract');
  }

  const supabase = createServiceClient();
  const { data: updateData, error } = await supabase
    .from('contracts')
    // @ts-ignore - Supabase type inference issue with update
    .update(data)
    .eq('id', contractId)
    .select();
  if (error) {
    logger.error(error, 'Supabase Error in contract update');
    throw new DatabaseError(
      'Failed to update contract',
      error as unknown as Error,
    );
  }

  const cacheService = await getCacheService();

  await cacheService.invalidateOrganizationData(userMetadata);

  logger.info(
    {
      contractId,
      organizationId: userMetadata.organizationId,
      updatedFields: Object.keys(data),
    },
    'Invalidated contract cache after update',
  );

  return { data: updateData, error };
}

import {
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from '@/constants/invoiceStatus';

const VALID_INVOICE_STATUSES = Object.keys(
  INVOICE_STATUS_LABELS,
) as InvoiceStatus[];

export async function updateInvoiceStatus(
  contractId: number,
  invoiceStatus: InvoiceStatus,
  decisionReason?: string,
): Promise<{ oldStatus: InvoiceStatus | null }> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }

  if (!isValidClientRole(userMetadata.userRole)) {
    throw new AuthorizationError('Invalid user role');
  }

  const ability = defineAbilitiesFor({
    id: userMetadata.userId,
    roleId: userMetadata.userRole,
    organizationId: userMetadata.organizationId,
  });

  if (!ability.can('update', 'Contract')) {
    throw new AuthorizationError('Unauthorized: Cannot update contract');
  }

  if (
    !VALID_INVOICE_STATUSES.includes(
      invoiceStatus as (typeof VALID_INVOICE_STATUSES)[number],
    )
  ) {
    throw new ValidationError('Invalid invoice status', 'invoiceStatus');
  }

  const supabase = createServiceClient();

  const { data: existing, error: fetchError } = await supabase
    .from('contracts')
    .select('invoice_status, external_source' as any)
    .eq('id', contractId)
    .eq('organization_id', userMetadata.organizationId)
    .single();

  if (fetchError) {
    logger.error({ error: fetchError, contractId }, 'Error fetching contract');
    throw new DatabaseError(
      'Contract not found',
      fetchError as unknown as Error,
    );
  }

  const updatePayload: Record<string, unknown> = {
    invoice_status: invoiceStatus,
  };
  if (decisionReason !== undefined) {
    updatePayload.decision_reason = decisionReason.trim() || null;
  }

  const { error } = await supabase
    .from('contracts')
    .update(updatePayload as any)
    .eq('id', contractId)
    .eq('organization_id', userMetadata.organizationId);

  if (error) {
    logger.error({ error, contractId }, 'Error updating invoice status');
    throw new DatabaseError(
      'Failed to update invoice status',
      error as unknown as Error,
    );
  }

  const cacheService = await getCacheService();
  await cacheService.invalidateOrganizationData(userMetadata);

  if ((existing as any)?.external_source) {
    const { inngest: inngestClient } = await import('@/utils/inngest/client');
    const actorName = userMetadata.userProfile?.name ?? 'N/A';
    await inngestClient.send({
      name: 'integrations/invoice-status-updated',
      data: {
        contractId,
        organizationId: userMetadata.organizationId,
        status: invoiceStatus,
        oldStatus: (existing as any)?.invoice_status ?? null,
        reason: decisionReason?.trim() ?? null,
        actorName,
      },
    });
  }

  return { oldStatus: (existing as any)?.invoice_status ?? null };
}

export async function fetchContracts(
  fetchContractParams: FetchContractsParams,
): Promise<any> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }
  const contracts = await fetchContractsByUserRoles({
    ...fetchContractParams,
    userMetadata,
  });

  // Process contract hierarchies to identify superseded products
  const contractsWithSuperseded = await processContractHierarchies(
    contracts,
    userMetadata.organizationFY || 1,
  );

  const rates = await buildBaseCurrencyRates(
    contractsWithSuperseded.map((contract) => ({
      currency: contract?.currency,
      startDate: getContractStartDate({
        term_start_date: contract?.term_start_date,
      }),
    })),
    userMetadata.baseCurrency,
  );

  const contractsInBaseCurrency = await Promise.all(
    contractsWithSuperseded.map(async (contract) => {
      if (!contract) return contract;
      const productsInBaseCurrency = await convertAllProductsToUSD(
        contract,
        userMetadata.baseCurrency,
        rates,
      );
      return {
        ...(contract as Record<string, any>),
        vendor_products_details: productsInBaseCurrency,
      };
    }),
  );
  return contractsInBaseCurrency;
}

async function fetchContractsBaseImpl(): Promise<any[]> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }
  const cacheService = await getCacheService();

  const timestamp = new Date().toISOString();
  logger.info(
    {
      organizationId: userMetadata.organizationId,
      userId: userMetadata.userId,
      userRole: userMetadata.userRole,
      timestamp,
    },
    'fetchContractsBase called',
  );

  // The ACL lookup runs alongside the cache read so it hides behind it.
  const [cachedContracts, visibleIds] = await Promise.all([
    cacheService.getContractSet(),
    resolveVisibleContractIds(createServiceClient(), {
      organizationId: userMetadata.organizationId,
      userId: userMetadata.userId,
      userRole: userMetadata.userRole,
    }),
  ]);

  if (cachedContracts) {
    logger.info(
      {
        contractCount: cachedContracts.length,
        organizationId: userMetadata.organizationId,
      },
      'Returning cached contracts',
    );
    return filterToVisibleContracts(cachedContracts, visibleIds);
  }

  logger.info(
    { organizationId: userMetadata.organizationId },
    'Cache miss - fetching contracts from database',
  );

  const startTime = Date.now();

  const contracts = await fetchContractsByUserRoles({
    userMetadata,
    orgWide: true,
  });

  const rates = await buildBaseCurrencyRates(
    contracts.map((contract) => ({
      currency: contract?.currency,
      startDate: getContractStartDate({
        term_start_date: contract?.term_start_date,
      }),
    })),
    userMetadata.baseCurrency,
  );

  const contractsInBaseCurrency = await Promise.all(
    contracts.map(async (contract) => {
      if (!contract) return contract;
      const productsInBaseCurrency = await convertAllProductsToUSD(
        contract,
        userMetadata.baseCurrency,
        rates,
      );
      return {
        ...(contract as Record<string, any>),
        vendor_products_details: productsInBaseCurrency,
      };
    }),
  );

  const processingTime = Date.now() - startTime;

  logger.info(
    {
      contractCount: contractsInBaseCurrency.length,
      processingTime,
      organizationId: userMetadata.organizationId,
    },
    'Processed contracts from database',
  );

  await cacheService.cacheContractSet(
    contractsInBaseCurrency,
    userMetadata,
    3600,
  );

  return filterToVisibleContracts(
    contractsInBaseCurrency as Array<{ id?: number }>,
    visibleIds,
  );
}

export const fetchContractsBase = cache(fetchContractsBaseImpl);

export async function fetchContractsBaseForLineageAI(
  options: FetchContractsBaseOptions = { contractFields: [] },
): Promise<any[]> {
  const userMetadata = await getUserMetadata();
  const { contractFields } = options;
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }
  const cacheService = await getCacheService();
  const supplementalKey = getHash(contractFields?.join(':') || '') || '';

  const timestamp = new Date().toISOString();
  logger.info(
    {
      organizationId: userMetadata.organizationId,
      userId: userMetadata.userId,
      userRole: userMetadata.userRole,
      timestamp,
    },
    'fetchContractsBase called',
  );

  // The ACL lookup runs alongside the cache read so it hides behind it.
  const [cachedContracts, visibleIds] = await Promise.all([
    cacheService.getContractSet(supplementalKey),
    resolveVisibleContractIds(createServiceClient(), {
      organizationId: userMetadata.organizationId,
      userId: userMetadata.userId,
      userRole: userMetadata.userRole,
    }),
  ]);

  if (cachedContracts) {
    logger.info(
      {
        contractCount: cachedContracts.length,
        organizationId: userMetadata.organizationId,
      },
      'Returning cached contracts',
    );
    return filterToVisibleContracts(cachedContracts, visibleIds);
  }

  logger.info(
    { organizationId: userMetadata.organizationId },
    'Cache miss - fetching contracts from database',
  );

  const startTime = Date.now();

  const contracts = await fetchContractsByUserRolesForLineageAI({
    userMetadata,
    contractFields,
    orgWide: true,
  });

  const rates = await buildBaseCurrencyRates(
    contracts.map((contract) => ({
      currency: contract?.currency,
      startDate: getContractStartDate({
        term_start_date: contract?.term_start_date,
      }),
    })),
    userMetadata.baseCurrency,
  );

  const contractsInBaseCurrency = await Promise.all(
    contracts.map(async (contract) => {
      if (!contract) return contract;
      const productsInBaseCurrency = await convertAllProductsToUSD(
        contract,
        userMetadata.baseCurrency,
        rates,
      );
      return {
        ...(contract as Record<string, any>),
        vendor_products_details: productsInBaseCurrency,
      };
    }),
  );

  const processingTime = Date.now() - startTime;

  logger.info(
    {
      contractCount: contractsInBaseCurrency.length,
      processingTime,
      organizationId: userMetadata.organizationId,
    },
    'Processed contracts from database',
  );

  await cacheService.cacheContractSet(
    contractsInBaseCurrency,
    userMetadata,
    3600,
    supplementalKey,
  );

  return filterToVisibleContracts(
    contractsInBaseCurrency as Array<{ id?: number }>,
    visibleIds,
  );
}

export async function fetchContractsWithFiltering(
  options: ContractFilterOptions = {},
): Promise<any[]> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }
  const allContracts = await fetchContractsBase();

  logger.debug(
    {
      requestedFilters: Object.keys(options).filter(
        (key) => options[key as keyof ContractFilterOptions] !== undefined,
      ),
      totalContracts: allContracts.length,
      organizationId: userMetadata.organizationId,
    },
    'Applying client-side filtering',
  );

  return filterContracts(allContracts, options, userMetadata);
}

export async function fetchRenewingContracts(
  fetchContractParams: FetchRenewingContractsParams,
): Promise<any> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }
  return fetchRenewingContractsByUserRoles({
    ...fetchContractParams,
    userMetadata,
  });
}

export async function getOrganizationMissingClauseSettings(
  organizationId: string,
): Promise<{ settings: string[]; isConfirmed: boolean }> {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from('organizations')
      .select<
        string,
        {
          missing_clauses_settings: any[] | null;
          missing_clauses_confirmed: boolean | null;
        }
      >('missing_clauses_settings, missing_clauses_confirmed')
      .eq('id', organizationId)
      .single();

    if (error) throw error;

    const settings = data?.missing_clauses_settings || [];
    const isConfirmed = Boolean(data?.missing_clauses_confirmed);

    if (Array.isArray(settings)) {
      const stringSettings = settings
        .filter((item) => typeof item === 'string')
        .map((item) => String(item));

      return { settings: stringSettings, isConfirmed };
    }

    return { settings: [], isConfirmed };
  } catch (error) {
    logger.error(
      { error, organizationId },
      'Error fetching missing clauses settings',
    );
    return { settings: [], isConfirmed: false };
  }
}

export async function getMissingClausesForReport(
  contract: any,
  userMetadata: any,
): Promise<string[]> {
  // If there's no contract type, no clauses are required
  if (!contract.contract_types?.id) {
    logger.debug(
      {
        contractId: contract.id,
      },
      'No contract type found, returning empty array',
    );
    return [];
  }

  const { getMissingFields } = await import('@/lib/v2');

  // Get organization ID from the user metadata
  const organizationId = userMetadata?.organizationId;

  if (!organizationId) {
    // Fall back to default missing fields logic if no organization ID
    return getMissingFields(contract);
  }

  // Fetch the organization's missing clause settings
  const { settings: missingClauseSettings, isConfirmed } =
    await getOrganizationMissingClauseSettings(organizationId);

  if (!isConfirmed) {
    return [];
  }

  // Use the settings to determine which clauses are missing
  const missingClauses = getMissingFields(contract, missingClauseSettings);

  return missingClauses;
}

export async function fetchContractsById({ ids }: FetchContractsByIdParams) {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }
  const contracts = await fetchContractsByIdByUserRoles({ ids, userMetadata });
  return contracts ?? [];
}

export async function fetchContractDocumentsById({
  id,
}: FetchContractDocumentsByIdParams) {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }
  return fetchContractDocumentsByIdByUserRoles({ id, userMetadata });
}

export async function fetchCompleteAmendmentChain(contractId: number) {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }
  return fetchCompleteAmendmentChainByUserRoles({
    contractId,
    userMetadata,
  });
}

interface ContractData {
  totalPages: number;
  totalContracts: number | null;
}

export async function fetchContractsPages({
  query,
  contractStatus,
  contractActiveStatus,
  hideFailed,
}: FetchContractsPagesParams): Promise<ContractData> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }
  return fetchContractsPagesByUserRoles({
    query,
    contractStatus,
    contractActiveStatus,
    hideFailed,
    userMetadata,
  });
}

export async function fetchContractsByDateRange({
  startDate,
  endDate,
}: FetchContractsByDateRangeParams) {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }
  return fetchContractsByDateRangeByUserRoles({
    startDate,
    endDate,
    userMetadata,
  });
}

export async function shareTerm({
  recipient,
  message,
  termTitle,
  term,
  contractId,
}: {
  recipient: string;
  message: string;
  termTitle: string | 'Blank Term';
  term: string;
  contractId: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  noStore();

  try {
    // Send the email using Resend
    const { RESEND_API_KEY } = process.env;
    const resend = new Resend(RESEND_API_KEY);

    const userName = user?.user_metadata?.full_name || 'User';

    const { data } = await resend.emails.send({
      from: 'PostSig <noreply@postsig.com>',
      to: [recipient],
      subject: userName + ' shared ' + termTitle,
      react: ShareEmailTemplate({
        user: userName,
        termTitle,
        term,
        message,
      }) as React.ReactElement,
    });

    if (!user) {
      throw new AuthenticationError('User not authenticated');
    }

    const activityRecord = {
      contract_id: contractId,
      user_id: user.id,
      activity_type: 'shared',
      activity_data: JSON.stringify({
        recipient,
        termTitle,
        message,
      }),
    };

    const { error } = await supabase.from('activities').insert(activityRecord);

    if (error) {
      logger.error({ error }, 'Failed to create activity record');
      throw new DatabaseError('Failed to create activity record', error);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to share term and create activity record');
    throw new SystemError(
      'Failed to share term and create activity record',
      'SHARE_TERM_ERROR',
      error as Error,
    );
  }
}

export async function fetchContractActivity(id: number) {
  const supabase = await createClient();
  noStore();
  try {
    return await loadContractActivities(supabase as any, id);
  } catch (error) {
    logger.error({ error }, 'Supabase Error in fetchContractActivity');
    throw new Error('Failed to fetch contract activity by ID.');
  }
}

export async function notifyComments({
  recipients,
  comment,
  contractId,
}: {
  recipients: Array<{ email: string; type: 'mention' | 'reply' }>;
  comment: string;
  contractId: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  noStore();

  const contract = await fetchContractMetadata({ id: contractId });

  if (!user) {
    throw new Error('User not authenticated.');
  }

  try {
    const { RESEND_API_KEY } = process.env;
    const resend = new Resend(RESEND_API_KEY);
    const userName = user?.user_metadata?.full_name || 'User';
    const vendor = contract?.vendors?.name;
    const startsWithVowel = vendor?.match(/^[aeiou]/i) ? true : false;
    const article = startsWithVowel ? 'an' : 'a';

    const getSubject = (type: string) =>
      type === 'mention'
        ? `${userName} mentioned you in ${article} ${vendor} agreement`
        : `${userName} replied to your comment in ${article} ${vendor} agreement`;

    const emailPromises = recipients.map(({ email, type }) =>
      resend.emails.send({
        from: 'PostSig <noreply@postsig.com>',
        to: email,
        subject: getSubject(type),
        react: CommentEmailTemplate({
          user: userName,
          comment,
          contract,
          type,
        }) as React.ReactElement,
      }),
    );

    const results = await Promise.all(emailPromises);
    const errors = results.filter((result) => result.error);

    if (errors.length > 0) {
      logger.error({ errors }, 'Some emails failed to send');
    }

    return results;
  } catch (error) {
    logger.error({ error }, 'Error sending comment notification');
    throw new Error('Failed to send comment notification email.');
  }
}

export async function fetchContractIdsByFolder(
  folderId: string,
): Promise<number[]> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }
  const { fetchContractIdsByFolderByUserRoles } =
    await import('@/data/superuser/folders');
  return fetchContractIdsByFolderByUserRoles({
    folderId,
    userMetadata,
  });
}
