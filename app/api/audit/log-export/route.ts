import { NextRequest, NextResponse } from 'next/server';
import {
  auditLogger,
  extractAuditContext,
  getUserAuditContext,
} from '@/lib/audit';
import logger from '@/utils/pino';

interface LogExportBody {
  source?: string;
  format?: 'csv' | 'xlsx';
  rowCount?: number;
  resourceIds?: Array<string | number>;
  reportType?: string;
  filename?: string;
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const userContext = await getUserAuditContext();
    if (!userContext.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Legitimate beacon payloads are a few hundred bytes; details lands in
    // the audit jsonb column, so bound it before parsing.
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 4096) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    let body: LogExportBody;
    try {
      body = JSON.parse(raw) as LogExportBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const { source, ...details } = body;

    if (!source || typeof source !== 'string') {
      return NextResponse.json(
        { error: 'source is required' },
        { status: 400 },
      );
    }

    const context = extractAuditContext(request, userContext);
    await auditLogger.logExportEvent(source, context, details);

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ error }, 'Failed to log export event');
    return NextResponse.json(
      { error: 'Failed to log export event' },
      { status: 500 },
    );
  }
}
