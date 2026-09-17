import { stringifyCsv } from '@/lib/csv-export/stringify';
import { formatCurrency } from '@/app/lib/utils';
import logger from '@/utils/pino';
import { createClient } from '@/utils/supabase/service_server';
import { getEffectiveDateFormat } from '@/data/users';
import { formatDate } from '@/lib/date-format';
import { orderExportColumns } from '@/lib/csv-export/order-columns';

/**
 * Contract scope/permission fields fetched from the DB for the active users export
 */
interface ContractScopeFields {
  geo_restrictions: string | null;
  exclusivity_terms: string | null;
  distribution_rights: string | null;
  derivative_works: string | null;
  ai_training_restrictions: string | null;
  marketing_rights: string | null;
  activities: string | null;
  internal_external_users: string | null;
  number_of_users: string | null;
  scope_of_use: string | null;
}

const SCOPE_FIELDS_SELECT = [
  'id',
  'geo_restrictions',
  'exclusivity_terms',
  'distribution_rights',
  'derivative_works',
  'ai_training_restrictions',
  'marketing_rights',
  'activities',
  'internal_external_users',
  'number_of_users',
  'scope_of_use',
].join(',');

const activeUsersColumnHeaders: Record<string, string> = {
  // Contract / inventory fields
  contractId: 'Document ID',
  vendor: 'Vendor',
  productName: 'Product/Dataset/Service',
  licensesCount: 'Licenses/Seats',
  activeUsersCount: 'Active Users',
  deliveryMethods: 'Delivery Methods',
  businessSponsor: 'Business Sponsor',
  // businessGroup: 'Business Group',
  startDate: 'Start Date',
  endDate: 'End Date',
  status: 'Status',
  cost: 'Cost',
  // currency: 'Currency',
  // endUsers: 'End Users',
  // utilization: 'Utilization %',
  annualIncrease: 'Annual Increase (%)',
  // Permissions & Scope of Use fields
  geoRestrictions: 'Geographic Restrictions',
  // exclusivityTerms: 'Exclusivity Terms',
  distributionRights: 'Distribution Rights',
  derivativeWorks: 'Derivative Works',
  // aiTrainingRestrictions: 'AI Training Restrictions',
  // marketingRights: 'Marketing Rights',
  activities: 'Activities',
  internalExternalUsers: 'User Type',
  // numberOfUsers: 'Number of Users',
  // scopeOfUse: 'Scope of Use',
  // Active user fields
  userName: 'User Name',
  userEmail: 'User Email',
  userEmployeeId: 'Employee ID',
  userRegion: 'Region',
  userCountry: 'Country',
  userDivision: 'Division',
  userDepartment: 'Department',
  userCostCenter: 'Cost Center',
  userGroup: 'User Group',
  userStartDate: 'User Start Date',
  userLeaveDate: 'User Leave Date',
};

const exportColumns = Object.keys(activeUsersColumnHeaders);

const LIST_VIEW_ID_TO_ACTIVE_USERS_KEY: Record<string, string> = {
  vendor: 'vendor',
  productName: 'productName',
  licensesCount: 'licensesCount',
  activeUsers: 'activeUsersCount',
  deliveryMethods: 'deliveryMethods',
  startDate: 'startDate',
  endDate: 'endDate',
  status: 'status',
  cost: 'cost',
  businessSponsor: 'businessSponsor',
};

function flattenInventoryData(data: any[]): any[] {
  const flattened: any[] = [];

  data.forEach((item) => {
    if (item.subRows && item.subRows.length > 0) {
      flattened.push(...item.subRows);
    } else if (!item.isVendorGroup) {
      flattened.push(item);
    }
  });

  return flattened;
}

async function fetchContractScopeFields(
  contractIds: number[],
): Promise<Map<number, ContractScopeFields>> {
  const scopeMap = new Map<number, ContractScopeFields>();

  if (contractIds.length === 0) return scopeMap;

  const supabase = createClient();

  const batchSize = 100;
  for (let i = 0; i < contractIds.length; i += batchSize) {
    const batch = contractIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('contracts')
      .select(SCOPE_FIELDS_SELECT)
      .in('id', batch);

    if (error) {
      logger.error(
        { error, batchStart: i },
        'Failed to fetch contract scope fields for active users export',
      );
      continue;
    }

    if (data) {
      data.forEach((row: any) => {
        scopeMap.set(row.id, {
          geo_restrictions: row.geo_restrictions,
          exclusivity_terms: row.exclusivity_terms,
          distribution_rights: row.distribution_rights,
          derivative_works: row.derivative_works,
          ai_training_restrictions: row.ai_training_restrictions,
          marketing_rights: row.marketing_rights,
          activities: row.activities,
          internal_external_users: row.internal_external_users,
          number_of_users: row.number_of_users,
          scope_of_use: row.scope_of_use,
        });
      });
    }
  }

  return scopeMap;
}

function getUtilization(item: any): string {
  if (item.activeUsers && item.licensesCount && item.licensesCount > 0) {
    const activeUserCount = Array.isArray(item.activeUsers)
      ? item.activeUsers.length
      : item.activeUsers;
    const utilization = Math.round(
      (activeUserCount / item.licensesCount) * 100,
    );
    return `${utilization}%`;
  }
  return '0%';
}

/**
 * Get column value for a row in the active users export
 */
