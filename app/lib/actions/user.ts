'use server';

import { verifyUser } from '@/app/lib/actions/supabase';
import { updateUserMetadata } from '@/app/lib/actions/supabase';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { createClient } from '@/utils/supabase/server';
import { updateUserFtuxStatus } from '@/data/users';
import {
  auditLogger,
  getUserAuditContext,
  extractAuditContext,
} from '@/lib/audit';

import { redirect } from 'next/navigation';
import logger from '@/utils/pino';

export async function resetAccount() {
  try {
    await verifyUser();
    await updateUserMetadata({ show_ftux: true });
  } catch (error) {
    logger.error({ error }, 'Error verifying user:');
    throw error;
  }
}

export async function fetchInviteData(token: string) {
  const supabase = createServiceClient();

  try {
    const { data, error } = await supabase
      .from('app_invites')
      .select<
        string,
        { expired: boolean; [key: string]: any }
      >('*, organizations ( name ), users ( name, email )')
      .eq('token', token)
      .single();

    if (error) {
      logger.error({ error }, 'Error fetching invite');
      redirect('/login');
    }

    if (data.expired) {
      redirect('/login?message=Invite has expired. Please request a new one.');
    }

    return data;
  } catch (error) {
    logger.error({ error }, 'Error in fetch invite action');
    throw error;
  }
}

export async function verifyInvite(token: string) {
  const supabase = await createClient();
  const serviceClient = createServiceClient();

  try {
    const context = await getUserAuditContext();

    const { error } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: token,
    });

    if (error) {
      logger.error({ error }, 'Error verifying invite');

      // Log failed invitation verification
      await auditLogger.logEvent({
        action: 'INVITATION_DECLINED',
        resourceType: 'app_invites',
        resourceId: token,
        context: {
          ...context,
          metadata: {
            reason: 'Invalid or expired token',
            error: error.message,
          },
        },
      });

      redirect(
        '/login?message=Invitation link expired. Please request a new one.',
      );
    }

    const { error: updateError } = await serviceClient
      .from('app_invites')
      // @ts-ignore - Supabase service client type inference issue
      .update({ expired: true })
      .eq('token', token);

    if (updateError) {
      logger.error({ error: updateError }, 'Error verifying invite');
    }

    // Log successful invitation acceptance
    await auditLogger.logEvent({
      action: 'INVITATION_ACCEPTED',
      resourceType: 'app_invites',
      resourceId: token,
      context: {
        ...context,
        metadata: {
          inviteToken: token,
        },
      },
    });

    redirect('/signup');
  } catch (error) {
    logger.error({ error }, 'Error in verify invite action');
    throw error;
  }
}

export async function markFtuxAsSeen(ftuxKey: string) {
  try {
    await verifyUser();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not found');
    }

    const result = await updateUserFtuxStatus(user.id, ftuxKey, true);

    if (!result.success) {
      throw new Error('Failed to update FTUX status');
    }

    return { success: true };
  } catch (error) {
    console.error('Error marking FTUX as seen:', error);
    throw error;
  }
}
