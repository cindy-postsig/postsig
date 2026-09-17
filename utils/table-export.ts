import { Table } from '@tanstack/react-table';
import { stringifyCsv } from '@/lib/csv-export/stringify';
import { handleDownload } from '@/app/lib/utils';
import { getInvoiceStatusLabel } from '@/constants/invoiceStatus';
import { formatDate, DATE_FORMAT_DEFAULT } from '@/lib/date-format';
import { STRUCTURAL_COLUMN_IDS } from '@/components/contracts/columnLayout';

interface ExportOptions {
  expandProductSubRows?: boolean;
}

/**
 * Column ids whose raw accessor value is a date. The table cells render these
 * through the user's date-fns pattern, so the CSV must do the same instead of
 * emitting the raw ISO value.
 */
const DATE_COLUMN_IDS = new Set([
  'termStartDate',
  'termEndDate',
  'cancelByDate',
  'extendedTermEndDate',
]);

/**
 * Exports a TanStack Table to CSV format using the exact data visible in the table
 */
export async function exportTableToCSV<TData extends Record<string, any>>(
  table: Table<TData>,
  filename: string,
  options: ExportOptions = {},
): Promise<void> {
  const { expandProductSubRows = false } = options;

  // Date columns render through the user's pattern in the table; mirror that
  // in the CSV using the same resolved format exposed on the table meta.
  const dateFormat =
    (table.options.meta as { userMetadata?: { dateFormat?: string } })
      ?.userMetadata?.dateFormat ?? DATE_FORMAT_DEFAULT;

  const columns = table
    .getVisibleLeafColumns()
    .filter((col) => !STRUCTURAL_COLUMN_IDS.has(col.id));

  // Build headers - add Contract ID first, then the rest
  const headers = [
    'Contract ID',
    ...columns.map((col) => {
      const columnDef = col.columnDef;

      // If header is a string, use it directly
      if (typeof columnDef.header === 'string') {
        return columnDef.header;
      }

      // If header is a function (like ColumnHeader component), try to extract the title
      if (typeof columnDef.header === 'function') {
        // Try to render the header and extract title from props. Headers may
        // vary their title by table context (e.g. invoice views rename the term
        // dates), so pass the table through rather than the column alone.
        const headerElement = columnDef.header({ column: col, table } as any);

        // Check if it's a React element with props.title
        if (
          headerElement &&
          typeof headerElement === 'object' &&
          'props' in headerElement
        ) {
          const title = (headerElement.props as any)?.title;
          if (title) return title;
        }
      }

      // Fallback to column ID
      return col.id;
    }),
  ];

  // Get filtered rows
  const filteredRows = table.getFilteredRowModel().rows;

  // Build data rows
  const dataRows: string[][] = [];

  const rowsToExport = filteredRows.flatMap((row) => {
    if (row.original.isGroup && row.subRows && row.subRows.length > 0) {
      return row.subRows;
    }
    return [row];
  });

  rowsToExport.forEach((row) => {
    const rowData = row.original;

    // Check if we should expand product subrows
    if (expandProductSubRows && row.subRows && row.subRows.length > 0) {
      const hasProductRows = row.subRows.some(
        (subRow) => subRow.original.isProductRow,
      );

      if (hasProductRows) {
        // Export each product subrow (using TanStack Row objects to respect filtering)
        row.subRows
          .filter((subRow) => subRow.original.isProductRow)
          .forEach((subRow) => {
            const subRowData = subRow.original;

            const csvRow = [
              (
                subRowData.contract_id ||
                rowData.contract_id ||
                rowData.id ||
                ''
              ).toString(),
              ...columns.map((col) => {
                let value;

                // Special handling for product subrows:
                // Product name - extract from vendor_products structure
                if (col.id === 'product') {
                  value = subRowData.vendor_products?.name || '';
                }
                // Budget columns - use subrow's fees (not parent's aggregated totals)
                else if (
                  col.id === 'currentBudget' ||
                  col.id === 'projectedBudget'
                ) {
                  value = subRowData.compoundedFees || subRowData.fees || 0;
                }
                // For all other columns, try subRow.getValue first (respects accessorFn)
                // then fallback to parent row.getValue
                else {
                  try {
                    value = subRow.getValue(col.id);
                    // If subrow returns undefined/null, use parent value
                    if (value === undefined || value === null || value === '') {
                      value = row.getValue(col.id);
                    }
                  } catch {
                    // If getValue fails (column not accessible on subrow), use parent
                    value = row.getValue(col.id);
                  }
                }

                return formatValue(value, col.id, dateFormat);
              }),
            ];
            dataRows.push(csvRow);
          });
        return; // Skip adding parent row
      }
    }

    // Add the regular row (no product subrows)
    // Use row.getValue() which runs the column's accessorFn automatically
    const csvRow = [
      (rowData.contract_id || rowData.id || '').toString(),
      ...columns.map((col) => {
        // Use getValue to get the processed value from the column's accessorFn
        const value = row.getValue(col.id);
        return formatValue(value, col.id, dateFormat);
      }),
    ];
    dataRows.push(csvRow);
  });

  // Generate CSV string
  const csvContent = stringifyCsv([headers, ...dataRows], {
    header: false,
    quoted: true,
    quoted_empty: true,
    quoted_string: true,
  });

  // Create blob and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  await handleDownload(blob, filename);
}

/**
 * Simple value formatter - converts any value to a string suitable for CSV
 */
function formatValue(
  value: any,
  columnId?: string,
  dateFormat: string = DATE_FORMAT_DEFAULT,
): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (columnId === 'invoiceStatus') {
    return getInvoiceStatusLabel(value);
  }
  if (
    columnId &&
    DATE_COLUMN_IDS.has(columnId) &&
    (typeof value === 'string' || value instanceof Date)
  ) {
    // Fall back to the raw value when it isn't a parseable date, mirroring the
    // table cell's behaviour.
    return formatDate(value, dateFormat, String(value));
  }
  // Handle numeric values that should be displayed as-is (already formatted by columns)
  if (typeof value === 'number') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'object' ? v.name || '' : v))
      .join(', ');
  }
  if (typeof value === 'object') {
    return value.name || value.label || '';
  }
  return value.toString();
}
