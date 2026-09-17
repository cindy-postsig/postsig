interface ExportAuditDetails {
  format?: 'csv' | 'xlsx';
  rowCount?: number;
  resourceIds?: Array<string | number>;
  reportType?: string;
  filename?: string;
  [key: string]: unknown;
}

export async function logExportBeacon(
  source: string,
  details?: ExportAuditDetails,
): Promise<void> {
  try {
    await fetch('/api/audit/log-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, ...details }),
      keepalive: true,
    });
  } catch {
    // best-effort: never block export on audit failure
  }
}
