'use server';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@/utils/supabase/service_server';
import {
  FetchVendorContractsByUserRolesParams,
  FetchSingleVendorByUserRolesParams,
  UserMetadata,
  FindVendorsByUserRolesParams,
  FetchRelatedContractsByUserRolesParams,
} from '@/constants/types';
import { extendSupabaseQueryByUserRole } from '@/data/utils';
import { getAllOrgUsers } from '@/data/users';
import { DatabaseError } from '@/lib/errors';
import { Database } from '@/database.types';
import { statusCodes } from '@/constants/system';
import logger from '@/utils/pino';
import { calculateTotalFees } from '@/app/lib/budget';
import { getOrgBaseCurrency } from '@/lib/base-currency-server';
import { AssetClass } from '@/app/lib/definitions';
import { userRoles } from '@/constants/data';
import { PostgrestError } from '@supabase/supabase-js';
import { findByName } from '@/lib/name-matching';
import { logAlert } from '@/utils/logging/alert';
import {
  toVendorOrgDetails,
  toVendorOrgDetailsRow,
  type VendorOrgDetails,
} from '@/lib/v2/vendors/details';

type VendorProduct = {
  id: number;
  name: string;
  vendor_id: number;
  created_at: string;
  product_code?: string | null;
};

export async function fetchVendorContractsByUserRoles({
  id: targetId,
  contractFields = [],
  userMetadata: { userId, userRole, organizationId },
}: FetchVendorContractsByUserRolesParams) {
  noStore();
  const supabase = createClient();

  try {
    const relatedCvRecords = await getCurrentVendorsByVendorId(targetId);

    if (!relatedCvRecords || relatedCvRecords.length === 0) {
      return [];
    }

    const uniqueOriginalVendorIds: number[] = Array.from(
      new Set<number>(
        relatedCvRecords
          .map((cv: any) => cv.original_vendor_id as number)
          .filter((cvId: number | null): cvId is number => cvId != null),
      ),
    );

    if (uniqueOriginalVendorIds.length === 0) {
      return [];
    }

    let contractsQuery = supabase
      .from('contracts')
      .select(
        `
          ${contractFields.length === 0 ? '*' : contractFields.join(',')},
          id,
          vendor_id,
          type_id,
          status_id,
          status,
          ai_extraction_status,
          vendors (
            id, name, domain
          ),
          contract_types (
            id, name
          ),
          contract_statuses (
            id, name
          ),
          vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
            *,
            vendor_products (
              id, name
            )
          ),
          users!contracts_user_id_fkey (
            id, name, organization
          ),
          child_relationships:contract_relationships!contract_relationships_child_contract_id_fkey (
            parent_contract_id,
            active,
            disabled
          )
        `,
      )
      .in('vendor_id', uniqueOriginalVendorIds);

    contractsQuery = contractsQuery.neq('status', 'inactive');
    const extendedContractsQuery = extendSupabaseQueryByUserRole(
      supabase,
      contractsQuery,
      userId,
      userRole,
      organizationId,
    );

    const { data: allFetchedContracts, error: contractsError } =
      await extendedContractsQuery;

    if (contractsError) {
      console.error('Supabase Error fetching contracts:', contractsError);
      throw new Error(
        `Failed to fetch vendor contracts: ${contractsError.message}`,
      );
    }

    if (!allFetchedContracts || allFetchedContracts.length === 0) {
      return [];
    }

    return allFetchedContracts.map((contract: any) => {
      const specificCvRecord = relatedCvRecords.find(
        (cv: any) =>
          cv.current_vendor_id === targetId &&
          cv.original_vendor_id === contract.vendor_id,
      );

      let processedVendorInfo = contract.vendors;
      if (contract.vendors) {
        processedVendorInfo = {
          ...contract.vendors,
          current_vendor: specificCvRecord || null,
          name: specificCvRecord?.current_vendor_name || contract.vendors.name,
          id: specificCvRecord?.current_vendor_id || contract.vendors.id,
          domain:
            specificCvRecord?.current_vendor_domain || contract.vendors.domain,
        };
      }

      return {
        ...contract,
        vendors: processedVendorInfo,
        vendor_id: specificCvRecord?.current_vendor_id || contract.vendor_id,
      };
    });
  } catch (error) {
    console.error('Error in fetchVendorContractsByUserRoles:', error);
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error(
        'An unknown error occurred while fetching vendor contracts',
      );
    }
  }
}

