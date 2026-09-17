'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { SystemError, AuthorizationError } from '@/lib/errors';

export async function adminDisableMFA() {
  const supabaseService = createServiceClient();
  const supabase = await createClient();

  try {
    // Use service client to get user's MFA factors via admin API
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError) {
      logger.error(
        { error: userError, action: 'adminDisableMFA' },
        'Failed to get user data',
      );
      throw new AuthorizationError('Failed to get user data');
    }

    if (!userData.user) {
      logger.error({ action: 'adminDisableMFA' }, 'User not found');
      throw new Error('User not found');
    }

    const userId = userData.user.id;
    const { data: adminUserData, error: adminUserError } =
      await supabaseService.auth.admin.getUserById(userId);
    if (adminUserError) {
      logger.error(
        { error: adminUserError, userId, action: 'adminDisableMFA' },
        'Failed to get user data',
      );
      throw new SystemError('Failed to get user data');
    }

    if (
      !adminUserData.user?.factors ||
      adminUserData.user.factors.length === 0
    ) {
      // No MFA factors to disable
      return { success: true };
    }

    // Unenroll all MFA factors using service client
    for (const factor of adminUserData.user.factors) {
      const { error } = await supabaseService.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId,
      });

      if (error) {
        logger.error(
          { error, userId, factorId: factor.id, action: 'adminDisableMFA' },
          'Failed to delete MFA factor',
        );
        throw new SystemError(`Failed to disable MFA factor: ${error.message}`);
      }
    }

    // Update user MFA status in database
    const { error: updateError } = await (supabaseService.from('users') as any)
      .update({
        mfa_enabled: false,
        mfa_type: null,
        email_mfa_enabled: false,
        email_mfa_secret: null,
        email_mfa_last_sent: null,
        email_mfa_attempts: 0,
        email_mfa_session_verified_at: null,
        mfa_last_verified_at: null,
        backup_codes_generated: false,
        backup_codes_used: '[]',
      })
      .eq('id', userId);

    if (updateError) {
      logger.error(
        { error: updateError, userId, action: 'adminDisableMFA' },
        'Failed to update user MFA status',
      );
      throw new SystemError('Failed to update user status');
    }

    logger.info(
      { userId, action: 'adminDisableMFA' },
      'MFA disabled successfully during password reset',
    );

    return { success: true };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'adminDisableMFA' },
      'Failed to disable MFA administratively',
    );
    throw new SystemError('Failed to disable MFA administratively', error);
  }
}
