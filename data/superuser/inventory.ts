import { createClient } from '@/utils/supabase/service_server';
import { Database } from '@/database.types';
import { extendSupabaseQueryByUserRole } from '@/data/utils';
import {
  buildContractHierarchyMap,
  findDeepestChildWithProduct,
  findTopmostParentWithProduct,
} from '@/lib/inventory/hierarchyUtils';
import logger from '@/utils/pino';
import { INVOICE_TYPE_IDS, typeIdInList } from '@/app/lib/constants';
import {
  getBusinessGroupsByLeaf,
  type BusinessGroupNode,
} from '@/lib/v2/org-units';

/**
 * TypeScript interfaces for merged contract data
 * These fields are added during the mergeProductsFromAmendments process
 */
interface MergedProductDetail {
  _replacedByChild?: boolean;
  _replacedByContractId?: number;
  _replacedByContractType?: string;
}

interface MergedContract {
  _pricingSourceContractId?: number;
  _pricingSourceType?: string;
  _isUniqueProduct?: boolean;
}

/**
 * Merges product pricing data from amendment chains with intelligent metadata handling.
 *
 * Business Logic:
 * - If product exists in a parent contract: use parent's metadata + deepest child's pricing
 * - If product is unique to a child: use child's own metadata + pricing
 * - Child pricing supersedes parent pricing using "effective FY forward" rule:
 *   * Amendment effective in FY25 updates FY25 and all future fiscal years (FY26, FY27, etc.)
 *   * Amendment does NOT retroactively update prior fiscal years (FY24 remains parent pricing)
 * - Fiscal years are organization-wide (same FY start month for all contracts)
 * - All products from all contracts in hierarchy are included
 *
 * Performance:
 * - Uses batched relationships (fetched once for entire org) to avoid N+1 queries
 * - Builds hierarchy map in-memory from relationships
 * - Only ~5% of contracts have relationships, so this is highly efficient
 *
 * @param contracts - Array of contracts (without embedded relationships)
 * @param fiscalYearStartMonth - Organization's fiscal year start month (1=Jan, 7=Jul, etc.)
 * @param allRelationships - Pre-fetched relationships for the entire organization
 * @returns Array of synthetic contracts with merged product pricing
 */
