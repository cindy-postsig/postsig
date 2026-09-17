import { NextResponse } from 'next/server';
import { exportCSV } from '@/app/lib/actions/contract';
import {
  exportReportCSV,
  exportInvoiceFolderCSV,
} from '@/app/lib/actions/export-report';
import { exportInventoryCSV } from '@/app/lib/actions/export-inventory';
import { exportInventoryWithActiveUsersCSV } from '@/app/lib/actions/export-inventory-active-users';
import { getUserMetadata } from '@/data/users';
import { canExportCsv } from '@/lib/csv-export/can-export';
import { fetchContractsById } from '@/app/lib/contracts/actions';
import {
  auditLogger,
  extractAuditContext,
  getUserAuditContext,
} from '@/lib/audit';

export async function POST(req: Request) {
  try {
    // Reject export requests from trial organizations
    const userMeta = await getUserMetadata();
    if (!userMeta) {
      return NextResponse.json(
        { error: 'User metadata not found' },
        { status: 401 },
      );
    }
    if (!canExportCsv(userMeta, 'cpm')) {
      return NextResponse.json(
        { error: 'CSV export is not enabled for this organization' },
        { status: 403 },
      );
    }

    const {
      contractIds,
      reportType,
      exportType,
      inventoryData,
      columnOrder,
      format = 'csv',
    } = await req.json();

    const userContext = await getUserAuditContext();
    const auditContext = extractAuditContext(req, userContext);

    // Handle inventory export
    if (exportType === 'inventory' || exportType === 'inventoryActiveUsers') {
      if (!Array.isArray(inventoryData) || inventoryData.length === 0) {
        return NextResponse.json(
          { error: 'Inventory data is required' },
          { status: 400 },
        );
      }

      const isActiveUsers = exportType === 'inventoryActiveUsers';
      const blob = isActiveUsers
        ? await exportInventoryWithActiveUsersCSV(inventoryData, columnOrder)
        : await exportInventoryCSV(inventoryData, columnOrder);
      const filename = isActiveUsers
        ? 'inventory-active-users-export.csv'
        : 'inventory-export.csv';

      await auditLogger.logExportEvent(
        isActiveUsers ? 'inventory-active-users-csv' : 'inventory-csv',
        auditContext,
        {
          format: 'csv',
          rowCount: inventoryData.length,
          filename,
        },
      );

      return new NextResponse(blob, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    if (!Array.isArray(contractIds) || contractIds.length === 0) {
      return NextResponse.json(
        { error: 'Contract IDs are required' },
        { status: 400 },
      );
    }

    let blob;
    let source: string;

    if (reportType === 'invoices-folder') {
      const fiscalYearStartMonth = userMeta.organizationFY || 1;
      blob = await exportInvoiceFolderCSV(contractIds, fiscalYearStartMonth);
      source = 'invoices-folder-csv';
    } else if (reportType) {
      blob = await exportReportCSV(contractIds, reportType);
      source = 'report-csv';
    } else {
      const fiscalYearStartMonth = userMeta.organizationFY || 1;
      blob = await exportContractsById(
        contractIds,
        fiscalYearStartMonth,
        format,
        columnOrder,
      );
      source = format === 'xlsx' ? 'contracts-bulk-xlsx' : 'contracts-bulk-csv';
    }

    // Headers, filename, and audit row all derive from what was produced,
    // not what was requested — the reportType branches above always emit
    // CSV regardless of `format`.
    const isXlsx = source.endsWith('xlsx');
    const fileExtension = isXlsx ? 'xlsx' : 'csv';
    const contentType = isXlsx
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';
    const filename = reportType
      ? `${reportType.toLowerCase().replace(/\s+/g, '-')}-report.${fileExtension}`
      : `contracts.${fileExtension}`;

    await auditLogger.logExportEvent(source, auditContext, {
      format: isXlsx ? 'xlsx' : 'csv',
      rowCount: contractIds.length,
      resourceIds: contractIds,
      reportType,
      filename,
    });

    // Return the file as a blob
    return new NextResponse(blob, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Error exporting contracts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to export contracts' },
      { status: 500 },
    );
  }
}

async function exportContractsById(
  contractIds: number[],
  fiscalYearStartMonth: number,
  format: string = 'csv',
  columnOrder?: string[],
) {
  const contracts = await fetchContractsById({ ids: contractIds });
  if (!contracts || contracts.length === 0) {
    return null;
  }

  const validContracts = contracts.filter(Boolean);

  // Use exportCSV with format parameter
  const blob = await exportCSV({
    contracts: validContracts,
    fiscalYearStartMonth,
    format: format as 'csv' | 'xlsx',
    columnOrder,
  });

  return blob;
}