export async function fetchRelatedContractsByUserRoles({
  id,
  contractFields = [],
  userMetadata: { userId, userRole, organizationId },
}: FetchRelatedContractsByUserRolesParams) {
  const supabase = createClient();
  noStore();
  try {
    if (!id) {
      throw new Error('Current contract ID is required');
    }

    // Fetch the current contract and its relationships
    const { data: currentContract, error: currentContractError } =
      await supabase
        .from('contracts')
        .select<
          string,
          {
            id: number;
            type_id: number;
            status: string;
            child_relationships: Array<{ child_contract_id: number }>;
            parent_relationships: Array<{ parent_contract_id: number }>;
          }
        >(
          `
          id,
          type_id,
          status,
          child_relationships:contract_relationships!contract_relationships_parent_contract_id_fkey (
            child_contract_id
          ),
          parent_relationships:contract_relationships!contract_relationships_child_contract_id_fkey (
            parent_contract_id
          )
        `,
        )
        .eq('id', id)
        .single();

    if (currentContractError) {
      console.error('Error fetching current contract:', currentContractError);
      throw new Error(
        `Failed to fetch current contract: ${currentContractError.message}`,
      );
    }

    if (!currentContract) {
      throw new Error(`No contract found with ID: ${id}`);
    }

    // Get directly related contract IDs
    const relatedContractIds = new Set([
      id,
      ...(currentContract.child_relationships || []).map(
        (rel) => rel.child_contract_id,
      ),
      ...(currentContract.parent_relationships || []).map(
        (rel) => rel.parent_contract_id,
      ),
    ]);

    // Fetch all related contracts
    let query = supabase
      .from('contracts')
      .select(
        `
          ${contractFields.length === 0 ? '*' : contractFields.join(',')},
          id,
          type_id,
          status,
          vendors (
            id, name, domain
          ),
          contract_types (
            id, name
          ),
          vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
            *,
            vendor_products (
              id, name
            )
          ),
          child_relationships:contract_relationships!contract_relationships_parent_contract_id_fkey (
            id,
            child_contract_id
          ),
          parent_relationships:contract_relationships!contract_relationships_child_contract_id_fkey (
            id,
            parent_contract_id
          )
        `,
      )
      .in('id', Array.from(relatedContractIds))
      .neq('status', 'inactive');

    const extendedQuery = extendSupabaseQueryByUserRole(
      supabase,
      query,
      userId,
      userRole,
      organizationId,
    );
    const { data: relatedContracts, error } = await extendedQuery;

    if (error) {
      console.error('Error fetching related contracts:', error);
      throw new Error(`Failed to fetch related contracts: ${error.message}`);
    }

    if (!relatedContracts || relatedContracts.length === 0) {
      return [];
    }

    // Create a map of all contracts
    const contractMap = new Map(
      relatedContracts.map((contract: any) => [
        contract.id,
        { ...contract, children: [] },
      ]),
    );

    // Function to build the contract hierarchy
    const buildHierarchy = (contract: any) => {
      if (
        contract.child_relationships &&
        contract.child_relationships.length > 0
      ) {
        contract.children = contract.child_relationships
          .map((childRel: any) => contractMap.get(childRel.child_contract_id))
          .filter(Boolean)
          .map(buildHierarchy);
      }
      return contract;
    };

    // Get the current contract and its direct relationships
    const currentContractWithHierarchy = buildHierarchy(contractMap.get(id));
    const parentContracts = currentContract.parent_relationships
      .map((rel: any) => contractMap.get(rel.parent_contract_id))
      .filter(Boolean)
      .map(buildHierarchy);

    // Combine parent contracts and the current contract with its children
    return [...parentContracts, currentContractWithHierarchy].filter(Boolean);
  } catch (error) {
    console.error('Error in fetchRelatedContractsByUserRoles:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to fetch related contracts: ${error.message}`);
    } else {
      throw new Error(
        'An unknown error occurred while fetching related contracts',
      );
    }
  }
}