function mergeProductsFromAmendments(
  contracts: any[],
  fiscalYearStartMonth: number = 1,
  allRelationships: any[] = [],
): any[] {
  if (!contracts || contracts.length === 0) return [];

  // Build hierarchy map from batched relationships (in-memory, no queries)
  const hierarchyMap = buildContractHierarchyMap(contracts, allRelationships);

  // Create a map for quick contract lookups
  const contractsMap = new Map(contracts.map((c) => [c.id, c]));

  const allInventoryItems: any[] = [];
  const processedProducts = new Set<string>(); // "metadataSourceId-productId"

  contracts.forEach((contract) => {
    if (!contract.vendor_products_details?.length) return;

    contract.vendor_products_details.forEach((productDetail: any) => {
      const productId = productDetail.vendor_products?.id;
      if (!productId) return;

      // Find topmost parent that has this product (if any)
      const topmostParentWithProduct = findTopmostParentWithProduct(
        contract.id,
        productId,
        hierarchyMap,
        contractsMap,
      );

      // Use parent's metadata if product exists there, else use this contract's metadata
      const metadataSource = topmostParentWithProduct || contract;
      const productKey = `${metadataSource.id}-${productId}`;

      // Skip if already processed from this metadata source
      if (processedProducts.has(productKey)) return;
      processedProducts.add(productKey);

      // Find deepest child from metadata source for latest pricing
      const deepestChildResult = findDeepestChildWithProduct(
        metadataSource.id,
        productId,
        hierarchyMap,
        contractsMap,
      );

      // Get ALL year variations from metadata source (parent or child's own)
      const metadataYears =
        metadataSource.vendor_products_details?.filter(
          (vp: any) => vp.vendor_products?.id === productId,
        ) || [];

      if (metadataYears.length > 0) {
        /**
         * Helper: Calculate fiscal year for a contract year
         * Fiscal years are organization-wide (same start month for all contracts)
         *
         * @returns Fiscal year number (e.g., 2024 for FY24)
         */
        const getFiscalYearForContractYear = (
          contract: any,
          contractYear: number,
        ): number | null => {
          const termStartDate = contract.term_start_date?.[0]?.date;
          if (!termStartDate) return null;

          const startDate = new Date(termStartDate);
          // Add (contractYear - 1) years to get the start of this contract year
          startDate.setFullYear(startDate.getFullYear() + (contractYear - 1));

          const month = startDate.getMonth() + 1; // 1-12
          const year = startDate.getFullYear();

          // If current month >= FY start month, we're in current calendar year's FY
          // Otherwise, we're in previous calendar year's FY
          // Example: FY starts Jul (7), date is Jun 2025 → FY2024
          // Example: FY starts Jul (7), date is Jul 2025 → FY2025
          const fiscalYear = month >= fiscalYearStartMonth ? year : year - 1;

          return fiscalYear;
        };

        // Build a map of child's fiscal years to pricing (with year numbers for specificity)
        const childFiscalYearPricing = new Map<
          number,
          { product: any; childYear: number }
        >();

        if (
          deepestChildResult &&
          deepestChildResult.contract.id !== metadataSource.id
        ) {
          const childProducts =
            deepestChildResult.contract.vendor_products_details?.filter(
              (vp: any) => vp.vendor_products?.id === productId,
            ) || [];

          childProducts.forEach((childProduct: any) => {
            const childYear = childProduct.year || 1;
            const childFY = getFiscalYearForContractYear(
              deepestChildResult.contract,
              childYear,
            );
            if (childFY !== null) {
              // If multiple child years map to same FY, keep the latest (highest) child year
              const existing = childFiscalYearPricing.get(childFY);
              if (!existing || childYear > existing.childYear) {
                childFiscalYearPricing.set(childFY, {
                  product: childProduct,
                  childYear,
                });
              }
            }
          });
        }

        /**
         * For each parent year, apply "effective FY forward" rule:
         * - Find the most recent child pricing effective as of this parent FY
         * - Child pricing in FY25 applies to FY25, FY26, FY27, etc. (forward)
         * - Child pricing in FY25 does NOT apply to FY24 (no retroactive updates)
         */
        const mergedYears = metadataYears.map((metadataYear: any) => {
          const year = metadataYear.year || 1;
          const parentFY = getFiscalYearForContractYear(metadataSource, year);

          if (parentFY === null) {
            return metadataYear; // No term date, can't calculate FY
          }

          // Find the most recent child pricing that's effective for this parent FY
          // Child is effective if: childFY <= parentFY (applies to this FY and future)
          let applicableChildPricing: {
            product: any;
            childYear: number;
          } | null = null;
          let applicableChildFY: number | null = null;

          for (const [childFY, childData] of childFiscalYearPricing) {
            if (childFY <= parentFY) {
              // This child pricing applies to this parent FY
              // Keep the most recent (highest) child FY that still applies
              if (applicableChildFY === null || childFY > applicableChildFY) {
                applicableChildPricing = childData;
                applicableChildFY = childFY;
              }
            }
          }

          if (applicableChildPricing) {
            // Use child pricing (effective FY forward)
            return {
              ...applicableChildPricing.product,
              year: year, // Keep parent's year number for display consistency
              contract_id: metadataSource.id, // Keep parent contract ID
              _replacedByChild: true, // Flag this year as replaced by amendment
              _replacedByContractId: deepestChildResult?.contract.id,
              _replacedByContractType:
                deepestChildResult?.contract.contract_types?.name || 'Contract',
            } as MergedProductDetail;
          }

          // No applicable child pricing - use parent's original pricing
          return metadataYear;
        });

        const pricingSourceId = deepestChildResult
          ? deepestChildResult.contract.id
          : metadataSource.id;
        const years = mergedYears.map((pd: any) => pd.year || 1);

        logger.info(
          {
            metadataSourceId: metadataSource.id,
            pricingSourceId,
            productId,
            yearCount: mergedYears.length,
            years,
            depth: deepestChildResult?.depth ?? 0,
            isUnique: !topmostParentWithProduct,
          },
          topmostParentWithProduct
            ? 'Using parent metadata + child pricing (effective FY forward)'
            : 'Using child metadata for unique product (all years)',
        );

        const mergedContract: MergedContract = {
          ...metadataSource, // Parent metadata OR child's own if unique
          vendor_products_details: mergedYears, // ALL year variations with updated pricing where available
          _pricingSourceContractId:
            pricingSourceId !== metadataSource.id ? pricingSourceId : undefined,
          _pricingSourceType:
            pricingSourceId !== metadataSource.id
              ? deepestChildResult?.contract.contract_types?.name || 'Contract'
              : undefined,
          _isUniqueProduct: !topmostParentWithProduct,
        };

        allInventoryItems.push(mergedContract);
      }
    });
  });

  logger.info(
    {
      originalContractCount: contracts.length,
      inventoryItemCount: allInventoryItems.length,
    },
    'Merged products from amendment chains',
  );

  return allInventoryItems;
}

interface EmbeddedOrgEmployee {
  org_unit_id: number | null;
  businessGroup?: BusinessGroupNode | null;
}

/**
 * An employee's business group is a position in the org-unit tree rather than a
 * column, so it can't be embedded in the contract query: resolve the whole tree
 * once per request and stamp each embedded employee row.
 */
