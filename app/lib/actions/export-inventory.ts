import { stringifyCsv } from '@/lib/csv-export/stringify';
import { formatCurrency } from '@/app/lib/utils';
import logger from '@/utils/pino';
import { getEffectiveBaseCurrency, getEffectiveDateFormat } from '@/data/users';
import { formatDate } from '@/lib/date-format';
import { orderExportColumns } from '@/lib/csv-export/order-columns';

/**
 * Maps inventory column keys to human-readable headers for CSV export
 */
const inventoryColumnHeaderMap: Record<string, string> = {
  contractId: 'Document ID',
  vendor: 'Vendor',
  productName: 'Product/Dataset/Service',
  licensesCount: 'Licenses/Seats',
  activeUsers: 'Active Users',
  deliveryMethods: 'Delivery Methods',
  businessSponsor: 'Business Sponsor',
  businessGroup: 'Business Group',
  startDate: 'Start Date',
  endDate: 'End Date',
  status: 'Status',
  cost: 'Cost',
  currency: 'Currency',
  // endUsers: 'End Users',
  utilization: 'Utilization %',
  annualIncrease: 'Annual Increase (%)',
};

/**
 * Helper function to get an inventory column's value for CSV export
 */
function getInventoryColumnValue(
  item: any,
  column: string,
  dateFormat: string,
  baseCurrency: string,
): string {
  switch (column) {
    case 'contractId':
      return item.contractId || '';

    case 'vendor':
      return item.vendor || '';

    case 'productName':
      if (Array.isArray(item.productName)) {
        return item.productName.join(', ');
      }
      return item.productName || '';

    case 'licensesCount':
      return item.licensesCount === 0
        ? '-'
        : item.licensesCount?.toString() || '0';

    case 'activeUsers':
      if (Array.isArray(item.activeUsers)) {
        return item.activeUsers.length.toString();
      }
      return '0';

    case 'deliveryMethods':
      if (Array.isArray(item.deliveryMethods)) {
        return item.deliveryMethods.join(', ');
      }
      return item.deliveryMethods || '';

    case 'businessSponsor':
      if (Array.isArray(item.businessSponsor)) {
        return item.businessSponsor.join(', ');
      }
      return item.businessSponsor || '';

    case 'businessGroup':
      return item.businessGroup?.toString() || '';

    case 'startDate':
    case 'endDate':
      return item[column] ? formatDate(item[column], dateFormat, '') : '';

    case 'status':
      return item.status || '';

    case 'cost':
      // A row is one product on one contract, so it exports its fee
      // unconverted; grouped vendor rows resolved their own denomination
      // (shared currency, else org base) when they were built (PSK-1796).
      return (
        formatCurrency(
          item.costNative ?? item.cost ?? 0,
          item.currency,
          true,
        ) || '0'
      );

    case 'currency':
      return item.currency || baseCurrency;

    case 'endUsers':
      return item.endUsers || '';

    case 'utilization':
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

    case 'annualIncrease':
      if (item.annualIncrease != null && item.annualIncrease > 0) {
        // Handle both integers and decimals properly
        const value =
          typeof item.annualIncrease === 'number'
            ? item.annualIncrease
            : parseFloat(item.annualIncrease);
        return isNaN(value) ? '' : `${value}%`;
      }
      return '';

    default:
      // Return the raw value for other columns
      return item[column]?.toString() || '';
  }
}

/**
 * Exports inventory data to CSV
 */
export async function exportInventoryCSV(
  inventoryData: any[],
  columnOrder?: string[],
): Promise<Blob> {
  const dateFormat = await getEffectiveDateFormat();
  const baseCurrency = await getEffectiveBaseCurrency();
  try {
    // Define the columns to export
    const defaultColumns = [
      'contractId',
      'vendor',
      'productName',
      'licensesCount',
      'activeUsers',
      'deliveryMethods',
      'businessSponsor',
      'businessGroup',
      'startDate',
      'endDate',
      'status',
      'cost',
      // 'endUsers',
      'annualIncrease',
    ];

    const exportColumns =
      columnOrder && columnOrder.length > 0
        ? orderExportColumns({
            visibleIds: columnOrder,
            idToKey: Object.fromEntries(
              defaultColumns
                .filter((column) => column !== 'contractId')
                .map((column) => [column, column]),
            ),
            allKeys: defaultColumns,
            leadingKeys: ['contractId'],
          })
        : defaultColumns;

    // Map columns to CSV headers
    const headers = exportColumns.map(
      (column) => inventoryColumnHeaderMap[column] || column,
    );

    // Handle both flat and grouped data structures
    const flattenInventoryData = (data: any[]): any[] => {
      const flattened: any[] = [];

      data.forEach((item) => {
        if (item.subRows && item.subRows.length > 0) {
          // This is a grouped vendor row with subrows - include all subrows
          flattened.push(...item.subRows);
        } else if (!item.isVendorGroup) {
          // This is a regular inventory item (not a vendor group header)
          flattened.push(item);
        }
        // Skip vendor group headers (isVendorGroup = true) without subRows
      });

      return flattened;
    };

    const rowsToExport = flattenInventoryData(inventoryData);

    // Build CSV rows
    const csvRows = rowsToExport.map((item) => {
      return exportColumns.map((column) =>
        getInventoryColumnValue(item, column, dateFormat, baseCurrency),
      );
    });

    // Generate the CSV string with headers and rows
    const csvContent = stringifyCsv([headers, ...csvRows], {
      header: false,
      quoted: true,
      quoted_empty: true,
      quoted_string: true,
    });

    logger.info(
      {
        csvRowsCount: csvRows.length,
      },
      `Generated inventory CSV with ${csvRows.length} data rows`,
    );

    // Convert to Blob
    return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  } catch (error) {
    console.error('Failed to generate inventory CSV:', error);
    throw new Error('Failed to generate inventory CSV');
  }
}