export async function fetchSingleVendorByUserRoles({
  id,
  userMetadata: { userId, organizationId, userRole },
}: FetchSingleVendorByUserRolesParams) {
  try {
    noStore();
    const orgUserIds = await getAllOrgUsers(organizationId);
    const supabase = createClient();
    const vendorQuery = supabase
      .from('vendors')
      .select(
        `
          *,
          contracts:contracts(
            user_id,
            asset_classes:contract_asset_classes(
              asset_class_id,
              sub_asset_class_id,
              is_parent_tag,
              asset_class:asset_classes(
                id,
                name
              ),
              sub_asset_class:sub_asset_classes(
                id,
                name
              )
            )
          )
        `,
      )
      .eq('id', id)
      .in('contracts.user_id', orgUserIds);

    const { data: rawVendor, error } = await vendorQuery.single();

    if (error) {
      throw error;
    }

    // NOTE FROM CINDY: opening up vendor access for now until we fix PSK-432
    //
    // if (!rawVendor.contracts.some(({ user_id }) => userId === user_id)) {
    //   throw new Error("User doesn't have access to this vendor");
    // }

    // Process, flatten, and remove duplicate asset classes
    const assetClasses = ((rawVendor as any).contracts as any)
      .flatMap(
        (contract: { asset_classes: AssetClass }) => contract.asset_classes,
      )
      .filter(
        (assetClass: AssetClass | null): assetClass is AssetClass =>
          assetClass !== null,
      );

    // Create the processed vendor object
    const vendor: any = {
      ...(rawVendor as any),
      asset_classes: assetClasses,
    };

    // Remove the original contracts property
    delete vendor.contracts;

    return { vendor };
  } catch (error) {
    console.error('fetchSingleVendorByUserRoles Error');
    throw new Error('Failed to fetch vendor.');
  }
}

export async function fetchVendorListByUserRoles({
  organizationId,
  userId,
  userRole,
}: UserMetadata) {
  const supabase = createClient();
  try {
    const allowedUserIds = [
      userRoles.clientAdmin,
      userRoles.clientSupervisor,
    ].includes(userRole)
      ? await getAllOrgUsers(organizationId)
      : [userId];

    let initialVendors: any[] | null = null;
    let error: PostgrestError | null = null;

    if (userRole === userRoles.clientUser) {
      // Client users see vendors only when they have access via:
      // 1) direct contract_acl_user grant OR
      // 2) contract_acl_group where user is in group_members

      const [
        { data: directAcl, error: directError },
        { data: groupAcl, error: groupError },
      ] = await Promise.all([
        supabase
          .from('contract_acl_user')
          .select('contract_id')
          .eq('organization_id', organizationId)
          .eq('user_id', userId),
        supabase
          .from('contract_acl_group')
          .select(
            `
              contract_id,
              groups!inner (
                id,
                group_members!inner (
                  user_id
                )
              )
            `,
          )
          .eq('organization_id', organizationId)
          .eq('groups.group_members.user_id', userId),
      ]);

      if (directError) throw directError;
      if (groupError) throw groupError;

      const allowedContractIds = Array.from(
        new Set<number>(
          [
            ...((directAcl || []).map((r: any) => r.contract_id) as number[]),
            ...((groupAcl || []).map((r: any) => r.contract_id) as number[]),
          ].filter((id): id is number => typeof id === 'number'),
        ),
      );

      if (allowedContractIds.length === 0) {
        return { vendors: [] };
      }

      const vendorsResult = await supabase
        .from('vendors')
        .select(
          `
          id,
          name,
          domain,
          contracts!inner (
            id,
            status,
            type_id
          )
        `,
        )
        .eq('contracts.status_id', 4)
        .not('contracts.status', 'eq', 'inactive')
        .in('contracts.id', allowedContractIds)
        .order('name', { ascending: true });

      initialVendors = vendorsResult.data as any[] | null;
      error = vendorsResult.error;
    } else {
      const vendorsResult = await supabase
        .from('vendors')
        .select(
          `
          id,
          name,
          domain,
          contracts!inner (
            id,
            status,
            type_id
          )
        `,
        )
        .eq('contracts.status_id', 4)
        .not('contracts.status', 'eq', 'inactive')
        .in('contracts.user_id', allowedUserIds)
        .order('name', { ascending: true });

      initialVendors = vendorsResult.data as any[] | null;
      error = vendorsResult.error;
    }

    if (error) throw error;

    if (!initialVendors || initialVendors.length === 0) {
      return { vendors: [] };
    }

    const originalVendorIdsFromList = Array.from(
      new Set<number>(
        initialVendors
          .map((vendor: any) => vendor.id as number)
          .filter((id: number | null): id is number => id != null),
      ),
    );

    const allCurrentVendorRecords = await getCurrentVendorsByOriginalVendorIds(
      originalVendorIdsFromList,
    );

    const processedVendorsIntermediate = initialVendors.map((vendor: any) => {
      const cvRecord = allCurrentVendorRecords?.find(
        (cv: any) => cv.original_vendor_id === vendor.id,
      );

      if (cvRecord) {
        return {
          ...vendor,
          id: cvRecord.current_vendor_id,
          name: cvRecord.current_vendor_name,
          domain: cvRecord.current_vendor_domain,
          current_vendor_details: cvRecord,
          original_vendor_details: {
            id: vendor.id,
            name: vendor.name,
            domain: vendor.domain,
          },
        };
      }
      return {
        ...vendor,
        current_vendor_details: null,
        original_vendor_details: {
          id: vendor.id,
          name: vendor.name,
          domain: vendor.domain,
        },
      };
    });

    const uniqueVendorsMap = new Map<number, any>();

    processedVendorsIntermediate.forEach((vendor: any) => {
      if (uniqueVendorsMap.has(vendor.id)) {
        // Merge contracts if vendor.id (current_vendor_id) is already seen
        const existingVendor = uniqueVendorsMap.get(vendor.id);
        if (vendor.contracts && vendor.contracts.length > 0) {
          existingVendor.contracts = (existingVendor.contracts || []).concat(
            vendor.contracts,
          );
        }
      } else {
        uniqueVendorsMap.set(vendor.id, { ...vendor });
      }
    });

    const finalUniqueVendors = Array.from(uniqueVendorsMap.values());

    return {
      vendors: finalUniqueVendors,
    };
  } catch (error) {
    console.error('Error in fetchVendorListByUserRoles:', error);
    throw new Error('Failed to fetch vendor list.');
  }
}