async function attachEmployeeBusinessGroups(
  contracts: Array<{
    contract_users?: Array<{
      org_employees: EmbeddedOrgEmployee | null;
    }> | null;
  }>,
  organizationId: string,
  client: ReturnType<typeof createClient>,
): Promise<void> {
  const businessGroupsByLeaf = await getBusinessGroupsByLeaf(
    organizationId,
    client,
  );

  for (const contract of contracts) {
    for (const user of contract.contract_users ?? []) {
      const employee = user.org_employees;
      if (!employee) continue;
      employee.businessGroup =
        employee.org_unit_id === null
          ? null
          : (businessGroupsByLeaf.get(employee.org_unit_id) ?? null);
    }
  }
}

/**
 * Fetch contracts data with all necessary joins for inventory display
 * Based on the pattern from fetchContractsByUserRoles but simplified for inventory needs
 */
export async function fetchInventoryContractsByUserRoles({
  userMetadata,
  contractFields = [],
}: {
  userMetadata: any;
  contractFields?: string[];
}) {
  const supabase = createClient();
  const { userId, userRole, organizationId } = userMetadata;

  try {
    // Build the query with all necessary joins for inventory
    // NOTE: Relationships are fetched separately in batch to avoid N+1 queries
    let contractsQuery = supabase.from('contracts').select(`
      ${contractFields.length === 0 ? '*' : contractFields.join(',')},
      id,
      vendor_id,
      status,
      status_id,
      currency,
      ai_extraction_status,
      type_id,
      business_group,
      vendors (
        id,
        name,
        domain
      ),
      vendor_products_details:vendor_products_details!vendor_products_details_contract_id_fkey (
        *,
        vendor_products (
          id, name, product_code, delivery_method_id,
          data_delivery_types:data_delivery_types!vendor_products_delivery_method_id_fkey (
            id,
            name
          )
        )
      ),
      contract_types ( id, name ),
      contract_data_delivery_types!contract_data_delivery_types_contract_id_fkey (
        id,
        data_delivery_types!contract_data_delivery_types_data_delivery_type_id_fkey (
          id,
          name
        )
      ),
      contract_users ( id, name, email, product_id, vendor_products( id, name, product_code ), contract_id, created_at, updated_at, employee_id, region, country, division, department, cost_center, start_date, leave_date, org_employee_id, org_employees ( entity, business_unit, team, org_unit_id ) ),
      vendor_products_users:vendor_products_users!vendor_products_users_contract_id_fkey (
        id,
        product_id,
        number_of_users,
        enterprise,
        contract_id,
        vendor_products (
          id,
          name
        )
      )
    `);

    // Filter for active contracts, successful AI extraction, and exclude invoices
    contractsQuery = contractsQuery
      // Released seats are history only — exclude from the embedded roster
      .is('contract_users.released_at', null)
      .eq('status', 'active')
      .eq('status_id', 4)
      .not('ai_extraction_status', 'in', '(ai_failed,h_failed)')
      .not('type_id', 'in', typeIdInList(INVOICE_TYPE_IDS));

    // Order by vendor name for consistent grouping
    contractsQuery = contractsQuery.order('id', { ascending: true });

    // Apply user role-based filtering (now executes query and returns data)
    const { data: contracts, error } = await extendSupabaseQueryByUserRole(
      supabase,
      contractsQuery,
      userId,
      userRole,
      organizationId,
    );

    if (error) {
      logger.error({ error }, 'Error fetching inventory contracts');
      throw new Error('Failed to fetch inventory data');
    }

    if (organizationId && contracts?.length) {
      await attachEmployeeBusinessGroups(contracts, organizationId, supabase);
    }

    // Fetch ALL relationships for organization in a single batch query (avoids N+1)
    const { fetchAllRelationshipsForOrg } =
      await import('@/data/superuser/contracts');
    const allRelationships = organizationId
      ? await fetchAllRelationshipsForOrg(organizationId)
      : [];

    logger.info(
      {
        organizationId,
        contractCount: contracts?.length || 0,
        relationshipCount: allRelationships.length,
        relationshipPercentage: contracts?.length
          ? ((allRelationships.length / (contracts.length * 2)) * 100).toFixed(
              1,
            ) + '%'
          : '0%',
      },
      'Fetched inventory contracts and relationships in batch',
    );

    // Merge products from amendment chains using organization's fiscal year
    const fiscalYearStartMonth = userMetadata?.organizationFY || 1;
    const mergedContracts = mergeProductsFromAmendments(
      contracts || [],
      fiscalYearStartMonth,
      allRelationships,
    );

    return mergedContracts;
  } catch (error) {
    logger.error({ error }, 'Error in fetchInventoryContractsByUserRoles');
    throw error;
  }
}
