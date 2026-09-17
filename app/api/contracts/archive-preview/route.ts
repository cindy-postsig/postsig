import { NextRequest, NextResponse } from 'next/server';
import {
  normalizeContractIds,
  resolveArchiveDescendants,
} from '@/lib/v2/contracts/archive';
import { requireContractUpdateAbility } from '@/app/api/contracts/_auth';
import logger from '@/utils/pino';

export async function POST(request: NextRequest) {
  const auth = await requireContractUpdateAbility();
  if (auth.error) return auth.error;
  const { userMetadata } = auth;

  try {
    const { contractIds } = await request.json();

    if (!Array.isArray(contractIds) || contractIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    const rootIds = normalizeContractIds(contractIds);

    const { nonInvoiceDescendants } = await resolveArchiveDescendants(
      userMetadata.organizationId,
      rootIds,
    );

    return NextResponse.json({ nonInvoiceDescendants });
  } catch (error) {
    logger.error({ error }, 'Error building archive preview');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