export async function fetchVendorNamesByUserRoles({
  organizationId,
  userId,
  userRole,
}: UserMetadata) {
  const supabase = createClient();
  try {
    const orgUserIds = await getAllOrgUsers(organizationId);
    let query = supabase
      .from('vendors')
      .select(
        `
        id,
        name,
        domain,
        contracts:contracts (
          id,
          status,
          status_id,
          type_id,
          term_start_date,
          term_end_date,
          cancel_date,
          cancel_by_date,
          renewal_type,
          annual_increase,
          currency,
          subscription_term,
          renewal_period,
          will_not_renew,
          vendor_products_details:vendor_products_details (
            *
          ),
          child_relationships:contract_relationships!contract_relationships_parent_contract_id_fkey (
            id,
            child_contract_id,
            active,
            disabled
          ),
          parent_relationships:contract_relationships!contract_relationships_child_contract_id_fkey (
            id,
            parent_contract_id,
            active,
            disabled
          )
        )
      `,
      )
      .order('name', { ascending: true })
      .not('contracts.status', 'eq', 'inactive')
      .eq('contracts.status_id', 4)
      .in('contracts.user_id', orgUserIds);

    if (
      ![userRoles.clientAdmin, userRoles.clientSupervisor].includes(userRole)
    ) {
      query = query.eq('contracts.user_id', userId);
    }

    let { data, error } = await query;
    if (error) throw error;

    const vendorsWithContracts =
      data?.filter(
        (vendor: any) => vendor.contracts && vendor.contracts.length > 0,
      ) ?? [];

    // Both imports stay dynamic: @/data/superuser/contracts imports this module,
    // and @/app/lib/contracts/utils reaches it through contract actions, so a
    // static edge either way closes a cycle.
    const [{ filterLinkedChildInvoices }, { fetchAllRelationshipsForOrg }] =
      await Promise.all([
        import('@/app/lib/contracts/utils'),
        import('@/data/superuser/contracts'),
      ]);
    const relationships = await fetchAllRelationshipsForOrg(organizationId);

    const processedVendors = vendorsWithContracts.map((vendor: any) => ({
      ...vendor,
      contracts: filterLinkedChildInvoices(vendor.contracts, relationships),
    }));

    // Continue with processed vendors that have non-empty contracts array
    const vendorsWithValidContracts = processedVendors.filter(
      (vendor: any) => vendor.contracts && vendor.contracts.length > 0,
    );

    const baseCurrency = await getOrgBaseCurrency(organizationId);
    const vendorsWithFeesPromises = vendorsWithValidContracts.map(
      async (vendor: any) => ({
        id: vendor.id,
        name: vendor.name,
        domain: vendor.domain,
        contracts: vendor.contracts,
        totalFees: await calculateTotalFees(vendor, baseCurrency),
      }),
    );

    const vendorsWithFees = await Promise.all(vendorsWithFeesPromises);
    const vendorsWithNonZeroFees = vendorsWithFees.filter(
      (vendor) => vendor.totalFees > 0,
    );
    const sortedVendors = vendorsWithNonZeroFees.sort(
      (a, b) => b.totalFees - a.totalFees,
    );

    return {
      vendors: sortedVendors,
      totalVendors: sortedVendors.length,
    };
  } catch (error) {
    console.error('Error fetching vendors with fees:', error);
    throw new Error('Failed to fetch vendors with fees.');
  }
}