function getColumnValue(
  item: any,
  scope: ContractScopeFields | undefined,
  user: any | null,
  column: string,
  dateFormat: string,
): string {
  switch (column) {
    // Contract / inventory fields
    case 'contractId':
      return item.contractId || '';
    case 'vendor':
      return item.vendor || '';
    case 'productName':
      return Array.isArray(item.productName)
        ? item.productName.join(', ')
        : item.productName || '';
    case 'licensesCount':
      return item.licensesCount === 0
        ? '-'
        : item.licensesCount?.toString() || '0';
    case 'activeUsersCount':
      return Array.isArray(item.activeUsers)
        ? item.activeUsers.length.toString()
        : '0';
    case 'deliveryMethods':
      return Array.isArray(item.deliveryMethods)
        ? item.deliveryMethods.join(', ')
        : item.deliveryMethods || '';
    case 'businessSponsor':
      return Array.isArray(item.businessSponsor)
        ? item.businessSponsor.join(', ')
        : item.businessSponsor || '';
    case 'businessGroup':
      return item.businessGroup?.toString() || '';
    case 'startDate':
    case 'endDate':
      return item[column] ? formatDate(item[column], dateFormat, '') : '';
    case 'status':
      return item.status || '';
    case 'cost':
      return formatCurrency(item.cost || 0, item.currency, true) || '0';
    case 'currency':
      return item.currency || '';
    case 'endUsers':
      return item.endUsers || '';
    case 'utilization':
      return getUtilization(item);
    case 'annualIncrease':
      if (item.annualIncrease != null && item.annualIncrease > 0) {
        const value =
          typeof item.annualIncrease === 'number'
            ? item.annualIncrease
            : parseFloat(item.annualIncrease);
        return isNaN(value) ? '' : `${value}%`;
      }
      return '';

    // Scope / permission fields (from contract DB)
    case 'geoRestrictions':
      return scope?.geo_restrictions || '';
    case 'exclusivityTerms':
      return scope?.exclusivity_terms || '';
    case 'distributionRights':
      return scope?.distribution_rights || '';
    case 'derivativeWorks':
      return scope?.derivative_works || '';
    case 'aiTrainingRestrictions':
      return scope?.ai_training_restrictions || '';
    case 'marketingRights':
      return scope?.marketing_rights || '';
    case 'activities':
      return scope?.activities || '';
    case 'internalExternalUsers':
      return scope?.internal_external_users || '';
    case 'numberOfUsers':
      return scope?.number_of_users || '';
    case 'scopeOfUse':
      return scope?.scope_of_use || '';

    // Active user fields
    case 'userName':
      return user?.name || '';
    case 'userEmail':
      return user?.email || '';
    case 'userEmployeeId':
      return user?.employee_id || '';
    case 'userRegion':
      return user?.region || '';
    case 'userCountry':
      return user?.country || '';
    case 'userDivision':
      return user?.division || '';
    case 'userDepartment':
      return user?.department || '';
    case 'userCostCenter':
      return user?.cost_center || '';
    case 'userGroup':
      return user?.businessGroup?.name || '';
    case 'userStartDate':
      return user?.start_date
        ? formatDate(user.start_date, dateFormat, '')
        : '';
    case 'userLeaveDate':
      return user?.leave_date
        ? formatDate(user.leave_date, dateFormat, '')
        : '';

    default:
      return '';
  }
}

/**
 * Exports inventory data with active users to CSV
 *
 * Each active user gets its own row, with contract details repeated
 * Items with no active users still get one row (with empty user fields)
 * Includes permissions and scope-of-use fields fetched from the contracts table
 */
export async function exportInventoryWithActiveUsersCSV(
  inventoryData: any[],
  columnOrder?: string[],
): Promise<Blob> {
  const dateFormat = await getEffectiveDateFormat();
  try {
    const flatItems = flattenInventoryData(inventoryData);

    // Collect unique contract IDs to fetch scope fields
    const contractIds = [
      ...new Set(
        flatItems
          .map((item) => {
            const id = parseInt(item.contractId, 10);
            return isNaN(id) ? null : id;
          })
          .filter((id): id is number => id !== null),
      ),
    ];

    // Fetch scope/permission fields from the DB
    const scopeFieldsMap = await fetchContractScopeFields(contractIds);

    const columns =
      columnOrder && columnOrder.length > 0
        ? orderExportColumns({
            visibleIds: columnOrder,
            idToKey: LIST_VIEW_ID_TO_ACTIVE_USERS_KEY,
            allKeys: exportColumns,
            leadingKeys: ['contractId'],
          })
        : exportColumns;

    // Build headers
    const headers = columns.map((col) => activeUsersColumnHeaders[col] || col);

    // Build rows: one per active user, or one row if no active users
    const csvRows: string[][] = [];

    for (const item of flatItems) {
      const contractIdNum = parseInt(item.contractId, 10);
      const scope = isNaN(contractIdNum)
        ? undefined
        : scopeFieldsMap.get(contractIdNum);
      const activeUsers = Array.isArray(item.activeUsers)
        ? item.activeUsers
        : [];

      if (activeUsers.length === 0) {
        // Include the item with empty user fields
        csvRows.push(
          columns.map((col) =>
            getColumnValue(item, scope, null, col, dateFormat),
          ),
        );
      } else {
        for (const user of activeUsers) {
          csvRows.push(
            columns.map((col) =>
              getColumnValue(item, scope, user, col, dateFormat),
            ),
          );
        }
      }
    }

    const csvContent = stringifyCsv([headers, ...csvRows], {
      header: false,
      quoted: true,
      quoted_empty: true,
      quoted_string: true,
    });

    logger.info(
      {
        inventoryItems: flatItems.length,
        csvRowsCount: csvRows.length,
        contractsWithScopeFields: scopeFieldsMap.size,
      },
      'Generated inventory with active users CSV',
    );

    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  } catch (error) {
    logger.error(
      { error },
      'Failed to generate inventory with active users CSV',
    );
    throw new Error('Failed to generate inventory with active users CSV');
  }
}
