import { NextResponse, NextRequest } from 'next/server';
import { getUserMiddleware } from '@/app/middleware/getUser';
import useController from '@/utils/useController';
import _ from 'lodash';
import { getAllOrgUsers } from '@/data/users';
import { findDuplicateDocInUsers } from '@/data/superuser/contracts';
import { ValidationError } from '../../../../lib/errors';

async function checkDuplicate(ctx: any, next: any) {
  const { fileName } = await ctx.request.json();
  const userId = _.get(ctx, ['user', 'id'], null);
  const organizationId = _.get(
    ctx,
    ['user', 'user_metadata', 'organization_id'],
    null,
  );

  try {
    const orgUserIds = organizationId
      ? await getAllOrgUsers(organizationId)
      : [userId];
    const duplicateDocs = await findDuplicateDocInUsers(orgUserIds, fileName);

    if (duplicateDocs.length > 0) {
      const doc = duplicateDocs[0];
      if (!doc.contract_id || !doc.file_path) {
        throw new ValidationError(
          'The document is not associated with any contract',
          'file_association',
        );
      }
      return NextResponse.json({
        success: true,
        isDuplicate: true,
        contractId: doc.contract_id,
        currentFilePath: doc.file_path,
      });
    }

    return NextResponse.json({ success: true, isDuplicate: false });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return useController(
    [getUserMiddleware, checkDuplicate],
    request,
    NextResponse.next,
  );
}