export async function findVendorsByUserRoles({
  column,
  value,
  userMetadata: { userId, userRole, organizationId },
}: FindVendorsByUserRolesParams) {
  const supabase = createClient();
  const query = supabase.from('vendors').select('id,name').ilike(column, value);
  const extendedQuery = extendSupabaseQueryByUserRole(
    supabase,
    query,
    userId,
    userRole,
    organizationId,
  );
  let { data, error } = await extendedQuery;
  return { data, error };
}

/**
 * Resolves an extracted product line to a vendor_products row.
 *
 * An Exchange Agreement Product Code, when the document carries one, wins over
 * every name tier: Euronext descriptions differ only by market and level, which
 * the fuzzy word-overlap tier happily conflates. The code is unique per vendor,
 * so a hit is exact by construction.
 *
 * Falls back to name matching when the code is absent or not yet on file. A name
 * match whose code disagrees is handled below.
 */
export async function searchVendorProducts(
  vendorId: number,
  productName: string,
  productCode?: string | null,
): Promise<VendorProduct | undefined> {
  const supabase = createClient();
  // Products are vendor-scoped but contracts keep historical vendor ids, so a
  // product may live under any vendor in the corporate-action family. Searching
  // only `vendorId` forked duplicate rows whenever an invoice arrived under the
  // acquirer while the parent contract's products sat under the acquired vendor.
  const familyIds = await expandVendorLineageIds(vendorId);
  const { data: vendorProducts, error: productsError } = await supabase
    .from('vendor_products')
    .select('*')
    .in('vendor_id', familyIds);
  if (productsError) {
    logger.error(
      { error: productsError, vendorId },
      'Failed to load vendor family products',
    );
    throw new DatabaseError(
      'Failed to load vendor family products',
      productsError as Error,
    );
  }

  // findByName keeps the first row of the winning tier, so ordering encodes
  // preference: the vendor's own rows beat family siblings', and among
  // siblings the oldest row is the one the others were forked from.
  const candidates = ((vendorProducts ?? []) as VendorProduct[]).sort(
    (a, b) => {
      const aOwn = a.vendor_id === vendorId;
      const bOwn = b.vendor_id === vendorId;
      if (aOwn !== bOwn) return aOwn ? -1 : 1;
      return a.created_at.localeCompare(b.created_at);
    },
  );

  const normalizedCode = productCode?.trim() || null;

  if (normalizedCode) {
    const byCode = candidates.find(
      (product) => product.product_code === normalizedCode,
    );
    if (byCode) return byCode;
  }

  const match = findByName(candidates, productName);
  if (!match) return undefined;

  if (
    normalizedCode &&
    match.item.product_code &&
    match.item.product_code !== normalizedCode
  ) {
    // Euronext reissues its EMDA product codes — a transposition table takes
    // effect 1 October 2026, and only 127 of ~700 codes survive it. After a
    // reissue the stored product holds the old code and the new document the new
    // one, while the name still matches exactly. Refusing that match would fork a
    // duplicate product for every reissued line, which is the failure this
    // column exists to prevent, so an exact name match wins and is reported.
    //
    // Below the exact tier the name is only a guess, so a code disagreement is
    // taken at face value and the line becomes a new product.
    const isReissue = match.tier === 'exact' && !match.ambiguous;
    logAlert(
      'vendor-product-code-conflict',
      undefined,
      {
        vendorId,
        requestedProduct: productName,
        requestedCode: normalizedCode,
        matchedProduct: match.item.name,
        matchedCode: match.item.product_code,
        tier: match.tier,
        ambiguous: match.ambiguous,
        resolution: isReissue ? 'matched-as-reissue' : 'treated-as-new-product',
      },
      isReissue
        ? 'Product name matched exactly but the Exchange Agreement code differs; linking anyway, most likely a Euronext code reissue'
        : 'Product name matched a vendor product carrying a different Exchange Agreement code; treating it as a new product',
    );
    if (!isReissue) return undefined;
  }

  if (match.tier !== 'exact' || match.ambiguous) {
    logger.info(
      {
        vendorId,
        matchedVendorId: match.item.vendor_id,
        requestedProduct: productName,
        matchedProduct: match.item.name,
        tier: match.tier,
        ambiguous: match.ambiguous,
      },
      'Vendor product matched below the exact tier',
    );
  }
  return match.item;
}

