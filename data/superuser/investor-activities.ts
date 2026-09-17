'use server';

import { createClient } from '@/utils/supabase/service_server';
import { getUserMetadata } from '../users';
import {
  ActivityData,
  InvestorActivityType,
  LogInvestorActivityParams,
  InvestorDocumentUploadedActivityData,
} from '@/constants/types';
import { Json } from '@/database.types';
import logger from '@/utils/pino';

export async function logInvestorActivity<T extends ActivityData>({
  entityId,
  activityType,
  activityData,
  userId,
}: LogInvestorActivityParams<T> & { entityId?: number }) {
  try {
    const supabase = createClient();

    let effectiveUserId = userId;
    if (!effectiveUserId) {
      try {
        const user = await getUserMetadata();
        effectiveUserId = user?.userId;
      } catch (error) {
        logger.warn(
          { error },
          'Could not determine current user for investor activity logging',
        );
      }
    }

    const activityRecord = {
      entity_id: entityId ?? null,
      user_id: effectiveUserId,
      activity_type: activityType,
      activity_data: activityData as unknown as Json,
      module_type: 'investor',
    };

    const { error } = await supabase.from('activities').insert(activityRecord);

    if (error) {
      logger.error({ error }, 'Error logging investor activity');
      return false;
    }

    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to log investor activity');
    return false;
  }
}

export async function logDocumentUploaded({
  entityId,
  fileName,
  fileType,
  fileSize,
  filePath,
  userId,
}: {
  entityId?: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  userId?: string;
}) {
  const activityData: InvestorDocumentUploadedActivityData = {
    fileName,
    fileType,
    fileSize,
    filePath,
  };
  return logInvestorActivity({
    entityId,
    activityType: InvestorActivityType.DOCUMENT_UPLOADED,
    activityData,
    userId,
  });
}