export type VendorProductDetailInput = {
  contractId: number;
  productId: number;
  year: number;
  fees: number | null;
  userId: string;
  n_users?: number | null;
  /** Invoice line detail (psk-996). Every one is optional. */
  account_number?: string | null;
  quantity?: number | null;
  change_activity?: string | null;
  rate?: number | null;
  period_start?: string | null;
  period_end?: string | null;
  /**
   * An invoice may bill the same product on several lines, so a repeat of
   * (product, year) is a new row rather than an update of the previous one.
   * Off everywhere else, where a repeat still means "the same line, extracted
   * again".
   */
  allowDuplicates?: boolean;
};

export async function saveVendorProductDetail(input: VendorProductDetailInput) {
  const {
    contractId,
    productId,
    year,
    fees,
    userId,
    n_users,
    allowDuplicates = false,
  } = input;
  const supabase = createClient();

  const payload: Database['public']['Tables']['vendor_products_details']['Insert'] =
    {
      contract_id: contractId,
      product_id: productId,
      year,
      fees,
      user_id: userId,
      account_number: input.account_number ?? null,
      quantity: input.quantity ?? null,
      change_activity: input.change_activity ?? null,
      rate: input.rate ?? null,
      period_start: input.period_start ?? null,
      period_end: input.period_end ?? null,
    };
  if (n_users !== undefined && n_users !== null && !isNaN(n_users)) {
    payload.n_users = n_users;
  }

  if (!allowDuplicates) {
    const { data: existing, error: findError } = await supabase
      .from('vendor_products_details')
      .select('id')
      .eq('contract_id', contractId)
      .eq('product_id', productId)
      .eq('year', year)
      .maybeSingle();
    if (findError) throw findError;

    if (existing) {
      const { data, error } = await supabase
        .from('vendor_products_details')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  }

  const { data, error } = await supabase
    .from('vendor_products_details')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createVendorProduct(
  vendorId: number,
  productName: string,
  productCode?: string | null,
) {
  const supabase = createClient();
  const cleanedName = (productName ?? '').trim();
  const formattedName = cleanedName
    ? `${cleanedName.charAt(0).toUpperCase()}${cleanedName.slice(1)}`
    : cleanedName;
  const cleanedCode = productCode?.trim() || null;
  const { data, error } = await supabase
    .from('vendor_products')
    .insert({
      vendor_id: vendorId,
      name: formattedName,
      product_code: cleanedCode,
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeVendorProductDetail(
  contractId: number,
  productId?: number,
) {
  const supabase = createClient();
  let query = supabase
    .from('vendor_products_details')
    .delete()
    .eq('contract_id', contractId);
  if (productId) {
    query = query.eq('product_id', productId);
  }
  const { error } = await query;
  if (error) throw error;
}

export async function getCurrentVendorsByVendorId(vendorId: number): Promise<
  | {
      current_vendor_id: number;
      current_vendor_name: string;
      original_vendor_id: number;
      current_vendor_domain: string | null;
    }[]
  | null
> {
  const supabase = createClient();
  try {
    const currentVendors = [];
    const { data, error } = await supabase
      .from('current_vendors')
      .select('*')
      .eq('current_vendor_id', vendorId);

    const { data: vendorDomainInfo, error: vendorError } = await supabase
      .from('vendors')
      .select<string, { domain: string | null }>('domain')
      .eq('id', vendorId)
      .single();
    if (vendorError) throw vendorError;

    if (!data) {
      return null;
    }

    for (const vendor of data as any[]) {
      if (
        vendor.current_vendor_id !== null &&
        vendor.current_vendor_name !== null &&
        vendor.original_vendor_id !== null
      ) {
        currentVendors.push({
          current_vendor_id: vendor.current_vendor_id,
          current_vendor_name: vendor.current_vendor_name,
          original_vendor_id: vendor.original_vendor_id,
          current_vendor_domain: vendorDomainInfo?.domain ?? null,
        });
      }
    }

    if (error) {
      console.error('Error fetching current vendors:', error);
      return null;
    }

    return currentVendors;
  } catch (error) {
    console.error('Error in getCurrentVendorsByVendorId:', error);
    return null;
  }
}

async function mergeLineageIds(
  supabase: ReturnType<typeof createClient>,
  vendorId: number,
): Promise<Set<number>> {
  const { data: canonicalRows, error: canonicalError } = await supabase
    .from('current_vendors')
    .select('current_vendor_id')
    .eq('original_vendor_id', vendorId);
  if (canonicalError) throw canonicalError;

  // One hop suffices: `current_vendors` is a WITH RECURSIVE view anchored on
  // active vendors, so it already resolves chained merges (A→B→C maps A
  // straight to C) — there is no intermediate id to follow.
  // `vendors.merged_into_vendor_id` is also a single nullable FK, so a vendor
  // has at most one merge target and therefore at most one canonical id —
  // `find` is picking the only candidate, not truncating an ambiguous set.
  const canonicalId =
    (canonicalRows ?? []).find(
      (row): row is { current_vendor_id: number } =>
        row.current_vendor_id != null,
    )?.current_vendor_id ?? vendorId;

  const { data: lineageRows, error: lineageError } = await supabase
    .from('current_vendors')
    .select('original_vendor_id')
    .eq('current_vendor_id', canonicalId);
  if (lineageError) throw lineageError;

  const lineageIds = (lineageRows ?? [])
    .map((row) => row.original_vendor_id)
    .filter((id): id is number => id != null);

  return new Set<number>([vendorId, canonicalId, ...lineageIds]);
}

async function corpActionPartnerIds(
  supabase: ReturnType<typeof createClient>,
  family: Set<number>,
): Promise<Set<number>> {
  const familyList = Array.from(family).join(',');
  const { data: actionRows, error: actionError } = await supabase
    .from('corporate_actions')
    .select('primary_vendor_id, secondary_vendor_id')
    .or(
      `primary_vendor_id.in.(${familyList}),secondary_vendor_id.in.(${familyList})`,
    );
  if (actionError) throw actionError;

  const partnerIds = new Set<number>();
  for (const row of actionRows ?? []) {
    for (const id of [row.primary_vendor_id, row.secondary_vendor_id]) {
      if (id != null && !family.has(id)) partnerIds.add(id);
    }
  }
  return partnerIds;
}

async function partnerMergeLineageIds(
  supabase: ReturnType<typeof createClient>,
  partnerIds: Set<number>,
): Promise<Set<number>> {
  // Partners' merge lineages, batched: canonicalize every partner, then fan
  // each canonical id back out to its originals. Partners absent from the
  // view are their own canonical id, which the initial set already covers.
  const { data: partnerCanonicalRows, error: partnerCanonicalError } =
    await supabase
      .from('current_vendors')
      .select('current_vendor_id')
      .in('original_vendor_id', Array.from(partnerIds));
  if (partnerCanonicalError) throw partnerCanonicalError;

  const canonicalIds = new Set<number>(partnerIds);
  for (const row of partnerCanonicalRows ?? []) {
    if (row.current_vendor_id != null) canonicalIds.add(row.current_vendor_id);
  }

  const { data: partnerLineageRows, error: partnerLineageError } =
    await supabase
      .from('current_vendors')
      .select('original_vendor_id')
      .in('current_vendor_id', Array.from(canonicalIds));
  if (partnerLineageError) throw partnerLineageError;

  const result = new Set<number>(canonicalIds);
  for (const row of partnerLineageRows ?? []) {
    if (row.original_vendor_id != null) result.add(row.original_vendor_id);
  }
  return result;
}

/**
 * Expands a vendor id to every vendor id in its corporate-action family.
 *
 * Vendor identity is stored historically and translated at read time, so a
 * contract signed with a since-acquired vendor keeps that vendor's original id.
 * Callers that filter on `vendor_id` must therefore match the whole family,
 * not just the id they matched by name.
 *
 * The family is the merge lineage (canonicalize the input through
 * `current_vendors`, then fan back out to all originals sharing that canonical
 * id) plus a single corporate-action hop: partners paired with any family
 * member by a `corporate_actions` row, and those partners' own merge lineages.
 * This mirrors `contract_relationship_vendors_related`, which accepts a link
 * when the canonical ids are equal or corp-paired; partners' further corporate
 * actions are deliberately not followed — relatedness is pairwise, not
 * transitive. A vendor with no view row (never touched by a corporate action,
 * or `status` NULL) is its own canonical id.
 */
export async function expandVendorLineageIds(
  vendorId: number,
): Promise<number[]> {
  const supabase = createClient();
  try {
    const family = await mergeLineageIds(supabase, vendorId);

    const partnerIds = await corpActionPartnerIds(supabase, family);
    if (partnerIds.size === 0) return Array.from(family);

    const partnerFamily = await partnerMergeLineageIds(supabase, partnerIds);
    return Array.from(new Set<number>([...family, ...partnerFamily]));
  } catch (error) {
    logger.error({ error, vendorId }, 'Failed to expand vendor lineage');
    throw new DatabaseError('Failed to expand vendor lineage', error as Error);
  }
}

export async function fetchVendorCountByUserRoles({
  organizationId,
  userId,
  userRole,
}: UserMetadata) {
  const supabase = createClient();
  try {
    const query = supabase.from('vendors').select('*', { count: 'exact' });
    const extendedQuery = extendSupabaseQueryByUserRole(
      supabase,
      query,
      userId,
      userRole,
      organizationId,
    );
    const { count, error } = await extendedQuery;
    if (error) throw error;
    return count;
  } catch (error) {
    logger.error(error, 'Failed to count vendors');
    throw new DatabaseError('Failed to count vendors', error as Error);
  }
}

export async function fetchVendorAndContractUsage({
  organizationId,
  userId,
  userRole,
}: UserMetadata) {
  const supabase = createClient();
  try {
    const orgUserIds = await getAllOrgUsers(organizationId);

    // Get published contracts with vendor info (excluding failed contracts)
    let query = supabase
      .from('contracts')
      .select('id, vendor_id', { count: 'exact' })
      .eq('status_id', 4)
      .not('ai_extraction_status', 'in', '(ai_failed,h_failed)')
      .in('user_id', orgUserIds);

    const { data: contracts, count: contractCount, error } = await query;
    if (error) throw error;

    // Count unique vendors from the contracts
    const uniqueVendorIds = new Set(
      contracts?.map((contract: any) => contract.vendor_id).filter(Boolean) ||
        [],
    );
    const vendorCount = uniqueVendorIds.size;

    return {
      contractCount: contractCount || 0,
      vendorCount,
    };
  } catch (error) {
    logger.error(error, 'Failed to fetch vendor and contract usage');
    throw new DatabaseError(
      'Failed to fetch vendor and contract usage',
      error as Error,
    );
  }
}

export async function getCurrentVendorsByOriginalVendorIds(
  originalVendorIds: number[],
): Promise<
  | {
      current_vendor_id: number;
      current_vendor_name: string;
      original_vendor_id: number;
      current_vendor_domain: string | null;
    }[]
  | null
> {
  if (!originalVendorIds || originalVendorIds.length === 0) {
    return [];
  }
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from('current_vendors')
      .select('*')
      .in('original_vendor_id', originalVendorIds);

    if (error) {
      console.error(
        'Error fetching current vendors by original_vendor_ids:',
        error,
      );
      return null;
    }

    if (!data) {
      return null;
    }

    const currentVendorIds = data.map(
      (vendor: any) => vendor.current_vendor_id,
    );

    const { data: vendorDomainInfo, error: vendorError } = await supabase
      .from('vendors')
      .select<string, { id: number; domain: string | null }>('id, domain')
      .in('id', currentVendorIds);
    if (vendorError) throw vendorError;

    const currentVendors: {
      current_vendor_id: number;
      current_vendor_name: string;
      original_vendor_id: number;
      current_vendor_domain: string | null;
    }[] = [];
    for (const vendor of (data ?? []) as any[]) {
      if (
        vendor.original_vendor_id !== null &&
        vendor.current_vendor_id !== null &&
        vendor.current_vendor_name !== null
      ) {
        const vendorDomain = vendorDomainInfo?.find(
          (v) => v.id === vendor.current_vendor_id,
        );
        if (vendorDomain) {
          currentVendors.push({
            current_vendor_id: vendor.current_vendor_id,
            current_vendor_name: vendor.current_vendor_name,
            original_vendor_id: vendor.original_vendor_id,
            current_vendor_domain: vendorDomain.domain ?? null,
          });
        }
      }
    }

    return currentVendors;
  } catch (error) {
    console.error('Exception in getCurrentVendorsByOriginalVendorIds:', error);
    return null;
  }
}

const ORGANIZATION_VENDOR_DETAIL_COLUMNS =
  'primary_contact_name, primary_contact_email, primary_contact_phone, notes';

export async function fetchOrganizationVendorDetails(
  organizationId: string,
  vendorId: number,
): Promise<VendorOrgDetails> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('organization_vendor_settings')
    .select(ORGANIZATION_VENDOR_DETAIL_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('vendor_id', vendorId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(
      'Failed to load organization vendor details',
      error as Error,
    );
  }
  return toVendorOrgDetails(data);
}

export async function upsertOrganizationVendorDetails(
  organizationId: string,
  vendorId: number,
  details: VendorOrgDetails,
): Promise<VendorOrgDetails> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('organization_vendor_settings')
    .upsert(
      {
        organization_id: organizationId,
        vendor_id: vendorId,
        ...toVendorOrgDetailsRow(details),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id, vendor_id' },
    )
    .select(ORGANIZATION_VENDOR_DETAIL_COLUMNS)
    .single();

  if (error) {
    throw new DatabaseError(
      'Failed to save organization vendor details',
      error as Error,
    );
  }
  return toVendorOrgDetails(data);
}
